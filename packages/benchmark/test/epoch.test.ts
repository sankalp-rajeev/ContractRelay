import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashJson } from '@contractrelay/contracts';
import { atomicWriteJson, readJson } from '@contractrelay/contracts/artifacts';
import { ensureRunIdentity } from '../src/execution-epoch.js';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
describe('explicit Tier 1 execution epoch', () => {
  it('preserves the original manifest, requires an audit receipt, and rejects further drift', async () => {
    const root = await mkdtemp(join(tmpdir(), 'contractrelay-epoch-')); dirs.push(root);
    const original = { version: 1, mode: 'final', model: 'gemini-3.8-flash', trials: 3, protocol_hash: 'frozen',
      execution_fingerprint: 'a5cbfd226835154feaba027062dd0b0e468df10f255770d3cd88cdc5cd538a7d' };
    const current = { ...original, execution_fingerprint: 'a'.repeat(64) };
    await ensureRunIdentity(root, original, false);
    await expect(ensureRunIdentity(root, current, true)).rejects.toThrow('EXECUTION_EPOCH_REQUIRED');
    const receipt = { version: 1, authorization: 'user-requested-phase5-tier1-upgrade', baseline_commit: '9cf0753b81d744a85b61551116bc2de9d63e4adc',
      original_manifest_hash: hashJson(original), previous_fingerprint: original.execution_fingerprint, execution_fingerprint: current.execution_fingerprint,
      quota: { model: original.model, rpm: 1000, tpm: 2000000, rpdHard: 10000, rpdSoft: 10000 }, max_concurrency: 4,
      changed_operational_files: ['config/models.json'], created_at: new Date().toISOString() };
    await atomicWriteJson(join(root, 'execution-epochs/tier1-v1.json'), receipt);
    await ensureRunIdentity(root, current, true);
    expect(await readJson(join(root, 'run-manifest.json'))).toEqual(original);
    await expect(ensureRunIdentity(root, current, false)).rejects.toThrow('RUN_IDENTITY_DRIFT');
    for (const changes of [{ model: 'other' }, { trials: 4 }, { protocol_hash: 'changed' }]) {
      await expect(ensureRunIdentity(root, { ...current, ...changes }, true)).rejects.toThrow('RUN_IDENTITY_DRIFT');
    }
    await expect(ensureRunIdentity(root, { ...current, execution_fingerprint: 'b'.repeat(64) }, true)).rejects.toThrow('EXECUTION_EPOCH_DRIFT');
    await atomicWriteJson(join(root, 'execution-epochs/tier1-v1.json'), { ...receipt, original_manifest_hash: 'c'.repeat(64) });
    await expect(ensureRunIdentity(root, current, true)).rejects.toThrow('EXECUTION_EPOCH_DRIFT');
  });
});
