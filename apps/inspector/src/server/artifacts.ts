import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
const json = z.json();
const count = z.number().int().nonnegative();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const contract = z.object({ name: z.string(), inputSchema: json }).passthrough();
const contracts = z.union([contract, z.array(contract).min(1)]);
const verification = z
  .object({
    verdict: z.enum(['PROMOTED', 'REJECTED', 'INCONCLUSIVE']),
    plan_hash: hash,
    policy_version: z.string(),
    gate_evidence_hash: hash,
    checks: z.array(
      z.object({
        id: z.string(),
        level: z.enum(['V0', 'V1', 'V2', 'V3']),
        passed: z.boolean(),
        detail: z.string(),
      }),
    ),
    traces_total: count,
    traces_passed: count,
    residual_risks: z.array(z.string()),
  })
  .passthrough();
const candidate = z.union([
  z
    .object({
      version: z.literal(1),
      source_tool: z.string(),
      target: json,
      steps: z.array(json),
      response: z.array(json),
    })
    .passthrough(),
  z.object({ version: z.literal(1), op: z.literal('Reject'), reason: z.string() }).passthrough(),
]);
const generationFailure = z.object({
  verdict: z.literal('INCONCLUSIVE'), plan_hash: hash, gate_evidence_hash: hash,
  error_code: z.string(),
});
const trial = z.object({
  identity: z.object({ case_id: z.string(), model: z.string(), trial: count }),
  candidate,
  gate_report: z.union([verification, generationFailure]),
  accepted: z.boolean(),
  safe_rejection: z.boolean(),
  hidden_passed: z.boolean(),
  hidden_false_compatible: z.boolean(),
  observations: z.array(json),
});
const methodCounts = z.object({
  compatible_trials: count,
  recovered: count,
  must_reject_trials: count,
  safe_rejections: count,
  false_compatible_or_success: count,
  trials: count,
});
const finalSnapshot = z.object({
  final_model_results: z.literal(true),
  results: z.array(json),
  original_run_manifest: z.object({ model: z.string(), suite_hash: hash, protocol_hash: hash }),
  summary: z.object({
    complete: z.literal(true),
    limitations: z.array(z.string()),
    methods: z.record(z.string(), z.object({ all: methodCounts })),
  }),
});
const realCase = z.object({
  project: z.string().regex(/^[a-z0-9-]+$/),
  repository: z.url(),
  old_commit: z.string().regex(/^[a-f0-9]{40}$/),
  new_commit: z.string().regex(/^[a-f0-9]{40}$/),
  old_server_old_client: z.string(),
  new_server_old_client_direct: z.string(),
  trials: count,
  successful: count,
  promoted: count,
  safe_rejections: count,
  hidden_false_compatible: count,
  limitations: z.array(z.string()),
});
const externalSummary = z.object({ cases: z.array(realCase).min(1), source_hash: hash });
const suiteSchema = z.object({
  cases: z.array(
    z.object({
      id: z.string().regex(/^[a-z0-9-]+$/),
      change_class: z.string(),
      compatibility: z.string(),
      held_out: z.boolean(),
    }),
  ),
});
const evidence = z.object({ oldContract: contract, newContracts: contracts });
const taskSchema = z.array(z.object({ id: z.string(), input: json }).passthrough());
const exportedFiles = z.object({
  files: z.record(z.string(), z.object({ source: z.string(), sha256: hash })),
});

export class ArtifactError extends Error {
  constructor(
    readonly code: 'ARTIFACT_MISSING' | 'ARTIFACT_CORRUPT',
    readonly artifact: string,
  ) {
    super(`${code}: ${artifact}. Restore the versioned artifact; no result has been substituted.`);
  }
}

export interface ArtifactReader {
  (path: string): Promise<string>;
}
export type Migration = Awaited<ReturnType<ArtifactService['migration']>>;

// The production reader is used only with paths constructed from validated catalogs below.
export class ArtifactService {
  constructor(private readonly read: ArtifactReader) {}

  private async load<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    let source: string;
    try {
      source = await this.read(path);
    } catch (error) {
      if (error instanceof ArtifactError) throw error;
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT';
      throw new ArtifactError(missing ? 'ARTIFACT_MISSING' : 'ARTIFACT_CORRUPT', path);
    }
    try {
      return schema.parse(JSON.parse(source) as unknown);
    } catch {
      throw new ArtifactError('ARTIFACT_CORRUPT', path);
    }
  }

  private async completed<T>(id: string, name: string, schema: z.ZodType<T>) {
    const manifest = await this.load('apps/inspector/data/exports.json', exportedFiles);
    const relative = `controlled/${id}/${name}`;
    const receipt = manifest.files[relative];
    const path = `apps/inspector/data/${relative}`;
    if (!receipt) throw new ArtifactError('ARTIFACT_MISSING', path);
    return this.load(path, schema).then(async (value) => {
      const bytes = await this.read(path);
      if (createHash('sha256').update(bytes).digest('hex') !== receipt.sha256)
        throw new ArtifactError('ARTIFACT_CORRUPT', path);
      return value;
    });
  }

  async benchmarkSummary() {
    const snapshot = await this.load('benchmarks/results/final-v3.json', finalSnapshot);
    return {
      model: snapshot.original_run_manifest.model,
      records: snapshot.results.length,
      suiteHash: snapshot.original_run_manifest.suite_hash,
      protocolHash: snapshot.original_run_manifest.protocol_hash,
      limitations: snapshot.summary.limitations,
      methods: Object.entries(snapshot.summary.methods).map(([id, { all }]) => ({
        id,
        name: id === 'b2v' ? 'B2-V' : id.toUpperCase(),
        recovered: all.recovered,
        compatibleTrials: all.compatible_trials,
        safeRejections: all.safe_rejections,
        mustRejectTrials: all.must_reject_trials,
        hiddenFalseSuccess: all.false_compatible_or_success,
        trials: all.trials,
      })),
    };
  }

  async realWorldResults() {
    const catalog = await this.load('apps/inspector/data/historical-catalog.json', z.object({
      version: z.literal(1),
      roots: z.array(z.string().regex(/^benchmarks\/realworld-v[1-9][0-9]*$/)).min(1),
    }).strict());
    if (new Set(catalog.roots).size !== catalog.roots.length)
      throw new ArtifactError('ARTIFACT_CORRUPT', 'apps/inspector/data/historical-catalog.json');
    const summaries = await Promise.all(catalog.roots.map(async (root) => ({
      root, summary: await this.load(`${root}/results/summary.json`, externalSummary),
    })));
    const cases = summaries.flatMap(({ root, summary }) => summary.cases.map(entry => ({ ...entry, root })));
    if (new Set(cases.map(entry => entry.project)).size !== cases.length)
      throw new ArtifactError('ARTIFACT_CORRUPT', 'apps/inspector/data/historical-catalog.json');
    return Promise.all(
      cases.map(async (entry) => {
        const base = `${entry.root}/${entry.project}`;
        const first = await this.load(`${base}/results/trial-001.json`, trial);
        const change = await this.load(
          `${base}/provenance.json`,
          z.object({ change: z.string() }).passthrough(),
        );
        return {
          id: entry.project,
          artifactBase: base,
          name:
            entry.project === 'nexus'
              ? 'Nexus-MCP'
              : entry.project === 'mindwtr'
                ? 'Mindwtr'
                : entry.project === 'mapbox'
                  ? 'Mapbox MCP'
                  : entry.project === 'fabric'
                    ? 'Microsoft Fabric MCP'
                    : entry.project,
          repository: entry.repository,
          oldCommit: entry.old_commit,
          newCommit: entry.new_commit,
          change: change.change,
          directOutcome: entry.new_server_old_client_direct,
          oldOutcome: entry.old_server_old_client,
          trials: entry.trials,
          recovered: entry.successful,
          promoted: entry.promoted,
          safeRejections: entry.safe_rejections,
          hiddenFalseCompatible: entry.hidden_false_compatible,
          limitations: entry.limitations,
          status: first.gate_report.verdict,
          rejectionReason:
            'error_code' in first.gate_report
              ? `Synthesis failed before the gate: ${first.gate_report.error_code}`
              : first.gate_report.checks
              .filter((check) => !check.passed)
              .map((check) => check.detail)
              .join('; ') || null,
        };
      }),
    );
  }

  async migrations() {
    const suite = await this.load('benchmarks/manifests/suite-v3.json', suiteSchema);
    const historical = await this.realWorldResults();
    const controlled = await Promise.all(
      suite.cases.map(async (entry) => {
        const report = await this.completed(entry.id, 'gate-report.json', verification);
        return {
          id: entry.id,
          name: entry.id.replace(/^\d+-/, '').replaceAll('-', ' '),
          category: 'CONTROLLED' as const,
          change: entry.change_class,
          status: report.verdict,
          heldOut: entry.held_out,
        };
      }),
    );
    return [
      ...controlled,
      ...historical.map((entry) => ({
        id: entry.id,
        name: entry.name,
        category: 'HISTORICAL' as const,
        change: entry.change,
        status: entry.status,
        heldOut: false,
      })),
    ];
  }

  async migration(id: string, selectedTrial = 1) {
    const catalog = await this.migrations();
    const entry = catalog.find((item) => item.id === id);
    if (!entry) return null;
    if (entry.category === 'CONTROLLED') {
      if (selectedTrial !== 1) return null; // Presentation export deliberately selects trial 1, not a new evaluation.
      const base = `benchmarks/cases/${id}`;
      const [source, plan, report, observations, tasks, result, summary, demoCapture] =
        await Promise.all([
          this.load(`${base}/synthesis/evidence.json`, evidence),
          this.completed(id, 'candidate.json', candidate),
          this.completed(id, 'gate-report.json', verification),
          this.completed(id, 'observations.json', z.array(json)),
          this.load(`${base}/tasks.json`, taskSchema),
          this.completed(
            id,
            'result.json',
            z
              .object({
                baseline: z.literal('b3'),
                case_id: z.string(),
                trial: z.literal(1),
                hidden_passed: z.boolean(),
                accepted: z.boolean(),
              })
              .passthrough(),
          ),
          this.benchmarkSummary(),
          id === '12-refund-workflow'
            ? this.load(
                'apps/inspector/data/refund-execution.json',
                z
                  .object({
                    kind: z.literal('separate-api-free-local-mcp-fixture-capture'),
                    adapter_hash: hash,
                    old_invocation: json,
                    backend_calls: z.array(json),
                    first_output: json,
                    retry_output: json,
                    final_state: json,
                  })
                  .passthrough(),
              )
            : Promise.resolve(null),
        ]);
      if (result.case_id !== id)
        throw new ArtifactError(
          'ARTIFACT_CORRUPT',
          `apps/inspector/data/controlled/${id}/result.json`,
        );
      if (demoCapture && demoCapture.adapter_hash !== report.plan_hash)
        throw new ArtifactError('ARTIFACT_CORRUPT', 'apps/inspector/data/refund-execution.json');
      return {
        ...entry,
        oldContract: source.oldContract,
        newContract: source.newContracts,
        adapterPlan: plan,
        adapterHash: report.plan_hash,
        verification: this.report(report),
        executionTrace: { kind: 'persisted-sealed-observations', tasks, observations, demoCapture },
        model: summary.model,
        promptVersion: 'bounded-plan-v6',
        trial: 1,
        availableTrials: [1],
        provenance:
          'Completed frozen controlled benchmark / B3 / trial 1. Byte-identical presentation export; no evaluation was rerun.',
        artifactSource: `runs/benchmark-v3-final-recovery/${id}/b3/trial-001`,
        sealedPassed: result.hidden_passed,
        limitations: [
          'Intermediate backend calls and per-step timings were not recorded. The call sequence shown comes from the persisted plan.',
        ],
      };
    }
    const historical = (await this.realWorldResults()).find((item) => item.id === id)!;
    if (!Number.isInteger(selectedTrial) || selectedTrial < 1 || selectedTrial > historical.trials)
      return null;
    const base = historical.artifactBase;
    const path = `${base}/results/trial-${String(selectedTrial).padStart(3, '0')}.json`;
    const [oldContract, newContract, measured] = await Promise.all([
      this.load(`${base}/old-contract.json`, contract),
      this.load(`${base}/new-contract.json`, contracts),
      this.load(path, trial),
    ]);
    if (measured.identity.case_id !== id || measured.identity.trial !== selectedTrial)
      throw new ArtifactError('ARTIFACT_CORRUPT', path);
    return {
      ...entry,
      oldContract,
      newContract,
      adapterPlan: measured.candidate,
      adapterHash: measured.gate_report.plan_hash,
      verification: this.report(measured.gate_report),
      executionTrace: {
        kind: 'persisted-sealed-observations',
        observations: measured.observations,
      },
      model: measured.identity.model,
      promptVersion: 'bounded-plan-v6',
      trial: selectedTrial,
      availableTrials: Array.from({ length: historical.trials }, (_, index) => index + 1),
      provenance:
        'Separate public historical MCP evaluation. Synthetic fixtures against exact source revisions; persisted results only.',
      artifactSource: path,
      sealedPassed: measured.accepted ? measured.hidden_passed : null,
      limitations: historical.limitations,
    };
  }

  private report(report: z.infer<typeof verification> | z.infer<typeof generationFailure>) {
    if ('error_code' in report) return {
      verdict: report.verdict, policyVersion: 'NOT RUN', gateEvidenceHash: report.gate_evidence_hash,
      checks: [], tracesTotal: 0, tracesPassed: 0,
      residualRisks: [`Synthesis failed before the gate: ${report.error_code}`], raw: report,
    };
    return {
      verdict: report.verdict,
      policyVersion: report.policy_version,
      gateEvidenceHash: report.gate_evidence_hash,
      checks: report.checks,
      tracesTotal: report.traces_total,
      tracesPassed: report.traces_passed,
      residualRisks: report.residual_risks,
      raw: report,
    };
  }
}

// Works from app directory (npm --prefix / pnpm dev), with no environment/key loading.
// repositoryRoot is retained for source-file audits/tests, never runtime reads.
export const repositoryRoot = resolve(process.cwd(), '../..');
let packaged: Promise<Record<string, string>> | undefined;
export const artifacts = new ArtifactService(async (path) => {
  packaged ??= readFile(
    /* turbopackIgnore: true */ resolve(process.cwd(), '.generated/artifacts.json'), 'utf8',
  ).then((source) => z.record(z.string(), z.string()).parse(JSON.parse(source) as unknown));
  const catalog = await packaged;
  if (!Object.hasOwn(catalog, path))
    throw Object.assign(new Error('Missing versioned artifact'), { code: 'ENOENT' });
  return catalog[path];
});
