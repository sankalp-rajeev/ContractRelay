import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { compileCandidate } from '../src/index.js';

const base = { contractId: 'currency', provenance: { kind: 'curated-fixture', source: 'property-test' },
  sideEffect: 'READ_ONLY', idempotency: 'IDEMPOTENT' };
const old = { ...base, name: 'old', inputSchema: { type: 'object', properties: { amount: { type: 'number' } }, required: ['amount'], additionalProperties: false } };
const next = { ...base, name: 'new', inputSchema: { type: 'object', properties: { amount: { type: 'integer' } }, required: ['amount'], additionalProperties: false } };
const plan = { version: 1, source_tool: 'old', target: { kind: 'single', tool: 'new' },
  steps: [{ op: 'ConvertType', arg: 'amount', to: 'integer', scale: 100, evidence: ['documented dollars-to-cents'] }], response: [], rationale: 'Exact minor-unit conversion' };

describe('deterministic conversion properties', () => {
  it('preserves cents across the supported monetary range without floating-point rounding', async () => {
    const candidate = compileCandidate(plan, old, next);
    await fc.assert(fc.asyncProperty(fc.integer({ min: -100_000_000, max: 100_000_000 }), async (cents) => {
      const dollars = cents / 100;
      const result = await candidate.executeForVerification({ amount: dollars }, async (_tool, args) => args);
      expect(result).toEqual({ amount: cents });
    }), { seed: 20261017, numRuns: 500 });
  });

  it.each([0.001, 12.345, 9007199254740991, 1e-7])('refuses unsupported precision/range %s', async (amount) => {
    const candidate = compileCandidate(plan, old, next);
    await expect(candidate.executeForVerification({ amount }, async () => null)).rejects.toMatchObject({ code: 'CONVERSION_FAILED' });
  });
});
