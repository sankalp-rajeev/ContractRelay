import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashJson } from '@contractrelay/contracts';
import { readJson } from '@contractrelay/contracts/artifacts';
import { QuotaScheduler } from '../src/scheduler.js';
import { ModelRequestError } from '../src/model.js';
import type { ModelRequest } from '../src/model.js';
import { loadModelConfig } from '../src/config.js';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
const budget = { model: 'controlled', rpm: 1000, tpm: 2000000, rpdHard: 10000, rpdSoft: 10000 };
const response = { text: '{"ok":true}', inputTokens: 10, outputTokens: 20 };
const job = (id: number) => ({ id: `trial-${id}`, mode: 'final' as const,
  request: { model: budget.model, prompt: `controlled ${id}`, schema: {}, temperature: 0.2, maxOutputTokens: 100 } });
const directory = async () => { const dir = await mkdtemp(join(tmpdir(), 'contractrelay-parallel-')); dirs.push(dir); return dir; };
const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

describe('Tier 1 bounded scheduling', () => {
  it('uses the authorized final limits and four slots while keeping development defaults', async () => {
    expect(await loadModelConfig({ CONTRACTRELAY_MODEL_MODE: 'final' })).toMatchObject({ maxConcurrency: 4, cache: false,
      budget: { model: 'gemini-3.8-flash', rpm: 1000, tpm: 2000000, rpdHard: 10000, rpdSoft: 10000 } });
    expect((await loadModelConfig({})).maxConcurrency).toBe(1);
    await expect(loadModelConfig({ CONTRACTRELAY_MAX_CONCURRENCY: '6' })).rejects.toThrow('Concurrency');
    await expect(loadModelConfig({ CONTRACTRELAY_MODEL_MODE: 'final', CONTRACTRELAY_FINAL_RPM: '1001' })).rejects.toThrow('Tier 1');
  });
  it('runs at most four calls and atomically reserves the daily cap across queued work', async () => {
    const dir = await directory();
    let active = 0; let peak = 0;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => { release = resolve; });
    const generate = vi.fn(async () => {
      active++; peak = Math.max(peak, active);
      if (active === 4) release();
      await ready; await pause(10); active--; return response;
    });
    const scheduler = new QuotaScheduler(dir, { generate }, { ...budget, rpdHard: 7, rpdSoft: 7 }, { maxConcurrency: 4 });
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => scheduler.run(job(i), (value) => value)));
    expect(peak).toBe(4); expect(generate).toHaveBeenCalledTimes(7);
    expect(results.filter((result) => result.status === 'quota_blocked')).toHaveLength(5);
    expect(await readJson(join(dir, `quota-${hashJson(budget.model)}.json`))).toMatchObject({ requests: 7 });
    const resumed = new QuotaScheduler(dir, { generate }, { ...budget, rpdHard: 7, rpdSoft: 7 }, { maxConcurrency: 4 });
    await resumed.run(job(0), (value) => value, { resume: true }); expect(generate).toHaveBeenCalledTimes(7);
  });
  it.each(['HTTP_503', 'HTTP_504'])('pauses queued calls on %s, drains inflight calls and resumes retained attempts', async (code) => {
    const dir = await directory();
    let calls = 0; let failedId = '';
    const generate = vi.fn(async (request: ModelRequest) => {
      if (++calls === 1) { failedId = request.prompt.split(' ')[1]!; throw new ModelRequestError(code); }
      await pause(20); return response;
    });
    const scheduler = new QuotaScheduler(dir, { generate }, budget, { maxConcurrency: 4, pauseOnTransient: true, retryTransient: true, retainFailed: true });
    const settled = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => scheduler.run(job(i), (value) => value)));
    expect(generate.mock.calls.length).toBeLessThanOrEqual(4);
    expect(settled[Number(failedId)]?.status).toBe('rejected');
    const restarted = new QuotaScheduler(dir, { generate }, budget, { maxConcurrency: 4, pauseOnTransient: true, retryTransient: true, retainFailed: true });
    await Promise.all(Array.from({ length: 10 }, (_, i) => restarted.run(job(i), (value) => value, { resume: true })));
    expect(generate).toHaveBeenCalledTimes(11);
    expect(await readJson(join(dir, `trial-${failedId}/attempts/attempt-001/error.json`))).toMatchObject({ code });
    expect(await readJson(join(dir, `trial-${failedId}/attempts/attempt-002/response.json`))).toEqual(response);
  });
  it('rejects duplicate jobs while the original is active', async () => {
    const dir = await directory();
    let release!: () => void; let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const generate = vi.fn(async () => { entered(); await new Promise<void>((resolve) => { release = resolve; }); return response; });
    const scheduler = new QuotaScheduler(dir, { generate }, budget, { maxConcurrency: 4 });
    const first = scheduler.run(job(1), (value) => value); await started;
    await expect(scheduler.run(job(1), (value) => value)).rejects.toMatchObject({ code: 'JOB_ALREADY_RUNNING' });
    release(); await first; expect(generate).toHaveBeenCalledTimes(1);
  });
  it('raises the cap without resetting existing same-day reservations or completed jobs', async () => {
    const dir = await directory(); const generate = vi.fn(async () => response);
    const prior = new QuotaScheduler(dir, { generate }, { ...budget, rpdSoft: 1, rpdHard: 1 });
    await prior.run(job(0), (value) => value);
    expect((await prior.run(job(1), (value) => value)).status).toBe('quota_blocked');
    const upgraded = new QuotaScheduler(dir, { generate }, budget, { maxConcurrency: 4 });
    await upgraded.run(job(0), (value) => value, { resume: true });
    await upgraded.run(job(1), (value) => value, { resume: true });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(await readJson(join(dir, `quota-${hashJson(budget.model)}.json`))).toMatchObject({ requests: 2 });
  });
  it.each([{ rpm: 1, tpm: 2000000 }, { rpm: 1000, tpm: 500 }])('preserves atomic RPM/TPM windows with concurrent reservations (%j)', async (limits) => {
    const dir = await directory(); let now = Date.parse('2026-10-17T18:00:00Z'); const starts: number[] = [];
    const scheduler = new QuotaScheduler(dir, { generate: async () => { starts.push(now); return response; } }, { ...budget, ...limits },
      { maxConcurrency: 4, clock: { now: () => now, sleep: async (ms) => { now += ms; await pause(1); } } });
    await Promise.all([1, 2, 3].map((i) => scheduler.run(job(i), (value) => value)));
    expect(starts).toHaveLength(3);
    const ledger = await readJson(join(dir, `quota-${hashJson(budget.model)}.json`)) as { window: { at: number; tokens: number }[] };
    expect(ledger.window.length).toBeLessThanOrEqual(limits.rpm);
    expect(ledger.window.reduce((sum, entry) => sum + entry.tokens, 0)).toBeLessThanOrEqual(limits.tpm);
    expect(now - Date.parse('2026-10-17T18:00:00Z')).toBeGreaterThanOrEqual(120000);
  });
});
