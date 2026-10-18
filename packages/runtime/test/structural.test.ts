import { it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashJson } from '@contractrelay/contracts';
import { atomicWriteJson } from '@contractrelay/contracts/artifacts';
import { predicateSchema, verifyCandidate } from '@contractrelay/verifier';
import { PromotionRegistry } from '../src/index.js';
import { oldContract, newContract, plan, gate, invoke } from '../../compiler/test/structural.fixture.js';

it('independently gates structural construction, then binds and rechecks the exact promoted artifact', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bounded-structural-registry-'));
  try {
    const input = { plan, oldContract, newContract, gateEvidence: gate, invoke };
    const report = await verifyCandidate(input);
    expect(report.verdict).toBe('PROMOTED');
    expect(predicateSchema.safeParse({ id: 'hyphen', trace_id: 'alpha', kind: 'exists', path: 'response-field.nested-field' }).success).toBe(true);
    expect(predicateSchema.safeParse({ id: 'unsafe', trace_id: 'alpha', kind: 'exists', path: 'response-field.__proto__' }).success).toBe(false);
    const registry = new PromotionRegistry(root);
    const key = await registry.promote({ ...input, report });
    expect(await registry.execute({ key, oldContract, newContract, input: { 'sample-id': { code: 'beta' } }, invoke })).toEqual({ matched: false, query: { code: 'beta' } });
    const wrong = { ...input, invoke: async () => ({ count: 1 }) };
    expect((await verifyCandidate(wrong)).verdict).toBe('REJECTED');
    await expect(registry.promote({ ...wrong, report })).rejects.toThrow();
    await atomicWriteJson(join(root, hashJson(key), 'adapter.plan.json'), { ...plan, rationale: 'changed after promotion' });
    await expect(registry.execute({ key, oldContract, newContract, input: { 'sample-id': { code: 'alpha' } }, invoke })).rejects.toMatchObject({ code: 'PROMOTION_INVALIDATED' });
  } finally { await rm(root, { recursive: true, force: true }); }
});
