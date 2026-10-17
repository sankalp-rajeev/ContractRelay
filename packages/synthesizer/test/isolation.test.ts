import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolContractSchema } from '@contractrelay/contracts';
import { runIsolatedTask } from '@contractrelay/contracts/sandbox';
import { QuotaScheduler } from '../src/scheduler.js';
import { synthesizeIsolated } from '../src/isolated.js';
import { ModelRequestError } from '../src/model.js';
import { newContract, oldContract, plan } from '../../../fixtures/synthetic/weather/fixture.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

describe('actual synthesis worker filesystem permissions', () => {
  it('requests generation through the host quota scheduler with synthesis data only', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contractrelay-isolated-synthesis-'));
    directories.push(dir);
    const generate = vi.fn(async () => ({ text: JSON.stringify({ candidate: plan }), inputTokens: 10, outputTokens: 30 }));
    const scheduler = new QuotaScheduler(dir, { generate }, { model: 'test-model', rpm: 10, tpm: 100_000, rpdSoft: 2, rpdHard: 3 });
    const result = await synthesizeIsolated(scheduler, { dataClass: 'controlled-synthetic', oldContract: toolContractSchema.parse(oldContract),
      newContracts: [toolContractSchema.parse(newContract)], documents: ['tool', 'location', 'units', 'response'].map((section) => ({ id: `change.md#${section}`, text: 'Controlled evidence' })) },
    { jobId: 'trial-001', model: 'test-model', mode: 'dev' });
    expect(result).toEqual(plan);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('blocks direct filesystem access from synthesis code (TC-019)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contractrelay-synthesis-probe-'));
    directories.push(dir);
    const path = join(dir, 'sealed-evidence.json');
    await writeFile(path, '{"hidden":"must-not-leak"}', 'utf8');
    await expect(runIsolatedTask(fileURLToPath(new URL('../src/isolation-worker.ts', import.meta.url)),
      { operation: 'probe', path }, async () => null)).rejects.toThrow('ERR_ACCESS_DENIED');
  });

  it('preserves sanitized provider failure codes across the worker boundary', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contractrelay-provider-error-'));
    directories.push(dir);
    const scheduler = new QuotaScheduler(dir, { generate: async () => { throw new ModelRequestError('HTTP_400'); } },
      { model: 'test-model', rpm: 10, tpm: 100_000, rpdSoft: 2, rpdHard: 3 });
    await expect(synthesizeIsolated(scheduler, { dataClass: 'controlled-synthetic', oldContract: toolContractSchema.parse(oldContract),
      newContracts: [toolContractSchema.parse(newContract)], documents: ['tool', 'location', 'units', 'response'].map((section) => ({ id: `change.md#${section}`, text: 'Controlled evidence' })) },
    { jobId: 'trial-001', model: 'test-model', mode: 'dev' })).rejects.toThrow('HTTP_400');
  });
});
