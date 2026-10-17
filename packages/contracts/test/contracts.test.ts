import { describe, expect, it } from 'vitest';
import { canonicalJson, hashContract, hashJson, toolContractSchema } from '../src/index.js';
import weather from '../../../fixtures/synthetic/weather/old.contract.json' with { type: 'json' };

describe('ToolContract and canonical hashing', () => {
  it('loads the controlled fixture with provenance and explicit safety classes', () => {
    expect(toolContractSchema.parse(weather).sideEffect).toBe('READ_ONLY');
  });

  it('sorts nested keys while retaining array order', () => {
    expect(canonicalJson({ z: { b: 2, a: 1 }, a: [3, 2] })).toBe('{"a":[3,2],"z":{"a":1,"b":2}}');
    expect(hashJson({ a: 1, b: { c: 2, d: 3 } })).toBe(hashJson({ b: { d: 3, c: 2 }, a: 1 }));
    expect(hashJson([1, 2])).not.toBe(hashJson([2, 1]));
  });

  it('binds contract identity to semantics, schemas and provenance', () => {
    const hash = hashContract(weather);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashContract({ ...weather, description: 'Changed meaning' })).not.toBe(hash);
    expect(hashContract({ ...weather, inputSchema: { type: 'object' } })).not.toBe(hash);
    expect(hashContract({ ...weather, provenance: { ...weather.provenance, revision: '2' } })).not.toBe(hash);
  });

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY, { missing: undefined }, () => 1])(
    'refuses non-JSON data instead of silently dropping it', (value) => {
      expect(() => canonicalJson(value)).toThrow();
    }
  );

  it('requires explicit safety metadata and refuses unknown contract fields', () => {
    const withoutSafety: Record<string, unknown> = { ...weather };
    delete withoutSafety.sideEffect;
    expect(toolContractSchema.safeParse(withoutSafety).success).toBe(false);
    expect(toolContractSchema.safeParse({ ...weather, hiddenExecutable: 'code' }).success).toBe(false);
  });
});
