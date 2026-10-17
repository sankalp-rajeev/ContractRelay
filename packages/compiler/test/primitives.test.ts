import { describe, expect, it, vi } from 'vitest';
import type { JsonSchema } from '@contractrelay/contracts';
import type { InputStep } from '@contractrelay/dsl';
import { compileCandidate } from '../src/index.js';

function fixture(oldField: JsonSchema, newField: JsonSchema, steps: readonly InputStep[]) {
  const base = {
    contractId: 'test', provenance: { kind: 'curated-fixture', source: 'unit-test' },
    sideEffect: 'READ_ONLY', idempotency: 'IDEMPOTENT',
    outputSchema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false }
  };
  return compileCandidate({
    version: 1, source_tool: 'old', target: { kind: 'single', tool: 'new' },
    steps, response: [], rationale: 'Controlled primitive fixture'
  }, { ...base, name: 'old', inputSchema: { type: 'object', properties: { value: oldField }, required: ['value'], additionalProperties: false } },
  { ...base, name: 'new', inputSchema: { type: 'object', properties: { value: newField }, required: ['value'], additionalProperties: false } });
}

describe('primitive conversions and rejection', () => {
  it.each([
    ['string', 'number', '12.5', 12.5],
    ['string', 'integer', '12', 12],
    ['number', 'string', 12.5, '12.5'],
    ['string', 'boolean', 'false', false],
    ['string', 'boolean', 'true', true]
  ] as const)('converts %s to %s deterministically', async (from, to, input, expected) => {
    const candidate = fixture({ type: from }, { type: to }, [{ op: 'ConvertType', arg: 'value', to, evidence: ['fixture'] }]);
    const invoke = vi.fn(async () => ({ ok: true }));
    await candidate.executeForVerification({ value: input }, invoke);
    expect(invoke).toHaveBeenCalledExactlyOnceWith('new', { value: expected });
  });

  it.each(['', ' ', '0x10', 'NaN', 'Infinity', '12x', '9007199254740993', '0.10000000000000000001', '1e-999'])(
    'refuses ambiguous numeric input %j before invocation', async (input) => {
      const candidate = fixture({ type: 'string' }, { type: 'number' }, [{ op: 'ConvertType', arg: 'value', to: 'number', evidence: ['fixture'] }]);
      const invoke = vi.fn();
      await expect(candidate.executeForVerification({ value: input }, invoke)).rejects.toMatchObject({ code: 'CONVERSION_FAILED' });
      expect(invoke).not.toHaveBeenCalled();
    }
  );

  it.each(['1.5', '9007199254740992'])('refuses lossy integer conversion %s', async (input) => {
    const candidate = fixture({ type: 'string' }, { type: 'integer' }, [{ op: 'ConvertType', arg: 'value', to: 'integer', evidence: ['fixture'] }]);
    await expect(candidate.executeForVerification({ value: input }, vi.fn())).rejects.toMatchObject({ code: 'CONVERSION_FAILED' });
  });

  it('maps enums with complete declared coverage', async () => {
    const candidate = fixture({ type: 'string', enum: ['open', 'closed'] }, { type: 'string', enum: ['active', 'inactive'] },
      [{ op: 'MapEnum', arg: 'value', mapping: { open: 'active', closed: 'inactive' }, evidence: ['fixture'] }]);
    const invoke = vi.fn(async () => ({ ok: true }));
    await candidate.executeForVerification({ value: 'closed' }, invoke);
    expect(invoke).toHaveBeenCalledExactlyOnceWith('new', { value: 'inactive' });
  });

  it('rejects incomplete enum coverage at compilation', () => {
    expect(() => fixture({ type: 'string', enum: ['open', 'closed'] }, { type: 'string' },
      [{ op: 'MapEnum', arg: 'value', mapping: { open: 'active' }, evidence: ['fixture'] }])).toThrow('Missing enum mapping');
  });

  it('refuses values outside an explicit enum mapping before backend invocation', async () => {
    const candidate = fixture({ type: 'string' }, { type: 'string' },
      [{ op: 'MapEnum', arg: 'value', mapping: { open: 'active' }, evidence: ['fixture'] }]);
    const invoke = vi.fn();
    await expect(candidate.executeForVerification({ value: 'unknown' }, invoke)).rejects.toMatchObject({ code: 'UNMAPPED_ENUM' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('rejects a known static type mismatch', () => {
    expect(() => fixture({ type: 'string' }, { type: 'number' }, [])).toThrow('cannot satisfy');
  });

  it('refuses explicit Reject plans without creating an adapter', () => {
    const contract = {
      contractId: 'test', name: 'old', provenance: { kind: 'curated-fixture', source: 'unit-test' },
      inputSchema: { type: 'object' }, sideEffect: 'READ_ONLY', idempotency: 'IDEMPOTENT'
    };
    expect(() => compileCandidate({ version: 1, op: 'Reject', reason: 'Cannot preserve sending', missing_evidence: ['state oracle'], risk: 'Creates drafts' }, contract, contract))
      .toThrow('Cannot preserve sending');
  });
});
