import { readFile } from 'node:fs/promises';
import { GeminiProvider, loadModelConfig, ModelRequestError, QuotaScheduler } from '../packages/synthesizer/src/index.js';
import { synthesizeIsolated } from '../packages/synthesizer/src/isolated.js';
import { synthesisPromptVersion } from '../packages/synthesizer/src/synthesis.js';
import { oldRefundContract, refundTargetContracts, refundEvidenceRefs } from '../fixtures/synthetic/refund/contracts.js';
import { runRefundLifecycle } from '../fixtures/synthetic/refund/lifecycle.js';

try {
  const config = await loadModelConfig();
  const finalConfig = await loadModelConfig({ ...process.env, CONTRACTRELAY_MODEL_MODE: 'final' });
  if (config.mode !== 'dev' || config.budget.model === finalConfig.budget.model) throw new ModelRequestError('FINAL_EVALUATION_NOT_READY');
  const key = process.env.GEMINI_API_KEY ?? '';
  const docs = await readFile('fixtures/synthetic/refund/change.md', 'utf8');
  const scheduler = new QuotaScheduler('runs/development', new GeminiProvider(key), config.budget, { cache: config.cache });
  const plan = await synthesizeIsolated(scheduler, { dataClass: 'controlled-synthetic', oldContract: oldRefundContract,
    newContracts: refundTargetContracts, documents: refundEvidenceRefs.map((id) => ({ id, text: docs })) },
  { jobId: `refund/b3/${synthesisPromptVersion}/trial-001`, mode: 'dev', model: config.budget.model, resume: process.argv.includes('--resume') });
  const result = await runRefundLifecycle('runs/live-refund-acceptance', { candidate: plan });
  process.stdout.write(`${JSON.stringify({ model: config.budget.model, ...result }, null, 2)}\n`);
  if (!result.sealed_fixture_passed) process.exitCode = 1;
} catch (error) {
  const message = error instanceof Error ? error.message : 'SYNTHESIS_FAILED';
  process.stderr.write(`${message}\n`);
  if (!message.includes('QUOTA_BLOCKED')) process.exitCode = 1;
}
