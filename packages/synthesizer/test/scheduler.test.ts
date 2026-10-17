import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atomicWriteJson, readJson } from '@contractrelay/contracts/artifacts';
import { ModelRequestError } from '../src/model.js';
import { QuotaScheduler, modelRunSchema, quotaDay } from '../src/scheduler.js';
import type { ModelJob, SchedulerClock } from '../src/scheduler.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
const response = { text: '{"value":1}', inputTokens: 5, outputTokens: 4 };
const budget = { model: 'configured-test-model', rpm: 100, tpm: 100_000, rpdSoft: 10, rpdHard: 12 };
const job = (id: string, mode: 'dev' | 'final' = 'dev'): ModelJob => ({ id, mode,
  request: { model: budget.model, prompt: 'controlled test', schema: { type: 'object' }, temperature: 0.2, maxOutputTokens: 20 } });
const parse = (value: unknown) => value;
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'contractrelay-scheduler-'));
  directories.push(dir);
  let now = Date.parse('2026-10-18T06:59:00Z');
  const sleep = vi.fn(async (ms: number) => { now += ms; });
  const clock: SchedulerClock = { now: () => now, sleep };
  return { dir, clock, sleep, advance: (ms: number) => { now += ms; } };
}

describe('durable quota scheduler', () => {
  it('stops at a tiny daily quota and resumes next Pacific quota day without repeating completed trials (TC-023)', async () => {
    const { dir, clock, advance } = await fixture();
    const generate = vi.fn(async () => response);
    const scheduler = new QuotaScheduler(dir, { generate }, { ...budget, rpdSoft: 2 }, { clock });
    await scheduler.run(job('trial-001', 'final'), parse);
    await scheduler.run(job('trial-002', 'final'), parse);
    expect((await scheduler.run(job('trial-003', 'final'), parse)).status).toBe('quota_blocked');
    expect(generate).toHaveBeenCalledTimes(2);
    const restarted = new QuotaScheduler(dir, { generate }, { ...budget, rpdSoft: 2 }, { clock });
    expect((await restarted.run(job('trial-001', 'final'), parse, { resume: true })).skipped).toBe(true);
    advance(120_000);
    expect((await restarted.run(job('trial-003', 'final'), parse, { resume: true })).status).toBe('completed');
    expect(generate).toHaveBeenCalledTimes(3);
    expect(quotaDay(Date.parse('2026-10-18T06:59:00Z'))).toBe('2026-10-17');
    expect(quotaDay(Date.parse('2026-10-18T07:01:00Z'))).toBe('2026-10-18');
  });

  it('honors Retry-After and records every retry without hidden SDK attempts (TC-024)', async () => {
    const { dir, clock, sleep } = await fixture();
    const generate = vi.fn().mockRejectedValueOnce(new ModelRequestError('RESOURCE_EXHAUSTED', 1600)).mockResolvedValue(response);
    const scheduler = new QuotaScheduler(dir, { generate }, budget, { clock });
    expect((await scheduler.run(job('retry'), parse)).status).toBe('completed');
    expect(sleep).toHaveBeenCalledWith(1600);
    const run = modelRunSchema.parse(await readJson(join(dir, 'retry', 'run.json')));
    expect(run.retry_count).toBe(1);
    expect(run.request_index_for_model_day).toBe(2);
    expect(run.attempts).toHaveLength(1);
  });

  it('bounds sustained 429 retries and stops immediately on explicit daily quota exhaustion', async () => {
    const { dir, clock } = await fixture();
    const generate = vi.fn(async () => { throw new ModelRequestError('RESOURCE_EXHAUSTED'); });
    const scheduler = new QuotaScheduler(dir, { generate }, budget, { clock, maxRetries: 2 });
    expect((await scheduler.run(job('blocked'), parse)).status).toBe('quota_blocked');
    expect(generate).toHaveBeenCalledTimes(3);
    expect((await scheduler.run(job('also-blocked'), parse)).status).toBe('quota_blocked');
    expect(generate).toHaveBeenCalledTimes(3);
    const other = await fixture();
    const daily = vi.fn(async () => { throw new ModelRequestError('RESOURCE_EXHAUSTED', 0, true); });
    expect((await new QuotaScheduler(other.dir, { generate: daily }, budget, { clock: other.clock }).run(job('daily'), parse)).status).toBe('quota_blocked');
    expect(daily).toHaveBeenCalledTimes(1);
  });

  it('bypasses development caching for independent final trials (TC-025)', async () => {
    const { dir, clock } = await fixture();
    const generate = vi.fn(async () => response);
    const scheduler = new QuotaScheduler(dir, { generate }, budget, { clock, cache: true });
    await scheduler.run(job('dev-one'), parse);
    expect((await scheduler.run(job('dev-two'), parse)).cacheHit).toBe(true);
    await scheduler.run(job('final-one', 'final'), parse);
    await scheduler.run(job('final-two', 'final'), parse);
    expect(generate).toHaveBeenCalledTimes(3);
    await expect(scheduler.run(job('final-one', 'final'), parse)).rejects.toMatchObject({ code: 'COMPLETED_TRIAL_EXISTS_USE_RESUME' });
  });

  it('recovers a response persisted before a crash without regenerating it', async () => {
    const { dir, clock } = await fixture();
    const generate = vi.fn(async () => response);
    const scheduler = new QuotaScheduler(dir, { generate }, budget, { clock });
    await scheduler.run(job('recover'), parse);
    const run = modelRunSchema.parse(await readJson(join(dir, 'recover', 'run.json')));
    await atomicWriteJson(join(dir, 'recover', 'run.json'), { ...run, status: 'running', artifact_hash: null });
    const resumed = new QuotaScheduler(dir, { generate }, budget, { clock });
    expect((await resumed.run(job('recover'), parse, { resume: true })).status).toBe('completed');
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('detects retained artifact corruption instead of silently skipping the trial', async () => {
    const { dir, clock } = await fixture();
    const scheduler = new QuotaScheduler(dir, { generate: async () => response }, budget, { clock });
    await scheduler.run(job('tamper'), parse);
    await atomicWriteJson(join(dir, 'tamper', 'artifact.json'), { changed: true });
    await expect(scheduler.run(job('tamper'), parse, { resume: true })).rejects.toMatchObject({ code: 'RUN_INTEGRITY_FAILED' });
  });

  it('enforces RPM and TPM reservations using a controlled clock', async () => {
    const first = await fixture();
    const rpm = new QuotaScheduler(first.dir, { generate: async () => response }, { ...budget, rpm: 1 }, { clock: first.clock });
    const started = first.clock.now();
    await rpm.run(job('one'), parse);
    await rpm.run(job('two'), parse);
    expect(first.clock.now() - started).toBeGreaterThanOrEqual(60_000);
    const second = await fixture();
    const tpm = new QuotaScheduler(second.dir, { generate: async () => response }, { ...budget, tpm: 350 }, { clock: second.clock });
    const tokenStart = second.clock.now();
    await tpm.run(job('one'), parse);
    await tpm.run(job('two'), parse);
    expect(second.clock.now() - tokenStart).toBeGreaterThanOrEqual(60_000);
  });

  it('persists sanitized failures and refuses unsafe job paths or model mismatches', async () => {
    const { dir, clock } = await fixture();
    const scheduler = new QuotaScheduler(dir, { generate: async () => { throw new Error('private credential'); } }, budget, { clock });
    await expect(scheduler.run(job('failed'), parse)).rejects.toMatchObject({ code: 'PROVIDER_FAILED' });
    expect(JSON.stringify(await readJson(join(dir, 'failed', 'run.json')))).not.toContain('private credential');
    await expect(scheduler.run(job('../escape'), parse)).rejects.toThrow('job ID');
    await expect(scheduler.run({ ...job('mismatch'), request: { ...job('mismatch').request, model: 'other' } }, parse)).rejects.toThrow('outside');
  });
});
