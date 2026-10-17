import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GeminiProvider, loadModelConfig, QuotaScheduler, ScheduledPlanSynthesizer, retryAfterMilliseconds } from '../src/index.js';
import type { SynthesisEvidence } from '../src/index.js';
import { planResponseJsonSchema } from '../src/synthesis.js';
import { newContract, oldContract, plan } from '../../../fixtures/synthetic/weather/fixture.js';
import { toolContractSchema } from '@contractrelay/contracts';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
const evidence: SynthesisEvidence = { dataClass: 'controlled-synthetic', oldContract: toolContractSchema.parse(oldContract),
  newContracts: [toolContractSchema.parse(newContract)], documents: ['tool', 'location', 'units', 'response'].map((section) => ({ id: `change.md#${section}`, text: 'Documented controlled change' })) };

async function synthesize(response: unknown, input: unknown = evidence) {
  const dir = await mkdtemp(join(tmpdir(), 'contractrelay-synth-'));
  directories.push(dir);
  const generate = vi.fn(async () => ({ text: JSON.stringify(response), inputTokens: 10, outputTokens: 20 }));
  const scheduler = new QuotaScheduler(dir, { generate }, { model: 'configured-test-model', rpm: 10, tpm: 100_000, rpdSoft: 2, rpdHard: 3 });
  const synth = new ScheduledPlanSynthesizer(scheduler, { jobId: 'trial-001', model: 'configured-test-model', mode: 'dev' });
  return { generate, promise: synth.synthesize(input as SynthesisEvidence) };
}

describe('structured synthesis trust boundary', () => {
  it('accepts an evidence-grounded bounded plan through the shared scheduler', async () => {
    const { generate, promise } = await synthesize({ candidate: plan });
    expect(await promise).toEqual(plan);
    expect(generate.mock.calls[0]).toBeDefined();
  });

  it('preserves an explicit model rejection', async () => {
    const reject = { version: 1, op: 'Reject', reason: 'Removed capability', missing_evidence: ['oracle'], risk: 'Cannot preserve behavior' };
    expect(await (await synthesize({ candidate: reject })).promise).toEqual(reject);
  });

  it('rejects hallucinated tools, unresolved references and unsupported code before execution', async () => {
    for (const candidate of [
      { ...plan, target: { kind: 'single', tool: 'invented' } },
      { ...plan, steps: [{ op: 'RenameArg', from: 'city', to: 'location', evidence: ['invented-document'] }] },
      { ...plan, steps: [{ op: 'ExecuteCode', code: 'process.exit()' }] }
    ]) await expect((await synthesize({ candidate })).promise).rejects.toThrow();
  });

  it('refuses gate/sealed evidence fields and private data classifications at the input boundary', async () => {
    await expect((await synthesize({ candidate: plan }, { ...evidence, sealed_eval: { sentinel: 'hidden' } })).promise).rejects.toThrow();
    await expect((await synthesize({ candidate: plan }, { ...evidence, dataClass: 'private' })).promise).rejects.toThrow();
  });

  it('configures Gemini structured output and disables invisible retries', async () => {
    const generate = vi.fn(async () => ({ text: '{"candidate":{}}', usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, thoughtsTokenCount: 5 } }));
    // The SDK response has text as a getter; this controlled transport supplies the same public shape.
    const provider = new GeminiProvider('test-only-placeholder', generate);
    expect(await provider.generate({ model: 'configured-test-model', prompt: 'synthetic', schema: planResponseJsonSchema, maxOutputTokens: 100, temperature: 0.2 }))
      .toEqual({ text: '{"candidate":{}}', inputTokens: 10, outputTokens: 25 });
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ config: expect.objectContaining({ responseMimeType: 'application/json',
      responseJsonSchema: planResponseJsonSchema, httpOptions: { retryOptions: { attempts: 1 } } }) }));
    expect(() => new GeminiProvider('')).toThrow('MISSING_GEMINI_API_KEY');
  });

  it('loads explicit quotas, rejects invalid overrides, and forces final cache off', async () => {
    const defaults = await loadModelConfig({});
    expect(defaults.budget.model).toBe('gemini-3.5-flash-lite');
    expect((await loadModelConfig({ CONTRACTRELAY_MODEL_MODE: 'final', CONTRACTRELAY_CACHE_MODE: 'dev' })).cache).toBe(false);
    await expect(loadModelConfig({ CONTRACTRELAY_DEV_RPD_SOFT: '9999' })).rejects.toThrow();
    expect((await loadModelConfig({ CONTRACTRELAY_DEV_RPD_SOFT: '2' })).budget.rpdSoft).toBe(2);
    expect(retryAfterMilliseconds('2', 0)).toBe(2000);
    expect(retryAfterMilliseconds('Sun, 18 Oct 2026 07:00:00 GMT', Date.parse('2026-10-18T06:59:58Z'))).toBe(2000);
  });
});
