import { hashContract, toolContractSchema } from '@contractrelay/contracts';
import { adapterPlanSchema } from '@contractrelay/dsl';
import type { JsonValue } from '@contractrelay/contracts';
const sample = { type: 'object', properties: { code: { type: 'string' } }, required: ['code'], additionalProperties: false };
const base = { contractId: 'bounded-construction-test', provenance: { kind: 'curated-fixture', source: 'generic-unit-fixture' }, sideEffect: 'READ_ONLY', idempotency: 'IDEMPOTENT' };
export const oldContract = toolContractSchema.parse({ ...base, name: 'find_sample',
  inputSchema: { type: 'object', properties: { 'sample-id': sample }, required: ['sample-id'], additionalProperties: false },
  outputSchema: { type: 'object', properties: { matched: { type: 'boolean' }, query: sample }, required: ['matched', 'query'], additionalProperties: false } });
export const newContract = toolContractSchema.parse({ ...base, name: 'scan_samples',
  inputSchema: { type: 'object', properties: { 'sample-list': { type: 'array', items: sample, minItems: 1 } }, required: ['sample-list'], additionalProperties: false },
  outputSchema: { type: 'object', properties: { count: { type: 'number' } }, required: ['count'], additionalProperties: false } });
export const plan = adapterPlanSchema.parse({ version: 1, source_tool: oldContract.name, target: { kind: 'single', tool: newContract.name },
  steps: [{ op: 'WrapArray', source: 'sample-id', target: 'sample-list', evidence: ['structural-doc'] }],
  response: [{ op: 'ConstructResponse', fields: { matched: { kind: 'compareInteger', source: { kind: 'response', path: 'count' }, operator: 'gt', value: 0 }, query: { kind: 'input', path: 'sample-id' } }, evidence: ['structural-doc'] }],
  rationale: 'A bounded generic scalar-to-batch lookup migration' });
export async function invoke(_tool: string, args: Readonly<Record<string, JsonValue>>) {
  const samples = args['sample-list'] as { code: string }[];
  return { count: samples.filter(sample => sample.code === 'alpha').length };
}
export const gate = { version: 1, traces: ['alpha', 'beta'].map(code => ({ traceId: code, tool: oldContract.name, input: { 'sample-id': { code } },
  output: { matched: code === 'alpha', query: { code } }, contractHash: hashContract(oldContract), replays: 2 })),
  predicates: ['alpha', 'beta'].map(code => ({ id: `expected-${code}`, trace_id: code, kind: 'equals', path: '', expected: { matched: code === 'alpha', query: { code } } })),
  metamorphic: [], evidence_refs: ['structural-doc'], supported_defaults: [] };
