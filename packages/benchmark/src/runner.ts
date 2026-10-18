import { join } from 'node:path';
import { z } from 'zod';
import { canonicalJson, hashJson, jsonValueSchema } from '@contractrelay/contracts';
import type { JsonValue } from '@contractrelay/contracts';
import { atomicWriteJson, writeOnceJson, readJson } from '@contractrelay/contracts/artifacts';
import { compileCandidate } from '@contractrelay/compiler';
import { PromotionRegistry } from '@contractrelay/runtime';
import type { PromotionKey } from '@contractrelay/runtime';
import { verifyIsolated, verifyWrapperIsolated } from '@contractrelay/verifier/isolated';
import { assertPromotableReport } from '@contractrelay/verifier';
import { ModelRequestError, isTransientModelFailure } from '@contractrelay/synthesizer';
import type { QuotaScheduler } from '@contractrelay/synthesizer';
import { synthesizeIsolated } from '@contractrelay/synthesizer/isolated';
import { heuristicPlan, generateWrapper, replan, synthesisParity, wrapperSchema } from './baselines.js';
import type { WrapperArtifact } from './baselines.js';
import { createFixtureV3 } from './fixtures-v3.js';
import { loadBenchmarkCase, loadSuite, sealedSchema } from './suite.js';
import { trialResultSchema, summarize } from './metrics.js';
import type { TrialResult } from './metrics.js';
import type { DockerSandbox } from './sandbox.js';
import type { BaselineId } from './index.js';
import { executionFingerprint } from './fingerprint.js';

export interface BenchmarkSettings { suiteRoot: string; runRoot: string; mode: 'dev' | 'final' | 'api-free'; model: string;
  trials: number; resume: boolean; scheduler?: QuotaScheduler; sandbox?: DockerSandbox; includeHeldOut?: boolean; methods?: BaselineId[]; caseIds?: string[] }

const get = (value: JsonValue, key: string): JsonValue | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value[key] : undefined;
function matchesState(expected: Record<string, JsonValue>, actual: JsonValue): boolean {
  return Object.entries(expected).every(([key, value]) => {
    const received = get(actual, key);
    if (value && typeof value === 'object' && !Array.isArray(value)) return received !== undefined && matchesState(value, received);
    return received !== undefined && canonicalJson(value) === canonicalJson(received);
  });
}
const rejectArtifact = (reason: string) => ({ version: 1, op: 'Reject', reason, missing_evidence: [], risk: 'No adapter was accepted' });

/** Deterministic orchestration; only the scheduler is permitted to call a model. */
export async function runBenchmark(settings: BenchmarkSettings) {
  if (!Number.isSafeInteger(settings.trials) || settings.trials < 1 || settings.trials > 5) throw new Error('INVALID_TRIAL_COUNT');
  if (settings.mode === 'api-free' && (settings.methods ?? ['b1']).some((method) => method !== 'b1')) throw new Error('API_FREE_METHOD');
  if (settings.mode !== 'api-free' && !settings.scheduler) throw new Error('MISSING_SCHEDULER');
  const { suite, hash: suiteHash } = await loadSuite(settings.suiteRoot);
  const methods = settings.methods ?? (settings.mode === 'api-free' ? ['b1'] : ['b0', 'b1', 'b2', 'b2v', 'b3']);
  if (methods.includes('b2v') && !methods.includes('b2')) throw new Error('B2V_REQUIRES_EXACT_B2');
  if ((methods.includes('b2') || methods.includes('b2v')) && !settings.sandbox) throw new Error('MISSING_DOCKER_SANDBOX');
  if (settings.mode === 'final') {
    if (settings.trials < 3 || !settings.includeHeldOut || settings.caseIds || methods.join(',') !== 'b0,b1,b2,b2v,b3') throw new Error('FINAL_PROTOCOL_INCOMPLETE');
    const prerequisite = await readJson(join(settings.suiteRoot, `manifests/development-acceptance-v${suite.version}.json`)) as Record<string, unknown>;
    if (prerequisite.suite_hash !== suiteHash || prerequisite.protocol_hash !== suite.protocol_hash
      || prerequisite.all_methods_completed !== true || prerequisite.infrastructure_failures !== 0) throw new Error('FINAL_EVALUATION_NOT_READY');
  }
  const runIdentity = { version: 1, suite_hash: suiteHash, protocol_hash: suite.protocol_hash, mode: settings.mode, model: settings.model,
    trials: settings.trials, methods, cases: settings.caseIds ?? 'all', include_held_out: settings.includeHeldOut ?? false, sandbox: settings.sandbox?.config ?? null,
    ...(settings.mode === 'final' ? { execution_fingerprint: await executionFingerprint() } : {}) };
  await writeOnceJson(join(settings.runRoot, 'run-manifest.json'), runIdentity);
  const results: TrialResult[] = [];
  let quotaBlocked = false;
  let providerBlocked = false;
  let providerError: string | null = null;
  let interrupted = false;
  const interrupt = () => { interrupted = true; };
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  try {
    outer: for (const entry of suite.cases.filter((item) => (settings.includeHeldOut || !item.held_out) && (!settings.caseIds || settings.caseIds.includes(item.id)))) {
      for (let trial = 1; trial <= settings.trials; trial++) {
        let b2: WrapperArtifact | undefined;
        let b2Failed = false;
        let b2ArtifactHash: string | undefined;
        for (const method of methods) {
          if (method === 'b1' && trial > 1) continue;
          if (interrupted) break outer;
          const trialId = `${entry.id}/${method}/trial-${String(trial).padStart(3, '0')}`;
          const directory = join(settings.runRoot, trialId);
          let saved: TrialResult | undefined;
          try { saved = trialResultSchema.parse(await readJson(join(directory, 'result.json'))); }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
          if (saved) {
            if (!settings.resume || saved.suite_hash !== suiteHash || saved.mode !== settings.mode) throw new Error('EXISTING_RESULT_REQUIRES_MATCHED_RESUME');
            if (hashJson(await readJson(join(directory, 'candidate.json'))) !== saved.artifact_hash) throw new Error('RESULT_ARTIFACT_DRIFT');
            results.push(saved);
            if (method === 'b2') {
              b2 = wrapperSchema.parse(await readJson(join(directory, 'generated-wrapper.json'))); b2Failed = saved.generation_failed;
              b2ArtifactHash = saved.artifact_hash;
              if (hashJson(b2.decision === 'adapt' ? { kind: 'javascript-wrapper', code: b2.code } : rejectArtifact(b2.reason)) !== b2ArtifactHash) throw new Error('GENERATED_WRAPPER_DRIFT');
            }
            continue;
          }
          const data = await loadBenchmarkCase(settings.suiteRoot, entry, directory);
          const parity = synthesisParity(data.evidence);
          await writeOnceJson(join(directory, 'parity.json'), parity);
          const fixture = createFixtureV3(data.fixture, data.evidence.newContracts);
          const observations: { task_id: string; output: JsonValue | null; state: JsonValue; failed: boolean; rejected: boolean }[] = [];
          let artifact: JsonValue = rejectArtifact('Generation did not complete');
          let accepted = false;
          let explicitRejection = false;
          let generationFailed = false;
          let executionFailed = false;
          let effectsBeforeRejection = false;
          let errorCode: string | null = null;
          const modelJobs: string[] = [];
          let report: JsonValue;
          let promoted: PromotionKey | undefined;
          const registry = new PromotionRegistry(join(directory, 'registry'));
          const generationId = `${settings.mode === 'final' ? 'benchmark-final-v1' : 'benchmark-v2'}/${entry.id}/${method}/trial-${String(trial).padStart(3, '0')}`;
          const invokeAdapter = async (input: JsonValue): Promise<JsonValue> => {
            if (method === 'b2' || method === 'b2v') {
              if (!b2 || b2.decision !== 'adapt') throw new Error('WRAPPER_REJECTED');
              return settings.sandbox!.execute(b2.code, input, data.evidence.newContracts, fixture.invoke);
            }
            if (method === 'b3' && promoted) return registry.execute({ key: promoted, oldContract: data.evidence.oldContract,
              newContract: data.evidence.newContracts, input, invoke: fixture.invoke, executionEnvironment: fixture.environment });
            return compileCandidate(artifact, data.evidence.oldContract, data.evidence.newContracts, entry.policy).executeForVerification(input, fixture.invoke);
          };
          try {
            if (method === 'b0') {
              const transcripts: JsonValue[] = [];
              for (const task of data.tasks) {
                await fixture.reset();
                let output: JsonValue | null = null;
                let rejected = false;
                let failed = false;
                for (let replay = 0; replay < task.replays; replay++) {
                  const agent = await replan(settings.scheduler!, data.evidence, task.input, fixture.invoke,
                    { id: `${generationId}/${task.id}/replay-${replay + 1}`, model: settings.model, mode: settings.mode as 'dev' | 'final', resume: settings.resume });
                  modelJobs.push(...agent.modelJobs);
                  transcripts.push({ task_id: task.id, replay, ...jsonValueSchema.parse(agent) as Record<string, JsonValue> });
                  output = agent.output; rejected ||= agent.outcome === 'rejected'; failed ||= agent.outcome === 'failed';
                  if (rejected || failed) break;
                }
                const state = await fixture.observe();
                if (rejected) {
                  const effects = get(state, 'side_effects');
                  if (effects && typeof effects === 'object' && !Array.isArray(effects)) effectsBeforeRejection ||= Object.values(effects).some((count) => typeof count === 'number' && count > 0);
                }
                observations.push({ task_id: task.id, output, state, failed, rejected });
              }
              artifact = { kind: 'replanning-actions', transcripts };
              accepted = observations.some((item) => !item.failed && !item.rejected);
              explicitRejection = observations.every((item) => item.rejected);
              executionFailed = observations.some((item) => item.failed);
            } else if (method === 'b1') {
              artifact = jsonValueSchema.parse(heuristicPlan(data.evidence));
              explicitRejection = 'op' in (artifact as Record<string, JsonValue>); accepted = !explicitRejection;
            } else if (method === 'b2' || method === 'b2v') {
              if (method === 'b2') {
                modelJobs.push(generationId);
                b2 = await generateWrapper(settings.scheduler!, data.evidence, { id: generationId, model: settings.model,
                  mode: settings.mode as 'dev' | 'final', resume: settings.resume });
                await writeOnceJson(join(directory, 'generated-wrapper.json'), b2);
              }
              if (!b2) throw new Error('MISSING_PAIRED_WRAPPER');
              artifact = b2.decision === 'adapt' ? { kind: 'javascript-wrapper', code: b2.code } : rejectArtifact(b2.reason);
              if (method === 'b2v' && hashJson(artifact) !== b2ArtifactHash) throw new Error('PAIRED_WRAPPER_DRIFT');
              if (method === 'b2v' && b2Failed) throw new ModelRequestError('PAIRED_GENERATION_FAILED');
              explicitRejection = b2.decision === 'reject'; accepted = !explicitRejection;
            } else {
              modelJobs.push(generationId);
              artifact = jsonValueSchema.parse(await synthesizeIsolated(settings.scheduler!, data.evidence,
                { jobId: generationId, mode: settings.mode as 'dev' | 'final', model: settings.model, resume: settings.resume }));
              explicitRejection = 'op' in (artifact as Record<string, JsonValue>);
            }
            if (method === 'b3') {
              const verification = { plan: artifact, oldContract: data.evidence.oldContract, newContract: data.evidence.newContracts,
                gateEvidence: data.gate, invoke: fixture.invoke, policyVersion: entry.policy, fixture };
              const gateReport = await verifyIsolated(verification);
              report = jsonValueSchema.parse(gateReport);
              accepted = gateReport.verdict === 'PROMOTED'; explicitRejection ||= !accepted;
              if (accepted) promoted = await registry.promote({ ...verification, report: gateReport });
            } else if (method === 'b2v' && accepted) {
              const verification = { artifact, oldContract: data.evidence.oldContract, newContract: data.evidence.newContracts,
                gateEvidence: data.gate, policyVersion: entry.policy, fixture, execute: invokeAdapter };
              const gateReport = await verifyWrapperIsolated(verification);
              report = jsonValueSchema.parse(gateReport);
              accepted = gateReport.verdict === 'PROMOTED'; explicitRejection ||= !accepted;
              if (accepted) {
                assertPromotableReport(gateReport);
                if (hashJson(await verifyWrapperIsolated(verification)) !== hashJson(gateReport)) throw new Error('NONDETERMINISTIC_GATE');
              }
            } else report = { plan_hash: hashJson(artifact), gate_evidence_hash: hashJson(data.gate), verdict: explicitRejection ? 'REJECTED' : 'INCONCLUSIVE', ungated: true };
          } catch (error) {
            if (error instanceof Error && (error.message === 'QUOTA_BLOCKED' || ('code' in error && error.code === 'QUOTA_BLOCKED'))) { quotaBlocked = true; fixture.close(); break outer; }
            const failureCode = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'GENERATION_OR_GATE_FAILED';
            if (isTransientModelFailure(failureCode)) { providerBlocked = true; providerError = failureCode; fixture.close(); break outer; }
            if (settings.mode === 'final' && /^(?:HTTP_|DOCKER_|ISOLATED_WORKER)/.test(failureCode)) { fixture.close(); throw error; }
            generationFailed = true; accepted = false; explicitRejection = false;
            errorCode = error instanceof Error && 'code' in error && typeof error.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code)
              ? error.code : 'GENERATION_OR_GATE_FAILED';
            report = { plan_hash: hashJson(artifact), gate_evidence_hash: hashJson(data.gate), verdict: 'INCONCLUSIVE', error_code: errorCode };
            if (method === 'b2') {
              b2Failed = true;
              b2 = { decision: 'reject', reason: 'Generation failed; not a safe rejection' };
              artifact = rejectArtifact(b2.reason);
              report = { plan_hash: hashJson(artifact), gate_evidence_hash: hashJson(data.gate), verdict: 'INCONCLUSIVE', error_code: errorCode };
              await writeOnceJson(join(directory, 'generated-wrapper.json'), b2);
            }
          }
          try {
            const verdict = z.enum(['PROMOTED', 'REJECTED', 'INCONCLUSIVE']).parse(get(report, 'verdict'));
            await data.coordinator.commitDecision(artifact, report, verdict);
            const sealed = sealedSchema.parse(await (await data.coordinator.openSealedEvaluation()).read());
            if (sealed.outcomes.length !== data.tasks.length || sealed.outcomes.some((item) => !data.tasks.some((task) => task.id === item.task_id))) throw new Error('INVALID_SEALED_TASK_BINDING');
            if (method !== 'b0' && accepted) {
              for (const task of data.tasks) {
                await fixture.reset();
                let output: JsonValue | null = null;
                let failed = false;
                for (let replay = 0; replay < task.replays; replay++) {
                  try { output = await invokeAdapter(task.input); }
                  catch { failed = true; executionFailed = true; break; }
                }
                observations.push({ task_id: task.id, output, state: await fixture.observe(), failed, rejected: false });
              }
            }
            await writeOnceJson(join(directory, 'observations.json'), observations);
            const passed = sealed.outcomes.filter((expected) => {
              const actual = observations.find((item) => item.task_id === expected.task_id);
              return actual && !actual.failed && !actual.rejected && canonicalJson(actual.output) === canonicalJson(expected.output) && matchesState(expected.state, actual.state);
            }).length;
            const paired = method === 'b2v' ? hashJson(b2?.decision === 'adapt' ? { kind: 'javascript-wrapper', code: b2.code } : rejectArtifact(b2?.reason ?? '')) : null;
            const result = trialResultSchema.parse({ version: 1, case_id: entry.id, baseline: method, trial, suite_hash: suiteHash,
              synthesis_hash: parity.shared_synthesis_hash, artifact_hash: hashJson(artifact), paired_b2_artifact_hash: paired,
              held_out: entry.held_out, change_class: entry.change_class, compatibility: entry.compatibility, accepted,
              explicit_rejection: explicitRejection, hidden_passed: accepted && passed === data.tasks.length, side_effects_before_rejection: effectsBeforeRejection,
              tasks_total: data.tasks.length, tasks_passed: passed, model_jobs: modelJobs, generation_failed: generationFailed,
              execution_failed: executionFailed, mode: settings.mode, error_code: errorCode });
            await writeOnceJson(join(directory, 'result.json'), result); results.push(result);
            if (method === 'b2') b2ArtifactHash = result.artifact_hash;
            process.stdout.write(`${entry.id} ${method} trial=${trial} accepted=${accepted} hidden=${result.hidden_passed}\n`);
          } finally { fixture.close(); }
        }
      }
    }
  } finally { process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt); }
  const summary = { ...summarize(results), suite_hash: suiteHash, mode: settings.mode, model: settings.model,
    quota_blocked: quotaBlocked, provider_blocked: providerBlocked, provider_error_code: providerError,
    interrupted, complete: !quotaBlocked && !providerBlocked && !interrupted, trials: results.length };
  await atomicWriteJson(join(settings.runRoot, 'summary.json'), summary);
  return { results, summary };
}
