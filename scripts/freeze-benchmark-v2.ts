import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { hashJson, hashContract, toolContractSchema } from '../packages/contracts/src/index.js';
import type { JsonValue } from '../packages/contracts/src/index.js';
import { readJson, writeOnceJson } from '../packages/contracts/src/artifacts.js';
import { freezeEvidenceCase } from '../packages/contracts/src/evidence.js';

const root = fileURLToPath(new URL('../benchmarks/', import.meta.url));
const v1 = await readJson(join(root, 'manifests/suite-v1.json')) as { cases: Record<string, JsonValue>[]; protocol_hash: string; fixture_source_hash: string };
const caseId = '15-pagination-limit';
const directory = join(root, 'cases', caseId);
const schema = (limit: number) => ({ type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: limit } }, required: ['limit'], additionalProperties: false });
const shared = { name: 'list_items', provenance: { kind: 'synthetic-mutation', source: `benchmarks/cases/${caseId}` },
  outputSchema: { type: 'object', properties: { items: { type: 'array', items: { type: 'string' } } }, required: ['items'], additionalProperties: false },
  sideEffect: 'READ_ONLY', idempotency: 'IDEMPOTENT' };
const old = toolContractSchema.parse({ ...shared, contractId: `${caseId}/old`, inputSchema: schema(100),
  description: 'Retrieve the first limit records from the backend dataset in order; return their actual opaque identifiers. The request must perform the retrieval.' });
const target = toolContractSchema.parse({ ...shared, contractId: `${caseId}/new`, inputSchema: schema(10),
  description: 'Retrieve only the first limit records, at most ten. No pagination, cursor, offset, alternate ordering or other retrieval capability exists.' });
// Independent authoring reference: expected identifiers are frozen before any run.
const referenceRows = Array.from({ length: 100 }, (_, index) => `item-${hashJson({ controlled_dataset: 'limit-v2', position: index + 1 }).slice(0, 20)}`);
const synthesis = { dataClass: 'controlled-synthetic', oldContract: old, newContracts: [target], documents: [{ id: 'change.md',
  text: 'New list_items accepts at most ten records. Old calls retrieve up to 100 opaque records. There is no cursor, offset, pagination or alternate tool. Clamping or fabricating identifiers does not retrieve the requested data, so the full old contract cannot be preserved.' }] };
const gate = { version: 1, traces: [{ traceId: 'gate-1', tool: old.name, contractHash: hashContract(old), input: { limit: 5 }, output: { items: referenceRows.slice(0, 5) } }],
  predicates: [{ id: 'old-records', trace_id: 'gate-1', kind: 'equals', path: 'items', expected: referenceRows.slice(0, 5) }],
  metamorphic: [], evidence_refs: ['change.md'], supported_defaults: [] };
const tasks = [{ id: 'hidden-1', input: { limit: 99 }, replays: 1 }];
const sealed = { version: 1, outcomes: [{ task_id: 'hidden-1', output: { items: referenceRows.slice(0, 99) }, state: { distinct_items_read: 99 } }] };
const fixture = { version: 1, scenario: 'tightened-constraint' };
for (const folder of ['synthesis', 'gate', 'sealed-eval']) await mkdir(join(directory, folder), { recursive: true });
await writeOnceJson(join(directory, 'synthesis/evidence.json'), synthesis);
await writeOnceJson(join(directory, 'gate/evidence.json'), gate);
await writeOnceJson(join(directory, 'sealed-eval/evidence.json'), sealed);
await writeOnceJson(join(directory, 'tasks.json'), tasks);
await writeOnceJson(join(directory, 'fixture.json'), fixture);
const manifest = await freezeEvidenceCase(directory, caseId, true);
const entry = { id: caseId, change_class: 'constraint', held_out: true, compatibility: 'incompatible', oracle_tier: 'A', policy: 'read-only-v1',
  influenced_design: false, evidence_manifest_hash: hashJson(manifest), fixture_hash: hashJson(fixture), tasks_hash: hashJson(tasks) };
const sourceV2 = hashJson((await readFile(new URL('../packages/benchmark/src/fixtures-v2.ts', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'));
await writeOnceJson(join(root, 'manifests/suite-v2.json'), { version: 2, case_count: 15, held_out_count: 3, protocol_hash: v1.protocol_hash,
  fixture_source_hash: hashJson({ v1: v1.fixture_source_hash, v2: sourceV2 }),
  revision_reason: 'Before any held-out model scoring, replace count-only limit oracle with opaque rows and independent SQLite retrieval observation. Version 1 retained; prompts and heuristics unchanged.',
  cases: [...v1.cases.filter((item) => item.id !== '15-tightened-constraint'), entry] });
console.log(JSON.stringify({ version: 2, cases: 15, held_out: 3, oracle_revision: caseId, protocol_hash: v1.protocol_hash }, null, 2));
