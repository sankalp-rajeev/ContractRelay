import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWriteJson, readJson, writeOnceJson } from '../packages/contracts/src/artifacts.js';
import { hashJson } from '../packages/contracts/src/index.js';
import { runBenchmark } from '../packages/benchmark/src/runner.js';
import type { BenchmarkSettings } from '../packages/benchmark/src/runner.js';
import { DockerSandbox } from '../packages/benchmark/src/sandbox.js';
import { loadSuite } from '../packages/benchmark/src/suite.js';
import { summarize } from '../packages/benchmark/src/metrics.js';
import { collectModelUsage } from '../packages/benchmark/src/usage.js';
import { loadModelConfig, GeminiProvider, QuotaScheduler } from '../packages/synthesizer/src/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
try {
  const { values } = parseArgs({ options: { 'api-free': { type: 'boolean' }, resume: { type: 'boolean' },
    'include-held-out': { type: 'boolean' }, trials: { type: 'string' }, 'run-dir': { type: 'string' } } });
  const config = await loadModelConfig();
  const mode = values['api-free'] ? 'api-free' : config.mode;
  const trials = Number(values.trials ?? (mode === 'final' ? '3' : '1'));
  const runRoot = values['run-dir'] ?? join(root, mode === 'final' ? 'runs/benchmark-v3-final-recovery' : `runs/benchmark-v3-${mode}`);
  const sandboxConfig = await readJson(join(root, 'config/sandbox.json'));
  const suiteRoot = join(root, 'benchmarks');
  const { suite } = await loadSuite(suiteRoot);
  const protocol = await readJson(join(suiteRoot, 'manifests/protocol-v2.json')) as Record<string, unknown>;
  if (hashJson(sandboxConfig) !== protocol.sandbox_config_hash) throw new Error('SANDBOX_CONFIG_DRIFT');
  if (mode === 'final' && (config.budget.model !== protocol.final_model || config.budget.rpdSoft > 18)) throw new Error('FINAL_MODEL_OR_BUDGET_DRIFT');
  if (mode === 'dev' && config.budget.model !== protocol.development_model) throw new Error('DEVELOPMENT_MODEL_DRIFT');
  const settings: BenchmarkSettings = { suiteRoot, runRoot, mode, model: mode === 'api-free' ? 'none' : config.budget.model,
    trials, resume: values.resume ?? false, includeHeldOut: mode === 'final' || (mode === 'api-free' && (values['include-held-out'] ?? false)),
    ...(mode === 'api-free' ? {} : { scheduler: new QuotaScheduler(join(root, mode === 'dev' ? 'runs/development' : 'runs/final'),
      new GeminiProvider(process.env.GEMINI_API_KEY ?? ''), config.budget, { cache: false, retainFailed: true, retryTransient: true }), sandbox: new DockerSandbox(sandboxConfig) }) };
  let result = await runBenchmark(settings);
  if (mode === 'dev' && values['include-held-out'] && result.summary.complete) {
    // Keep the already-recorded development trials intact when adding held-out scoring.
    const heldOut = await runBenchmark({ ...settings, includeHeldOut: true, caseIds: suite.cases.filter((entry) => entry.held_out).map((entry) => entry.id),
      runRoot: `${runRoot}-held-out` });
    const results = [...result.results, ...heldOut.results];
    result = { results, summary: { ...summarize(results), suite_hash: hashJson(suite), mode, model: config.budget.model,
      quota_blocked: heldOut.summary.quota_blocked, provider_blocked: heldOut.summary.provider_blocked, provider_error_code: heldOut.summary.provider_error_code,
      interrupted: heldOut.summary.interrupted, complete: heldOut.summary.complete, trials: results.length } };
    await atomicWriteJson(join(runRoot, 'full-summary.json'), result.summary);
  }
  if (mode !== 'api-free') await atomicWriteJson(join(runRoot, 'model-usage.json'), await collectModelUsage(join(root, mode === 'dev' ? 'runs/development' : 'runs/final'),
    config.budget.model, mode, suite.cases.filter((entry) => !entry.held_out || mode === 'final' || values['include-held-out']).map((entry) => entry.id)));
  if (mode === 'final') await atomicWriteJson(join(runRoot, 'commissioning-usage.json'), await collectModelUsage(join(root, 'runs/final'),
    config.budget.model, 'final', suite.cases.map((entry) => entry.id), 'benchmark-v2'));
  if (mode === 'dev' && values['include-held-out'] && result.summary.complete && result.results.length === 75) {
    const infrastructureFailures = result.results.filter((run) => run.error_code !== null &&
      /^(?:HTTP_|NETWORK_|DOCKER_|ISOLATED_WORKER|PROVIDER_FAILED|GENERATION_OR_GATE_FAILED)/.test(run.error_code)).length;
    if (infrastructureFailures > 0) throw new Error('DEVELOPMENT_INFRASTRUCTURE_FAILURES_REMAIN');
    const acceptancePath = join(suiteRoot, `manifests/development-acceptance-v${suite.version}.json`);
    const acceptance = { version: 1, suite_hash: hashJson(suite),
      protocol_hash: suite.protocol_hash, all_methods_completed: true, model: config.budget.model, summary_hash: hashJson(result.summary),
      infrastructure_failures: infrastructureFailures,
      generation_failures: result.results.filter((run) => run.generation_failed).length,
      note: 'Completed development regressions include refusals and failures; not final-model results.' };
    try {
      const prior = await readJson(acceptancePath) as typeof acceptance;
      if (prior.suite_hash !== acceptance.suite_hash || prior.protocol_hash !== acceptance.protocol_hash || prior.model !== acceptance.model
        || prior.generation_failures !== acceptance.generation_failures || prior.infrastructure_failures !== 0) throw new Error('DEVELOPMENT_ACCEPTANCE_DRIFT');
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; await writeOnceJson(acceptancePath, acceptance); }
  }
  process.stdout.write(`${JSON.stringify({ mode, complete: result.summary.complete, quota_blocked: result.summary.quota_blocked, provider_blocked: result.summary.provider_blocked,
    trials_recorded: result.results.length, summary_path: join(runRoot, mode === 'dev' && values['include-held-out'] ? 'full-summary.json' : 'summary.json') }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'BENCHMARK_FAILED'}\n`); process.exitCode = 1;
}
