import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { hashJson, hashContract, toolContractSchema } from '../packages/contracts/src/index.js';
import type { JsonValue } from '../packages/contracts/src/index.js';
import { readJson, writeOnceJson } from '../packages/contracts/src/artifacts.js';
import { freezeEvidenceCase } from '../packages/contracts/src/evidence.js';
import { wrapperPrompt, replannerPrompt } from '../packages/benchmark/src/baselines.js';

const root = fileURLToPath(new URL('../benchmarks/', import.meta.url));
const sourceHash = async (file: string) => hashJson((await readFile(new URL(file, import.meta.url), 'utf8')).replace(/\r\n/g, '\n'));
const previous = await readJson(join(root, 'manifests/suite-v2.json')) as { cases: Record<string, JsonValue>[] };
const protocol = { version: 2, frozen_before_held_out_authoring: true,
  b0_prompt_hash: hashJson(replannerPrompt), b2_prompt_hash: hashJson(wrapperPrompt),
  b1_source_hash: await sourceHash('../packages/benchmark/src/baselines.ts'), b3_source_hash: await sourceHash('../packages/synthesizer/src/synthesis.ts'),
  development_model: 'gemini-3.5-flash-lite', final_model: 'gemini-3.8-flash', temperature: 0.2, final_trials: 3, cache_final: false,
  sandbox_config_hash: hashJson(await readJson(join(root, '../config/sandbox.json'))),
  revision_reason: 'Generic provider schema complexity correction validated on development cases; canonical DSL bounds unchanged. Earlier pilot results retained; fresh held-out cases authored after this freeze.' };
await writeOnceJson(join(root, 'manifests/protocol-v2.json'), protocol);
const schema = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const str = { type: 'string', minLength: 1 };
function contract(id: string, name: string, input: unknown, output: unknown, description: string) {
  return toolContractSchema.parse({ contractId: `${id}/${name}`, name, inputSchema: input, outputSchema: output, description,
    provenance: { kind: 'synthetic-mutation', source: `benchmarks/cases/${id}` }, sideEffect: 'READ_ONLY', idempotency: 'IDEMPOTENT' });
}
const entries = previous.cases.filter((item) => !item.held_out);
async function publish(id: string, scenario: string, changeClass: string, old: ReturnType<typeof contract>, targets: ReturnType<typeof contract>[],
  docs: { id: string; text: string }[], gateInput: JsonValue, gateOutput: JsonValue, taskInput: JsonValue, hiddenOutput: JsonValue,
  hiddenState: JsonValue = {}, compatibility = 'compatible', tier = 'B') {
  const directory = join(root, 'cases', id);
  for (const folder of ['synthesis', 'gate', 'sealed-eval']) await mkdir(join(directory, folder), { recursive: true });
  const tasks = [{ id: 'hidden-1', input: taskInput, replays: 1 }];
  const fixture = { version: 1, scenario };
  await writeOnceJson(join(directory, 'synthesis/evidence.json'), { dataClass: 'controlled-synthetic', oldContract: old, newContracts: targets, documents: docs });
  await writeOnceJson(join(directory, 'gate/evidence.json'), { version: 1, traces: [{ traceId: 'gate-1', tool: old.name,
    contractHash: hashContract(old), input: gateInput, output: gateOutput }], predicates: [{ id: 'old-output', trace_id: 'gate-1', kind: 'equals', path: '', expected: gateOutput }],
    metamorphic: [], evidence_refs: docs.map((doc) => doc.id), supported_defaults: [] });
  await writeOnceJson(join(directory, 'sealed-eval/evidence.json'), { version: 1, outcomes: [{ task_id: 'hidden-1', output: hiddenOutput, state: hiddenState }] });
  await writeOnceJson(join(directory, 'fixture.json'), fixture); await writeOnceJson(join(directory, 'tasks.json'), tasks);
  const manifest = await freezeEvidenceCase(directory, id, true);
  entries.push({ id, change_class: changeClass, held_out: true, compatibility, oracle_tier: tier, policy: 'read-only-v1', influenced_design: false,
    evidence_manifest_hash: hashJson(manifest), fixture_hash: hashJson(fixture), tasks_hash: hashJson(tasks) });
}
// Fresh holdouts begin only after the corrected baseline/protocol freeze above.
const oldDelivery = contract('08-delivery-enum', 'shipment_status', schema({ parcel_id: str }),
  schema({ phase: { type: 'string', enum: ['preparing', 'moving', 'received'] } }), 'Return the logical delivery phase.');
const newDelivery = contract('08-delivery-enum', 'shipment_status', schema({ parcel_id: str }),
  schema({ stage: { type: 'string', enum: ['queued', 'transporting', 'settled'] } }), 'Return the new delivery stage.');
await publish('08-delivery-enum', 'delivery-enum', 'enum', oldDelivery, [newDelivery], [{ id: 'change.json', text: JSON.stringify({ version: 1,
  target_tool: 'shipment_status', changes: [{ kind: 'projection', mapping: { phase: 'stage' } },
    { kind: 'response_enum', field: 'phase', mapping: { queued: 'preparing', transporting: 'moving', settled: 'received' } }] }) }],
  { parcel_id: 'parcel-new' }, { phase: 'preparing' }, { parcel_id: 'parcel-delivered' }, { phase: 'received' });
const oldReport = contract('11-workspace-composition', 'workspace_overview', schema({ user: str }), schema({ label: str }), 'Resolve the user and return the label of their workspace.');
const user = contract('11-workspace-composition', 'resolve_user', schema({ user: str }), schema({ uid: str }), 'Resolve a username to uid.');
const workspace = contract('11-workspace-composition', 'select_workspace', schema({ uid: str }), schema({ workspace_id: str }), 'Resolve uid to their workspace_id.');
const read = contract('11-workspace-composition', 'read_workspace', schema({ workspace_id: str }), schema({ details: schema({ label: str }) }), 'Read workspace details.');
await publish('11-workspace-composition', 'three-call-report', 'composition', oldReport, [user, workspace, read], [{ id: 'change.md',
  text: 'Replace workspace_overview(user) with resolve_user(user), then select_workspace(uid from the first result), then read_workspace(workspace_id from the second result). Project the old label from the third result details.label. Every tool is read only; no default is necessary.' }],
  { user: 'builder' }, { label: 'Overview workspace-uid-builder' }, { user: 'auditor' }, { label: 'Overview workspace-uid-auditor' });
const output = schema({ records: { type: 'array', items: str } });
const oldStream = contract('15-stream-cap', 'read_stream', schema({ count: { type: 'integer', minimum: 1, maximum: 80 } }), output,
  'Retrieve the first count backend records in order, returning their actual opaque identifiers. The request must perform the retrieval.');
const newStream = contract('15-stream-cap', 'read_stream', schema({ page_size: { type: 'integer', minimum: 1, maximum: 12 } }), output,
  'Retrieve only the first page_size records, at most twelve. No offset, cursor, pagination, alternate ordering or other retrieval tool exists.');
const records = Array.from({ length: 80 }, (_, index) => `record-${hashJson({ controlled_dataset: 'stream-v3', position: index + 1 }).slice(0, 20)}`);
await publish('15-stream-cap', 'stream-cap', 'constraint', oldStream, [newStream], [{ id: 'change.md',
  text: 'The count argument is renamed page_size but the new maximum is twelve, while old requests retrieved up to eighty opaque backend records. No pagination, cursor, offset or other tool exists. Clamping, repeats of the first page or fabricating identifiers does not preserve the retrieval task.' }],
  { count: 6 }, { records: records.slice(0, 6) }, { count: 40 }, { records: records.slice(0, 40) }, { distinct_records_read: 40 }, 'incompatible', 'A');
entries.sort((a, b) => String(a.id).localeCompare(String(b.id)));
await writeOnceJson(join(root, 'manifests/suite-v3.json'), { version: 3, case_count: 15, held_out_count: 3, protocol_hash: hashJson(protocol),
  fixture_source_hash: hashJson({ v1: await sourceHash('../packages/benchmark/src/fixtures.ts'), v2: await sourceHash('../packages/benchmark/src/fixtures-v2.ts'), v3: await sourceHash('../packages/benchmark/src/fixtures-v3.ts') }),
  revision_reason: 'Fresh holdouts after generic provider-schema correction; original suite/protocol and pilot runs retained. No final model used in earlier pilots.', cases: entries });
console.log(JSON.stringify({ version: 3, cases: 15, fresh_held_out: 3, protocol_hash: hashJson(protocol) }, null, 2));
