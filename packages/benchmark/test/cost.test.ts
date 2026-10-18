import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { estimatedTier1Cost } from '../src/cost.js';
import { collectModelUsage } from '../src/usage.js';
import { ModelRequestError, QuotaScheduler } from '@contractrelay/synthesizer';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
describe('retained Tier 1 cost accounting', () => {
  it('uses standard input/output rates including the published 2027 transition', () => {
    expect(estimatedTier1Cost('gemini-3.8-flash', '2026-12-31T23:59:59Z', 1000000, 1000000)).toBe(4.5);
    expect(estimatedTier1Cost('gemini-3.8-flash', '2027-01-01T00:00:00Z', 1000000, 1000000)).toBe(9);
    expect(estimatedTier1Cost('other', '2026-10-17', 10, 20)).toBeNull();
  });
  it('counts invalid responses, retained retries and explicit unknown usage without charging resume twice', async () => {
    const root = await mkdtemp(join(tmpdir(), 'contractrelay-cost-')); dirs.push(root);
    const model = 'gemini-3.8-flash';
    const generate = vi.fn().mockRejectedValueOnce(new ModelRequestError('HTTP_503'))
      .mockResolvedValueOnce({ text: 'invalid', inputTokens: 1000, outputTokens: 2000 })
      .mockResolvedValueOnce({ text: '{"ok":true}', inputTokens: 1000, outputTokens: 2000 });
    const scheduler = new QuotaScheduler(root, { generate }, { model, rpm: 1000, tpm: 2000000, rpdHard: 10000, rpdSoft: 10000 },
      { clock: { now: () => Date.parse('2026-10-17T18:00:00Z'), sleep: async () => {} } });
    const job = { id: 'benchmark-final-v1/case/b3/trial-001', mode: 'final' as const,
      request: { model, prompt: 'controlled', schema: {}, temperature: 0.2, maxOutputTokens: 100 } };
    await expect(scheduler.run(job, (value) => value)).rejects.toMatchObject({ code: 'HTTP_503' });
    await expect(scheduler.run(job, (value) => value, { resume: true })).rejects.toMatchObject({ code: 'INVALID_MODEL_OUTPUT' });
    await scheduler.run(job, (value) => value, { resume: true });
    const usage = await collectModelUsage(root, model, 'final', ['case']);
    expect(usage.by_method.b3).toMatchObject({ requests_reserved: 3, responses_with_usage: 2, input_tokens: 2000, output_tokens: 4000, attempts_without_usage: 1 });
    expect(usage.by_method.b3!.estimated_known_usage_usd).toBeCloseTo(0.0165);
    await scheduler.run(job, (value) => value, { resume: true });
    expect(await collectModelUsage(root, model, 'final', ['case'])).toEqual(usage);
  });
});
