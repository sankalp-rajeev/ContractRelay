import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashJson, hashContract, toolContractSchema } from '../packages/contracts/src/index.js';
import type { JsonValue, ToolContract } from '../packages/contracts/src/index.js';
import { writeOnceJson, readJson } from '../packages/contracts/src/artifacts.js';
import { freezeEvidenceCase } from '../packages/contracts/src/evidence.js';
import { mechanicalChangeSchema, wrapperPrompt, replannerPrompt } from '../packages/benchmark/src/baselines.js';
import { oldReference } from '../packages/benchmark/src/fixtures.js';
import { oldContract as weatherOld, newContract as weatherNew } from '../fixtures/synthetic/weather/fixture.js';
import { oldRefundContract, refundTargetContracts, refundEvidenceRefs } from '../fixtures/synthetic/refund/contracts.js';
import { refundGate } from '../fixtures/synthetic/refund/gate.js';
import { semanticCase } from '../fixtures/synthetic/semantic/sqlite.js';
import type { GateEvidence } from '../packages/verifier/src/index.js';
import type { SynthesisEvidence } from '../packages/synthesizer/src/index.js';

const root = fileURLToPath(new URL('../benchmarks', import.meta.url));
const protocol = { version: 1, frozen_before_held_out_authoring: true,
  b0_prompt_hash: hashJson(replannerPrompt), b2_prompt_hash: hashJson(wrapperPrompt),
  b1_source_hash: hashJson((await readFile(new URL('../packages/benchmark/src/baselines.ts', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')),
  b3_source_hash: hashJson((await readFile(new URL('../packages/synthesizer/src/synthesis.ts', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')),
  development_model: 'gemini-3.5-flash-lite', final_model: 'gemini-3.8-flash', temperature: 0.2,
  final_trials: 3, cache_final: false, sandbox_config_hash: hashJson(await readJson(join(root, '../config/sandbox.json'))) };
// Immutable publication precedes authoring any held-out case.
await writeOnceJson(join(root, 'manifests/protocol-v1.json'), protocol);
const schema = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const str = { type: 'string', minLength: 1 };
const num = { type: 'number' };
const integer = { type: 'integer' };
function contract(id: string, name: string, input: unknown, output: unknown): ToolContract {
  return toolContractSchema.parse({ contractId: `${id}/${name}`, version: '1', name, inputSchema: input, outputSchema: output,
    provenance: { kind: 'synthetic-mutation', source: `benchmarks/cases/${id}` }, sideEffect: 'READ_ONLY', idempotency: 'IDEMPOTENT' });
}
const entries: JsonValue[] = [];
type Task = { id: string; input: Record<string, JsonValue>; replays: number };
async function publish(options: { id: string; scenario: string; changeClass: string; heldOut?: boolean; label?: 'compatible' | 'incompatible';
  old: ToolContract; targets: ToolContract[]; docs: { id: string; text: string }[]; gate: GateEvidence; tasks: Task[]; sealed: JsonValue;
  policy?: string; tier?: string; influencedDesign?: boolean }) {
  const directory = join(root, 'cases', options.id);
  for (const folder of ['synthesis', 'gate', 'sealed-eval']) await mkdir(join(directory, folder), { recursive: true });
  const synthesis: SynthesisEvidence = { dataClass: 'controlled-synthetic', oldContract: options.old, newContracts: options.targets, documents: options.docs };
  const fixture = { version: 1, scenario: options.scenario };
  await writeOnceJson(join(directory, 'synthesis/evidence.json'), synthesis);
  await writeOnceJson(join(directory, 'gate/evidence.json'), options.gate);
  await writeOnceJson(join(directory, 'sealed-eval/evidence.json'), options.sealed);
  await writeOnceJson(join(directory, 'tasks.json'), options.tasks);
  await writeOnceJson(join(directory, 'fixture.json'), fixture);
  const manifest = await freezeEvidenceCase(directory, options.id, options.heldOut ?? false);
  entries.push({ id: options.id, change_class: options.changeClass, held_out: manifest.held_out,
  compatibility: options.scenario === 'unknown-default' ? 'insufficient-evidence' : options.label ?? 'compatible', oracle_tier: options.tier ?? 'B', policy: options.policy ?? 'read-only-v1',
    influenced_design: options.influencedDesign ?? !manifest.held_out, evidence_manifest_hash: hashJson(manifest),
    fixture_hash: hashJson(fixture), tasks_hash: hashJson(options.tasks) });
}
async function mechanical(options: { id: string; scenario: Parameters<typeof oldReference>[0]; changeClass: string;
  old: ToolContract; target: ToolContract; changes?: unknown[]; docs?: string; gateInput: Record<string, JsonValue>;
  hidden: Record<string, JsonValue>[]; heldOut?: boolean; label?: 'compatible' | 'incompatible' }) {
  const document = options.changes === undefined ? { id: 'change.md', text: options.docs! } : { id: 'change.json',
    text: JSON.stringify(mechanicalChangeSchema.parse({ version: 1, target_tool: options.target.name, changes: options.changes })) };
  const expected = oldReference(options.scenario, options.gateInput);
  const defaults = (options.changes ?? []).filter((value): value is { kind: 'default'; arg: string; value: JsonValue } =>
    typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'default');
  const gate: GateEvidence = { version: 1, traces: [{ traceId: 'gate-1', tool: options.old.name, contractHash: hashContract(options.old),
    input: options.gateInput, output: expected }], predicates: [{ id: 'old-behavior', trace_id: 'gate-1', path: '', kind: 'equals', expected }],
    metamorphic: [], evidence_refs: [document.id], supported_defaults: defaults.map((value) => ({ arg: value.arg, value: value.value, evidence_ref: document.id })) };
  const tasks = options.hidden.map((input, index) => ({ id: `hidden-${index + 1}`, input, replays: 1 }));
  await publish({ ...options, targets: [options.target], docs: [document], gate, tasks,
    sealed: { version: 1, outcomes: tasks.map((task) => ({ task_id: task.id, output: oldReference(options.scenario, task.input), state: {} })) } });
}

await mechanical({ id: '01-tool-rename', scenario: 'tool-rename', changeClass: 'rename',
  old: contract('01', 'search', schema({ query: str }), schema({ results: { type: 'array', items: str } })),
  target: contract('01', 'search_catalog', schema({ query: str }), schema({ results: { type: 'array', items: str } })),
  changes: [], gateInput: { query: 'desk' }, hidden: [{ query: 'lamp' }, { query: 'chair' }] });
await mechanical({ id: '02-arg-rename', scenario: 'arg-rename', changeClass: 'rename',
  old: contract('02', 'read_member', schema({ user_id: str }), schema({ name: str })),
  target: contract('02', 'read_member', schema({ account_id: str }), schema({ name: str })),
  changes: [{ kind: 'rename_arg', from: 'user_id', to: 'account_id' }], gateInput: { user_id: 'a' }, hidden: [{ user_id: 'b' }, { user_id: 'c' }] });
await mechanical({ id: '03-weather-default', scenario: 'weather-default', changeClass: 'required-default', old: toolContractSchema.parse(weatherOld),
  target: toolContractSchema.parse(weatherNew), changes: [{ kind: 'rename_arg', from: 'city', to: 'location' },
    { kind: 'default', arg: 'units', value: 'imperial' }, { kind: 'projection', mapping: { temperature: 'current.temperature', conditions: 'current.summary' } }],
  gateInput: { city: 'Ann Arbor' }, hidden: [{ city: 'Oslo' }, { city: 'Paris' }] });
await mechanical({ id: '04-unknown-default', scenario: 'unknown-default', changeClass: 'required-default', label: 'incompatible',
  old: contract('04', 'price', schema({ item: str }), schema({ price: num })),
  target: contract('04', 'price', schema({ item: str, currency: { type: 'string', enum: ['USD', 'EUR'] } }), schema({ price: num })),
  docs: 'Currency is now mandatory. The old account currency and its default are unavailable. No evidence establishes a compatible constant.',
  gateInput: { item: 'book' }, hidden: [{ item: 'pen' }] });
await mechanical({ id: '05-string-number', scenario: 'string-number', changeClass: 'type-conversion',
  old: contract('05', 'square', schema({ value: { type: 'string', pattern: '^(0|[1-9][0-9]{0,2})$' } }), schema({ square: num })),
  target: contract('05', 'square', schema({ value: { type: 'integer', minimum: 0, maximum: 999 } }), schema({ square: num })),
  changes: [{ kind: 'convert', arg: 'value', to: 'integer' }], gateInput: { value: '12' }, hidden: [{ value: '29' }, { value: '0' }] });
await mechanical({ id: '06-money-scale', scenario: 'money-scale', changeClass: 'type-conversion',
  old: contract('06', 'quote', schema({ amount_dollars: { type: 'number', minimum: 0.01, maximum: 100, multipleOf: 0.01 } }), schema({ amount_cents: integer })),
  target: contract('06', 'quote', schema({ amount_cents: { type: 'integer', minimum: 1, maximum: 10000 } }), schema({ amount_cents: integer })),
  changes: [{ kind: 'rename_arg', from: 'amount_dollars', to: 'amount_cents' }, { kind: 'convert', arg: 'amount_cents', to: 'integer', scale: 100 }],
  gateInput: { amount_dollars: 12.99 }, hidden: [{ amount_dollars: 0.29 }, { amount_dollars: 99.99 }] });
await mechanical({ id: '07-input-enum', scenario: 'input-enum', changeClass: 'enum',
  old: contract('07', 'queue_delay', schema({ priority: { type: 'string', enum: ['low', 'high'] } }), schema({ delay: integer })),
  target: contract('07', 'queue_delay', schema({ priority: { type: 'string', enum: ['standard', 'urgent'] } }), schema({ delay: integer })),
  changes: [{ kind: 'enum', arg: 'priority', mapping: { low: 'standard', high: 'urgent' } }], gateInput: { priority: 'low' }, hidden: [{ priority: 'high' }] });
await mechanical({ id: '09-profile-projection', scenario: 'profile-projection', changeClass: 'response-shape',
  old: contract('09', 'profile', schema({ id: str }), schema({ id: str, name: str })),
  target: contract('09', 'profile', schema({ id: str }), schema({ data: schema({ identity: schema({ id: str, label: str }) }), revision: integer })),
  changes: [{ kind: 'projection', mapping: { id: 'data.identity.id', name: 'data.identity.label' } }],
  gateInput: { id: 'one' }, hidden: [{ id: 'two' }, { id: 'three' }] });
await mechanical({ id: '10-reading-projection', scenario: 'reading-projection', changeClass: 'response-shape',
  old: contract('10', 'reading', schema({ station: str }), schema({ temperature: num })),
  target: contract('10', 'reading', schema({ station: str }), schema({ sensor: schema({ reading: schema({ degrees_c: num }) }) })),
  changes: [{ kind: 'projection', mapping: { temperature: 'sensor.reading.degrees_c' } }], gateInput: { station: 'south' }, hidden: [{ station: 'north' }] });

const refundDocs = await readFile(new URL('../fixtures/synthetic/refund/change.md', import.meta.url), 'utf8');
await publish({ id: '12-refund-workflow', scenario: 'refund', changeClass: 'stateful-composition', tier: 'A', policy: 'stateful-fixture-v1',
  old: oldRefundContract, targets: refundTargetContracts, docs: refundEvidenceRefs.map((id) => ({ id, text: refundDocs })), gate: refundGate,
  tasks: [{ id: 'hidden-1', input: { order_id: 'order-2', amount_dollars: 3.21, request_id: 'hidden-request' }, replays: 2 }],
  sealed: { version: 1, outcomes: [{ task_id: 'hidden-1', output: { refund_id: 'refund-hidden-request', status: 'refunded' },
    state: { refund_count: 1, refund_amount_cents: 321, ledger_count: 1, ledger_total_cents: 321, ledger_provenance: 'customer_request',
      request_key: 'hidden-request', order_status: 'refunded', payment_state: 'refunded', refunded_cents: 321,
      side_effects: { refund_payment: 1, update_order_status: 1, lookup_payment: 0 } } }] } });
for (const [index, scenario] of ['send-vs-draft', 'delete-vs-deactivate'].entries()) {
  const data = semanticCase(scenario as 'send-vs-draft' | 'delete-vs-deactivate');
  await publish({ id: `${index + 13}-${scenario}`, scenario, changeClass: 'semantic-incompatibility', label: 'incompatible', tier: 'C', policy: 'stateful-simulator-v1',
    old: data.oldContract, targets: [data.newContract], gate: data.gateEvidence,
    docs: [{ id: 'change.md#surface', text: scenario === 'send-vs-draft'
      ? 'send_email sent immediately. create_message only saves a draft; no send tool or send operation exists. Surface success means draft creation.'
      : 'delete_user removed the user row. deactivate_user only changes active to false; no row-removal capability exists.' }],
    tasks: [{ id: 'hidden-1', input: scenario === 'send-vs-draft' ? { recipient: 'hidden@example.test' } : { user_id: 'user-1' }, replays: 1 }],
    sealed: { version: 1, outcomes: [{ task_id: 'hidden-1', output: { success: true }, state: scenario === 'send-vs-draft' ? { sent_count: 1 } : { user_count: 0 } }] } });
}

// The following three cases are authored only after baseline source/prompt freeze.
await mechanical({ id: '08-response-enum', scenario: 'response-enum', changeClass: 'enum', heldOut: true,
  old: contract('08', 'task_state', schema({ task_id: str }), schema({ state: { type: 'string', enum: ['active', 'done'] } })),
  target: contract('08', 'task_state', schema({ task_id: str }), schema({ state: { type: 'string', enum: ['working', 'completed'] } })),
  changes: [{ kind: 'response_enum', field: 'state', mapping: { working: 'active', completed: 'done' } }],
  gateInput: { task_id: 'task-open' }, hidden: [{ task_id: 'task-closed' }] });
const reportOld = contract('11', 'member_report', schema({ handle: str }), schema({ title: str }));
const resolve = contract('11', 'resolve_member', schema({ handle: str }), schema({ member_id: str }));
const reportNew = contract('11', 'read_report', schema({ member_id: str }), schema({ report: schema({ title: str }) }));
await publish({ id: '11-report-composition', scenario: 'report-composition', changeClass: 'composition', heldOut: true,
  old: reportOld, targets: [resolve, reportNew], docs: [{ id: 'change.md', text: 'member_report(handle) is replaced by resolve_member(handle), whose member_id is passed to read_report(member_id). The old title is report.title from read_report. Both calls are read only; no defaults are required.' }],
  gate: { version: 1, traces: [{ traceId: 'gate-1', tool: reportOld.name, input: { handle: 'alice' }, output: { title: 'Report for member-alice' }, contractHash: hashContract(reportOld) }],
    predicates: [{ id: 'old-title', trace_id: 'gate-1', kind: 'equals', path: 'title', expected: 'Report for member-alice' }],
    metamorphic: [], evidence_refs: ['change.md'], supported_defaults: [] },
  tasks: [{ id: 'hidden-1', input: { handle: 'bob' }, replays: 1 }],
  sealed: { version: 1, outcomes: [{ task_id: 'hidden-1', output: { title: 'Report for member-bob' }, state: {} }] } });
await mechanical({ id: '15-tightened-constraint', scenario: 'tightened-constraint', changeClass: 'constraint', heldOut: true, label: 'incompatible',
  old: contract('15', 'list_items', schema({ limit: { type: 'integer', minimum: 1, maximum: 100 } }), schema({ returned: integer })),
  target: contract('15', 'list_items', schema({ limit: { type: 'integer', minimum: 1, maximum: 10 } }), schema({ returned: integer })),
  docs: 'New list_items accepts at most ten items. Old calls requested up to 100. There is no cursor, offset, pagination or other tool. Clamping changes behavior, so compatibility over the entire old contract cannot be established.',
  gateInput: { limit: 5 }, hidden: [{ limit: 99 }] });

entries.sort((a, b) => String((a as Record<string, JsonValue>).id).localeCompare(String((b as Record<string, JsonValue>).id)));
await writeOnceJson(join(root, 'manifests/suite-v1.json'), { version: 1, case_count: 15, held_out_count: 3, protocol_hash: hashJson(protocol),
  fixture_source_hash: hashJson((await readFile(new URL('../packages/benchmark/src/fixtures.ts', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')), cases: entries });
console.log(JSON.stringify({ cases_frozen: entries.length, held_out: 3, protocol_hash: hashJson(protocol), kind: 'controlled-suite-freeze' }, null, 2));
