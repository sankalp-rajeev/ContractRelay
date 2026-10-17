import { hashContract } from '../../../packages/contracts/src/index.js';
import type { ToolInvoker } from '../../../packages/compiler/src/index.js';
import type { GateEvidence } from '../../../packages/verifier/src/index.js';
import oldContract from './old.contract.json' with { type: 'json' };
import newContract from './new.contract.json' with { type: 'json' };
import plan from './adapter.plan.json' with { type: 'json' };

export { oldContract, newContract, plan };
export const weatherGate: GateEvidence = {
  version: 1,
  traces: [{ traceId: 'ann-arbor', tool: 'get_weather', input: { city: 'Ann Arbor' },
    output: { temperature: 64, conditions: 'Clear' }, contractHash: hashContract(oldContract) }],
  predicates: [
    { id: 'fahrenheit', trace_id: 'ann-arbor', kind: 'equals', path: 'temperature', expected: 64 },
    { id: 'conditions', trace_id: 'ann-arbor', kind: 'equals', path: 'conditions', expected: 'Clear' }
  ],
  metamorphic: [],
  evidence_refs: ['change.md#tool', 'change.md#location', 'change.md#units', 'change.md#response'],
  supported_defaults: [{ arg: 'units', value: 'imperial', evidence_ref: 'change.md#units' }]
};

export const weatherInvoker: ToolInvoker = async (tool, args) => {
  if (tool !== 'fetch_forecast' || typeof args.location !== 'string') throw new Error('Unexpected fixture call');
  const fahrenheit = args.location.toLowerCase() === 'ann arbor' ? 64 : 50;
  return { current: { temperature: args.units === 'imperial' ? fahrenheit : (fahrenheit - 32) * 5 / 9, summary: 'Clear' } };
};
