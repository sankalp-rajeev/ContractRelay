import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { hashContract, hashJson } from '@contractrelay/contracts';
import { hashContractSet, allowsEffects } from '@contractrelay/contracts/policy';
import { readJson, writeOnceJson } from '@contractrelay/contracts/artifacts';
import { snapshotTools } from '@contractrelay/mcp';
import { createCompatibilityServer, createMcpInvoker } from '@contractrelay/mcp/proxy';
import { PromotionRegistry, promotionKeySchema } from '@contractrelay/runtime';
import { AdapterError } from '../compiler/src/index.js';
import { assertPromotableReport } from '@contractrelay/verifier';
import { verifyIsolated } from '@contractrelay/verifier/isolated';
import { adapterPlanSchema } from '../dsl/src/index.js';
import type { AdapterPlan } from '../dsl/src/index.js';
import type { SynthesisEvidence } from '../synthesizer/src/index.js';
import { artifactPaths, connectTarget, exists, object, prepareMigration, readContext, text } from './product-context.js';
import type { MigrationContext } from './product-context.js';

const help = `ContractRelay — snapshot-first compatibility CLI

  contractrelay migrate --old old-tools.json --new new-tools.json --out adapter.json
  contractrelay verify --plan adapter.json
  contractrelay serve --plan adapter.json

migrate: proposes a bounded plan; only this command may call Gemini.
  --evidence FILE   Operator metadata, synthesis documents, gate and target command.
                    Default: <old snapshot>.evidence.json
  --tool NAME       Select the old interface when the snapshot has several tools.
verify: runs the existing isolated gate, then promotes on PASS. No model calls.
serve: requires the saved verified receipt; exposes the old interface over MCP stdio.

JSON tools/list snapshots and read-only targets are supported. Snapshot hints are
not trusted effect metadata. Writes still require the existing isolated fixture API.
Plans retain .context.json, .verified.json and .registry companions; keep them together.
Exit codes: 0 success, 2 rejection, 1 input/operation error. --help prints this text.

From this checkout use pnpm contractrelay <command> (or node bin/contractrelay.mjs).
API-free example:
  pnpm contractrelay verify --plan examples/cli/weather/adapter.json
  pnpm contractrelay serve --plan examples/cli/weather/adapter.json
See docs/cli.md for the evidence format and Gemini setup.
`;

interface CliIO { out(message: string): void; err(message: string): void }
interface Dependencies { synthesize?(evidence: SynthesisEvidence, directory: string): Promise<AdapterPlan> }
const defaultIO: CliIO = { out: message => process.stdout.write(message), err: message => process.stderr.write(message) };

async function synthesize(evidence: SynthesisEvidence, directory: string): Promise<AdapterPlan> {
  const { GeminiProvider, QuotaScheduler, loadModelConfig } = await import('../synthesizer/src/index.js');
  const { synthesizeIsolated } = await import('../synthesizer/src/isolated.js');
  const { structuralSynthesisPromptVersion } = await import('../synthesizer/src/structural.js');
  if (!process.env.GEMINI_API_KEY) {
    try { process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  if (!process.env.GEMINI_API_KEY?.trim()) throw new Error('MISSING_GEMINI_API_KEY: set it locally for migrate; verify/serve need no key');
  const config = await loadModelConfig();
  const scheduler = new QuotaScheduler(directory, new GeminiProvider(process.env.GEMINI_API_KEY), config.budget, { cache: config.cache, maxConcurrency: 1 });
  return synthesizeIsolated(scheduler, evidence, { jobId: `cli/${structuralSynthesisPromptVersion}/${hashJson(evidence)}`, mode: config.mode, model: config.budget.model, resume: true, capabilities: 'structural-v1' });
}

async function readCandidate(planPath: string) {
  const plan = adapterPlanSchema.parse(await readJson(artifactPaths(planPath).plan));
  const context = await readContext(planPath);
  if (context.planHash !== hashJson(plan)) throw new Error('PLAN_CHANGED: migrate to a new output path before verification');
  return { plan, context };
}
async function readVerified(planPath: string, context: MigrationContext) {
  const paths = artifactPaths(planPath);
  if (!await exists(paths.verified)) throw new Error('PLAN_NOT_VERIFIED: run contractrelay verify --plan first');
  const raw = object(await readJson(paths.verified));
  const key = promotionKeySchema.parse(raw.key);
  const report = assertPromotableReport(raw.report);
  if (raw.version !== 1 || raw.contextHash !== hashJson(context) || key.adapterPlanHash !== context.planHash
    || key.oldContractHash !== hashContract(context.oldContract) || key.newContractHash !== hashContractSet(context.newContracts)
    || key.policyVersion !== 'read-only-v1' || report.plan_hash !== context.planHash || report.gate_evidence_hash !== hashJson(context.gateEvidence))
    throw new Error('VERIFIED_CONTEXT_CHANGED: verification receipt does not match this plan and context');
  const registryEntry = resolve(paths.registry, hashJson(key));
  if (!await exists(resolve(registryEntry, 'promotion.manifest.json'))) throw new Error('PROMOTION_MISSING: restore the registry companion');
  if (await exists(resolve(registryEntry, 'revoked.json'))) throw new Error('PROMOTION_REVOKED: use a fresh output path and verify again');
  return { key, report };
}
async function assertCurrentTarget(client: Awaited<ReturnType<typeof connectTarget>>, context: MigrationContext) {
  const current = await snapshotTools(client, context.snapshot);
  if (hashContractSet(current.tools) !== hashContractSet(context.newContracts)) throw new Error('TARGET_CONTRACT_DRIFT: target tools/list differs from the saved snapshot');
}

export async function runCli(args: string[], io: CliIO = defaultIO, dependencies: Dependencies = {}): Promise<number> {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) { io.out(help); return 0; }
  const command = args[0];
  try {
    if (!['migrate', 'verify', 'serve'].includes(command ?? '')) throw new Error('Unknown command; run contractrelay --help');
    const options = command === 'migrate' ? { old: { type: 'string' as const }, new: { type: 'string' as const }, out: { type: 'string' as const }, evidence: { type: 'string' as const }, tool: { type: 'string' as const } }
      : { plan: { type: 'string' as const } };
    const { values } = parseArgs({ args: args.slice(1), options, strict: true, allowPositionals: false });
    if (command === 'migrate') {
      const old = resolve(text(values.old, '--old'));
      const next = resolve(text(values.new, '--new'));
      const out = resolve(text(values.out, '--out'));
      const paths = artifactPaths(out);
      if (await exists(paths.plan) || await exists(paths.context)) throw new Error('OUTPUT_EXISTS: choose a new --out path; existing artifacts are not overwritten');
      const evidence = resolve(typeof values.evidence === 'string' ? values.evidence : `${old}.evidence.json`);
      if (!await exists(evidence)) {
        // Validate the supplied snapshots even when no behavioral evidence exists.
        await snapshotTools({ listTools: () => readJson(old) }, { namespace: 'cli/old', source: old });
        await snapshotTools({ listTools: () => readJson(next) }, { namespace: 'cli/new', source: next });
        const reason = `Snapshots alone cannot establish behavior or effect permissions. Supply --evidence FILE (or ${evidence}).`;
        await writeOnceJson(out, { version: 1, op: 'Reject', reason, missing_evidence: ['Operator metadata and independent gate evidence'], risk: 'Unverified compatibility' });
        io.out(`REJECT ${reason}\nPlan: ${out}\n`); return 2;
      }
      const prepared = await prepareMigration({ old, new: next, evidence, out, ...(typeof values.tool === 'string' ? { tool: values.tool } : {}) });
      const plan = !allowsEffects([prepared.context.oldContract, ...prepared.context.newContracts], 'read-only-v1')
        ? adapterPlanSchema.parse({ version: 1, op: 'Reject', reason: 'The snapshot CLI requires explicit READ_ONLY metadata for every selected tool; write migrations need an isolated fixture policy.', missing_evidence: ['Read-only effect classification'], risk: 'Unknown or unsupported effects' })
        : await (dependencies.synthesize ?? synthesize)(prepared.synthesis, paths.synthesis);
      const candidate = adapterPlanSchema.parse(plan);
      const context = { ...prepared.context, planHash: hashJson(candidate) };
      await writeOnceJson(paths.context, context);
      await writeOnceJson(out, candidate);
      if ('op' in candidate) { io.out(`REJECT ${candidate.reason}\nPlan: ${out}\n`); return 2; }
      io.out(`CANDIDATE ${context.planHash}\nPlan: ${out}\nRun contractrelay verify --plan ${JSON.stringify(out)} before serving.\n`);
      return 0;
    }
    const file = resolve(text(values.plan, '--plan'));
    const rawPlan = adapterPlanSchema.parse(await readJson(file));
    if ('op' in rawPlan) { (command === 'serve' ? io.err : io.out)(`REJECT ${rawPlan.reason}\n`); return 2; }
    const { plan, context } = await readCandidate(file);
    if (command === 'serve') await readVerified(file, context); // Refuse before starting a target.
    const target = await connectTarget(file, context);
    try {
      await assertCurrentTarget(target, context);
      const paths = artifactPaths(file);
      const registry = new PromotionRegistry(paths.registry);
      if (command === 'verify') {
        if (await exists(paths.verified)) await readVerified(file, context);
        const input = { plan, oldContract: context.oldContract, newContract: context.newContracts, gateEvidence: context.gateEvidence,
          invoke: createMcpInvoker(target), policyVersion: 'read-only-v1' as const };
        const report = await verifyIsolated(input);
        const revokePrevious = async () => {
          if (await exists(paths.verified)) {
            const previous = await readVerified(file, context);
            await registry.invalidate(previous.key, 'A subsequent explicit CLI verification rejected this promotion');
          }
        };
        for (const check of report.checks) io.out(`${check.level} ${check.passed ? 'PASS' : 'FAIL'} ${check.detail}\n`);
        if (report.verdict !== 'PROMOTED') {
          await revokePrevious();
          io.out(`REJECT ${report.residual_risks.join('; ') || 'Existing gate did not pass'}\n`); return 2;
        }
        let key;
        try { key = await registry.promote({ ...input, report }); }
        catch (error) {
          if (!(error instanceof AdapterError) || error.code !== 'PROMOTION_REFUSED') throw error;
          await revokePrevious();
          io.out(`REJECT ${error.message}\n`); return 2;
        }
        await writeOnceJson(paths.verified, { version: 1, contextHash: hashJson(context), key, report });
        io.out(`PASS ${report.plan_hash}\nVerified receipt: ${paths.verified}\n`); return 0;
      }
      const { key } = await readVerified(file, context);
      const proxy = createCompatibilityServer({ oldContract: context.oldContract, registry, key, target, snapshot: context.snapshot,
        targetTools: context.newContracts.map(contract => contract.name) });
      let closed = false;
      const close = async () => { if (closed) return; closed = true; await proxy.close(); await target.close(); };
      proxy.onclose = () => { void close(); };
      process.once('SIGTERM', () => { void close(); }); process.once('SIGINT', () => { void close(); });
      process.stdin.once('end', () => { void close(); });
      await proxy.connect(new StdioServerTransport());
      io.err(`Serving verified ${context.oldContract.name} over MCP stdio.\n`);
      return 0;
    } catch (error) { await target.close(); throw error; }
    finally { if (command === 'verify') await target.close(); }
  } catch (error) {
    io.err(`ERROR ${error instanceof Error ? error.message : 'CLI operation failed'}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await runCli(process.argv.slice(2));
}
