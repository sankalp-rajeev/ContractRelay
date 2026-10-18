import { describe, expect, it, vi } from 'vitest';
import { hashJson, toolContractSchema } from '@contractrelay/contracts';
import { adapterPlanSchema, propertyPathSchema } from '@contractrelay/dsl';
import { compileCandidate } from '../src/index.js';
import { oldContract, newContract, plan, invoke } from './structural.fixture.js';
import { plan as legacyPlan, oldContract as legacyOld, newContract as legacyNew } from '../../../fixtures/synthetic/weather/fixture.js';

describe('bounded generic structural construction', () => {
  it('renames ordinary, hyphenated and literal JSON keys without treating them as code', async () => {
    for (const name of ['ordinary', 'workload-type', "key');globalThis.__contractrelayPwned=true;//"]) {
      const outputSchema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] };
      const old = toolContractSchema.parse({ ...oldContract, inputSchema: { type: 'object', properties: { [name]: { type: 'string' } }, required: [name], additionalProperties: false }, outputSchema });
      const next = toolContractSchema.parse({ ...newContract, inputSchema: { type: 'object', properties: { 'item-type': { type: 'string' } }, required: ['item-type'], additionalProperties: false }, outputSchema });
      const candidate = compileCandidate({ version: 1, source_tool: old.name, target: { kind: 'single', tool: next.name }, steps: [{ op: 'RenameArg', from: name, to: 'item-type', evidence: ['doc'] }], response: [], rationale: 'Literal keys' }, old, next);
      const target = vi.fn(async () => ({ ok: true }));
      await candidate.executeForVerification({ [name]: 'value' }, target);
      expect(target).toHaveBeenCalledExactlyOnceWith(next.name, { 'item-type': 'value' });
      expect(Object.hasOwn(globalThis, '__contractrelayPwned')).toBe(false);
    }
  });

  it('preserves path and internal call-identifier safety', () => {
    expect(propertyPathSchema.parse('outer-field.inner-field')).toBe('outer-field.inner-field');
    for (const path of ['', 'a..b', 'a[0]', 'a\\b', 'a.__proto__', 'constructor', 'a.']) expect(propertyPathSchema.safeParse(path).success).toBe(false);
    expect(adapterPlanSchema.safeParse({ ...plan, target: { kind: 'compose', op: 'ComposeCalls', calls: [{ id: 'internal-id', tool: newContract.name, arguments: {}, evidence: ['doc'] }] }, steps: [] }).success).toBe(false);
  });

  it('wraps exactly once and reconstructs each response from an isolated original input', async () => {
    const candidate = compileCandidate(plan, oldContract, newContract);
    const target = vi.fn(invoke);
    const inputs = ['alpha', 'beta', 'gamma'].map(code => ({ 'sample-id': { code } }));
    const results = await Promise.all(inputs.map(input => candidate.executeForVerification(input, target)));
    expect(results).toEqual(inputs.map((input, index) => ({ matched: index === 0, query: input['sample-id'] })));
    expect(target.mock.calls.map(call => call[1])).toEqual(inputs.map(input => ({ 'sample-list': [input['sample-id']] })));
    await candidate.executeForVerification(inputs[0], async (_tool, args) => {
      (args['sample-list'] as { code: string }[])[0]!.code = 'mutated'; return { count: 1 };
    }).then(output => expect(output).toEqual({ matched: true, query: { code: 'alpha' } }));
    expect(inputs[0]).toEqual({ 'sample-id': { code: 'alpha' } });
  });

  it('supports singleton construction from an earlier call result and typed result comparisons', async () => {
    const load = toolContractSchema.parse({ ...oldContract, name: 'load_sample', outputSchema: { type: 'object', properties: { item: (oldContract.inputSchema as { properties: Record<string, object> }).properties['sample-id'] }, required: ['item'] } });
    const composed = { ...plan, steps: [], target: { kind: 'compose', op: 'ComposeCalls', calls: [
      { id: 'loaded', tool: load.name, arguments: { 'sample-id': { kind: 'input', path: 'sample-id' } }, evidence: ['structural-doc'] },
      { id: 'scanned', tool: newContract.name, arguments: { 'sample-list': { kind: 'wrapArray', source: { kind: 'result', call: 'loaded', path: 'item' }, evidence: ['structural-doc'] } }, evidence: ['structural-doc'] }
    ] }, response: [{ op: 'ConstructResponse', fields: { matched: { kind: 'compareInteger', source: { kind: 'result', call: 'scanned', path: 'count' }, operator: 'eq', value: 1 }, query: { kind: 'input', path: 'sample-id' } }, evidence: ['structural-doc'] }] };
    const candidate = compileCandidate(composed, oldContract, [load, newContract]);
    expect(await candidate.executeForVerification({ 'sample-id': { code: 'alpha' } }, async (tool, args) => tool === load.name ? { item: args['sample-id']! } : invoke(tool, args))).toEqual({ matched: true, query: { code: 'alpha' } });
    const forward = structuredClone(composed); forward.target.calls[0]!.arguments = { 'sample-id': { kind: 'result', call: 'scanned', path: 'count' } } as never;
    expect(() => compileCandidate(forward, oldContract, [load, newContract])).toThrow('earlier call');
  });

  it('refuses coercion, fractions and missing comparison sources', async () => {
    const candidate = compileCandidate(plan, oldContract, newContract);
    for (const count of [0.5, '1', Number.MAX_SAFE_INTEGER + 1]) await expect(candidate.executeForVerification({ 'sample-id': { code: 'alpha' } }, async () => ({ count }))).rejects.toThrow();
    const invalid = { ...plan, response: [{ op: 'ConstructResponse', fields: { matched: { kind: 'compareInteger', source: { kind: 'input', path: 'sample-id.code' }, operator: 'gt', value: 0 } }, evidence: ['structural-doc'] }] };
    expect(() => compileCandidate(invalid, oldContract, newContract)).toThrow('numeric schema');
  });

  it('rejects arbitrary structural expressions, unsafe keys and oversized construction', () => {
    for (const binding of [{ kind: 'expression', code: 'return true' }, { kind: 'wrapArray', source: { kind: 'input', path: 'sample-id' } }, { kind: 'compareInteger', source: { kind: 'response', path: 'count' }, operator: 'eval', value: 1 }, { kind: 'constant', value: 'x'.repeat(4097) }]) {
      expect(adapterPlanSchema.safeParse({ ...plan, response: [{ op: 'ConstructResponse', fields: { matched: binding }, evidence: ['doc'] }] }).success).toBe(false);
    }
    expect(adapterPlanSchema.safeParse({ ...plan, response: [{ op: 'ConstructResponse', fields: Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`field${i}`, { kind: 'constant', value: true }])), evidence: ['doc'] }] }).success).toBe(false);
    expect(adapterPlanSchema.safeParse({ ...plan, steps: [{ op: 'RenameArg', from: 'sample-id', to: '__proto__', evidence: ['doc'] }] }).success).toBe(false);
  });

  it('preserves canonical serialization and existing plan hashes without new defaults', () => {
    expect(compileCandidate(legacyPlan, legacyOld, legacyNew).planHash).toBe(hashJson(legacyPlan));
    expect(adapterPlanSchema.parse(legacyPlan)).toEqual(legacyPlan);
    const canonical = adapterPlanSchema.parse(plan);
    expect(hashJson(canonical)).toBe(hashJson(JSON.parse(JSON.stringify(canonical))));
    expect(compileCandidate(canonical, oldContract, newContract).planHash).toBe(hashJson(plan));
  });
});
