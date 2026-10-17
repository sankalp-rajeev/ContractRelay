import { join } from 'node:path';
import { atomicWriteJson } from '../packages/contracts/src/artifacts.js';
import { GeminiProvider, loadModelConfig, ModelRequestError, QuotaScheduler } from '../packages/synthesizer/src/index.js';
import { synthesizeIsolated } from '../packages/synthesizer/src/isolated.js';
import { synthesisPromptVersion } from '../packages/synthesizer/src/synthesis.js';
import { verifyIsolated } from '../packages/verifier/src/isolated.js';
import { runWeatherLifecycle, weatherSynthesisEvidence } from '../fixtures/synthetic/weather/lifecycle.js';
import { newContract, oldContract, weatherGate, weatherInvoker } from '../fixtures/synthetic/weather/fixture.js';

try {
  const config = await loadModelConfig();
  const finalConfig = await loadModelConfig({ ...process.env, CONTRACTRELAY_MODEL_MODE: 'final' });
  if (config.mode !== 'dev' || config.budget.model === finalConfig.budget.model) throw new ModelRequestError('FINAL_EVALUATION_NOT_READY');
  const key = process.env.GEMINI_API_KEY ?? '';
  if (!key.trim()) throw new ModelRequestError('MISSING_GEMINI_API_KEY: configure a free-tier key locally in .env; do not paste it in chat');
  const scheduler = new QuotaScheduler('runs/development', new GeminiProvider(key), config.budget, { cache: config.cache });
  const plan = await synthesizeIsolated(scheduler, weatherSynthesisEvidence,
    { jobId: `weather/b3/${synthesisPromptVersion}/trial-001`, mode: 'dev', model: config.budget.model, resume: process.argv.includes('--resume') });
  const report = await verifyIsolated({ oldContract, newContract, plan, gateEvidence: weatherGate, invoke: weatherInvoker });
  await atomicWriteJson(join('reports', 'weather-live-verification.json'), report);
  const lifecycle = report.verdict === 'PROMOTED' ? await runWeatherLifecycle('runs/live-acceptance', plan) : null;
  process.stdout.write(`${JSON.stringify({ model: config.budget.model, verdict: report.verdict, plan_hash: report.plan_hash,
    promotion_and_sealed_fixture_passed: lifecycle?.sealed_fixture_passed ?? false,
    report: 'reports/weather-live-verification.json' }, null, 2)}\n`);
  if (report.verdict !== 'PROMOTED') process.exitCode = 1;
} catch (error) {
  const code = error instanceof Error ? error.message : 'SYNTHESIS_FAILED';
  process.stderr.write(`${code}\n`);
  if (!code.includes('QUOTA_BLOCKED')) process.exitCode = 1;
}
