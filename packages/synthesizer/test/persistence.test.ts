import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atomicWriteJson, readJson } from '@contractrelay/contracts/artifacts';
import { ModelRequestError } from '../src/model.js';
import { QuotaScheduler, modelRunSchema } from '../src/scheduler.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
const budget = { model: 'test-model', rpm: 100, tpm: 100_000, rpdSoft: 10, rpdHard: 12 };
const job = { id: 'trial-001', mode: 'final', request: { model: budget.model, prompt: 'synthetic', schema: {}, temperature: 0.2, maxOutputTokens: 100 } } as const;

describe('model interaction persistence', () => {
  it('retains every failed and successful attempt instead of replacing prior model output', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contractrelay-attempts-'));
    directories.push(dir);
    const generate = vi.fn().mockResolvedValueOnce({ text: 'not-json', inputTokens: 1, outputTokens: 1 })
      .mockResolvedValueOnce({ text: '{"ok":true}', inputTokens: 1, outputTokens: 1 });
    const scheduler = new QuotaScheduler(dir, { generate }, budget);
    await expect(scheduler.run(job, (value) => value)).rejects.toMatchObject({ code: 'INVALID_MODEL_OUTPUT' });
    expect((await scheduler.run(job, (value) => value, { resume: true })).status).toBe('completed');
    expect(await readdir(join(dir, job.id, 'attempts'))).toEqual(['attempt-001', 'attempt-002']);
    expect(await readJson(join(dir, job.id, 'attempts', 'attempt-001', 'response.json'))).toMatchObject({ text: 'not-json' });
  });

  it('resumes a crash before the provider response with a fresh retained attempt', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contractrelay-interruption-'));
    directories.push(dir);
    const generate = vi.fn(async () => ({ text: '{"ok":true}', inputTokens: 1, outputTokens: 1 }));
    const scheduler = new QuotaScheduler(dir, { generate }, budget);
    await scheduler.run(job, (value) => value);
    const run = modelRunSchema.parse(await readJson(join(dir, job.id, 'run.json')));
    await atomicWriteJson(join(dir, job.id, 'run.json'), { ...run, status: 'running', attempt_count: 2 });
    expect((await scheduler.run(job, (value) => value, { resume: true })).status).toBe('completed');
    expect(generate).toHaveBeenCalledTimes(2);
    expect(await readJson(join(dir, job.id, 'attempts', 'attempt-003', 'response.json'))).toMatchObject({ text: '{"ok":true}' });
  });

  it('rejects concurrent schedulers rather than double-reserving shared quota', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contractrelay-shared-lock-'));
    directories.push(dir);
    let complete!: (value: { text: string; inputTokens: number; outputTokens: number }) => void;
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const provider = { generate: async () => { entered(); return new Promise<{ text: string; inputTokens: number; outputTokens: number }>((resolve) => { complete = resolve; }); } };
    const first = new QuotaScheduler(dir, provider, budget);
    const second = new QuotaScheduler(dir, provider, budget);
    const running = first.run(job, (value) => value);
    await ready;
    await expect(second.run({ ...job, id: 'trial-002' }, (value) => value)).rejects.toThrow('already being held');
    complete({ text: '{"ok":true}', inputTokens: 1, outputTokens: 1 });
    await running;
  });

  it('checks token limits before issuing a request', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contractrelay-token-budget-'));
    directories.push(dir);
    const generate = vi.fn(async () => { throw new ModelRequestError('UNEXPECTED_CALL'); });
    const scheduler = new QuotaScheduler(dir, { generate }, { ...budget, tpm: 1 });
    await expect(scheduler.run(job, (value) => value)).rejects.toMatchObject({ code: 'REQUEST_EXCEEDS_TPM' });
    expect(generate).not.toHaveBeenCalled();
    expect(await readJson(join(dir, job.id, 'run.json'))).toMatchObject({ status: 'failed', error_code: 'REQUEST_EXCEEDS_TPM' });
  });
});
