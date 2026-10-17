import { Ajv } from 'ajv';
import { z } from 'zod';
import { jsonValueSchema, toolContractSchema } from '@contractrelay/contracts';
import type { JsonValue } from '@contractrelay/contracts';
import type { ToolInvoker } from '@contractrelay/compiler';
import type { GateFixture } from '@contractrelay/verifier';
import { RefundFixture } from '../../../fixtures/synthetic/refund/sqlite.js';
import { SemanticFixture } from '../../../fixtures/synthetic/semantic/sqlite.js';

export const fixtureSpecSchema = z.object({ version: z.literal(1), scenario: z.enum(['tool-rename', 'arg-rename', 'weather-default',
  'unknown-default', 'string-number', 'money-scale', 'input-enum', 'response-enum', 'profile-projection', 'reading-projection',
  'report-composition', 'refund', 'send-vs-draft', 'delete-vs-deactivate', 'tightened-constraint']) }).strict();
export interface BenchmarkFixture extends GateFixture { invoke: ToolInvoker; close(): void }

/** Trusted backend implementations, independent of generated plans/wrappers. */
export function createBenchmarkFixture(value: unknown, contractsValue: unknown): BenchmarkFixture {
  const spec = fixtureSpecSchema.parse(value);
  const contracts = z.array(toolContractSchema).parse(contractsValue);
  const ajv = new Ajv({ strict: true, multipleOfPrecision: 12 });
  const validators = new Map(contracts.map((contract) => [contract.name, { input: ajv.compile(contract.inputSchema),
    output: contract.outputSchema === undefined ? undefined : ajv.compile(contract.outputSchema) }]));
  let stateful: RefundFixture | SemanticFixture | undefined;
  if (spec.scenario === 'refund') stateful = new RefundFixture();
  if (spec.scenario === 'send-vs-draft' || spec.scenario === 'delete-vs-deactivate') stateful = new SemanticFixture(spec.scenario);
  const fixture = stateful;
  const backend: ToolInvoker = async (tool, args) => {
    if (fixture) return fixture.invoke(tool, args);
    switch (spec.scenario) {
      case 'tool-rename': return { results: [`${args.query}-catalog`] };
      case 'arg-rename': return { name: `Member ${args.account_id}` };
      case 'weather-default': {
        const value = args.location === 'Ann Arbor' ? 64 : args.location === 'Oslo' ? 41 : 50;
        return { current: { temperature: args.units === 'imperial' ? value : (value - 32) * 5 / 9, summary: 'Clear' } };
      }
      case 'unknown-default': return { price: args.currency === 'USD' ? 10 : 9 };
      case 'string-number': return { square: (args.value as number) ** 2 };
      case 'money-scale': return { amount_cents: args.amount_cents as number };
      case 'input-enum': return { delay: args.priority === 'urgent' ? 1 : 10 };
      case 'response-enum': return { state: args.task_id === 'task-open' ? 'working' : 'completed' };
      case 'profile-projection': return { data: { identity: { id: args.id as string, label: `Person ${args.id}` } }, revision: 2 };
      case 'reading-projection': return { sensor: { reading: { degrees_c: args.station === 'north' ? -5 : 18 } } };
      case 'report-composition':
        if (tool === 'resolve_member') return { member_id: `member-${args.handle}` };
        return { report: { title: `Report for ${args.member_id}` } };
      case 'tightened-constraint': return { returned: args.limit as number };
      default: throw new Error('Invalid fixture scenario');
    }
  };
  return {
    environment: fixture?.environment ?? 'isolated-fixture',
    reset: async () => { await fixture?.reset(); }, observe: async () => fixture ? fixture.observe() : { side_effects: {} },
    close: () => { fixture?.close(); },
    invoke: async (tool, args) => {
      const validator = validators.get(tool);
      if (!validator || !validator.input(args)) throw new Error('INVALID_TARGET_CALL');
      const result = jsonValueSchema.parse(await backend(tool, args));
      if (validator.output && !validator.output(result)) throw new Error('INVALID_TARGET_OUTPUT');
      return result;
    }
  };
}

/** Independent old implementation used only during trusted case authoring. */
export function oldReference(scenario: z.infer<typeof fixtureSpecSchema>['scenario'], input: Record<string, JsonValue>): JsonValue {
  switch (scenario) {
    case 'tool-rename': return { results: [`${input.query}-catalog`] };
    case 'arg-rename': return { name: `Member ${input.user_id}` };
    case 'weather-default': return { temperature: input.city === 'Ann Arbor' ? 64 : input.city === 'Oslo' ? 41 : 50, conditions: 'Clear' };
    case 'unknown-default': return { price: 10 };
    case 'string-number': return { square: Number(input.value) * Number(input.value) };
    case 'money-scale': {
      const [whole, fraction = ''] = String(input.amount_dollars).split('.');
      return { amount_cents: Number(BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'))) };
    }
    case 'input-enum': return { delay: input.priority === 'high' ? 1 : 10 };
    case 'response-enum': return { state: input.task_id === 'task-open' ? 'active' : 'done' };
    case 'profile-projection': return { id: input.id as string, name: `Person ${input.id}` };
    case 'reading-projection': return { temperature: input.station === 'north' ? -5 : 18 };
    case 'report-composition': return { title: `Report for member-${input.handle}` };
    case 'tightened-constraint': return { returned: input.limit as number };
    default: throw new Error('Stateful references are independently authored SQL assertions');
  }
}
