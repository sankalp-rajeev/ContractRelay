import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PromotionRegistry } from '../src/index.js';
import { verifyCandidate } from '@contractrelay/verifier';
import { hashJson } from '@contractrelay/contracts';
import { atomicWriteJson } from '@contractrelay/contracts/artifacts';
import { newContract, oldContract, plan, weatherGate, weatherInvoker } from '../../../fixtures/synthetic/weather/fixture.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
const verification = { oldContract, newContract, plan, gateEvidence: weatherGate, invoke: weatherInvoker };
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'contractrelay-registry-'));
  directories.push(dir);
  const registry = new PromotionRegistry(dir);
  const report = await verifyCandidate(verification);
  const key = await registry.promote({ ...verification, report });
  return { dir, registry, key, report };
}

describe('exact-contract promotion registry (TC-010)', () => {
  it('serves only a verified exact contract pair and emits a structured trace', async () => {
    const { registry, key } = await fixture();
    const onTrace = vi.fn();
    const result = await registry.execute({ key, oldContract, newContract, input: { city: 'Ann Arbor' }, invoke: weatherInvoker, onTrace });
    expect(result).toEqual({ temperature: 64, conditions: 'Clear' });
    expect(onTrace).toHaveBeenCalledWith(expect.objectContaining({ tool: 'get_weather', contractHash: key.oldContractHash,
      adapterPlanHash: key.adapterPlanHash, policyVersion: 'read-only-v1', targetTools: ['fetch_forecast'],
      operations: expect.arrayContaining([{ phase: 'call', op: 'InvokeTool', tool: 'fetch_forecast', index: 0 }]) }));
  });

  it('rejects contract drift before invoking the target', async () => {
    const { registry, key } = await fixture();
    const invoke = vi.fn(weatherInvoker);
    await expect(registry.execute({ key, oldContract, newContract: { ...newContract, description: 'Changed semantics' },
      input: { city: 'Ann Arbor' }, invoke })).rejects.toMatchObject({ code: 'CONTRACT_DRIFT' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('refuses revoked or tampered artifacts', async () => {
    const { dir, registry, key } = await fixture();
    await atomicWriteJson(join(dir, hashJson(key), 'adapter.plan.json'), { ...plan, rationale: 'tampered' });
    await expect(registry.execute({ key, oldContract, newContract, input: { city: 'Ann Arbor' }, invoke: weatherInvoker }))
      .rejects.toMatchObject({ code: 'PROMOTION_INVALIDATED' });
    const other = await fixture();
    await other.registry.invalidate(other.key, 'New semantic regression');
    await expect(other.registry.execute({ key: other.key, oldContract, newContract, input: { city: 'Ann Arbor' }, invoke: weatherInvoker }))
      .rejects.toMatchObject({ code: 'PROMOTION_INVALIDATED' });
  });

  it('reruns verification rather than trusting a supplied PROMOTED report', async () => {
    const { registry, report } = await fixture();
    await expect(registry.promote({ ...verification, report, invoke: async () => ({ current: { temperature: 0, summary: 'Clear' } }) }))
      .rejects.toMatchObject({ code: 'PROMOTION_REFUSED' });
    await expect(registry.promote({ ...verification, report: { ...report, verdict: 'INCONCLUSIVE' } })).rejects.toThrow();
  });

  it('distinguishes transient backend failure from promotion invalidation without leaking details', async () => {
    const { registry, key } = await fixture();
    await expect(registry.execute({ key, oldContract, newContract, input: { city: 'Ann Arbor' },
      invoke: async () => { throw new Error('private backend credential'); } }))
      .rejects.toMatchObject({ code: 'TARGET_EXECUTION_FAILED', message: 'Target tool execution failed' });
    expect(await registry.execute({ key, oldContract, newContract, input: { city: 'Ann Arbor' }, invoke: weatherInvoker }))
      .toEqual({ temperature: 64, conditions: 'Clear' });
  });
});
