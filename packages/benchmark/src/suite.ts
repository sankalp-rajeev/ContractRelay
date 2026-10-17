import { z } from 'zod';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { hashJson, jsonValueSchema } from '@contractrelay/contracts';
import { readJson } from '@contractrelay/contracts/artifacts';
import { openEvidenceCase, evidenceManifestSchema } from '@contractrelay/contracts/evidence';
import { policyVersionSchema } from '@contractrelay/contracts/policy';
import { synthesisEvidenceSchema } from '@contractrelay/synthesizer';
import { gateEvidenceSchema } from '@contractrelay/verifier';
import { fixtureSpecSchema } from './fixtures.js';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const suiteSchema = z.object({ version: z.union([z.literal(1), z.literal(2)]), case_count: z.literal(15), held_out_count: z.number().int().min(3),
  revision_reason: z.string().optional(),
  protocol_hash: digest, fixture_source_hash: digest, cases: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]+$/),
    change_class: z.string(), held_out: z.boolean(), compatibility: z.enum(['compatible', 'incompatible', 'insufficient-evidence']),
    oracle_tier: z.enum(['A', 'B', 'C']), policy: policyVersionSchema, influenced_design: z.boolean(),
    evidence_manifest_hash: digest, fixture_hash: digest, tasks_hash: digest }).strict()).length(15) }).strict();
export type SuiteCase = z.infer<typeof suiteSchema>['cases'][number];
export const taskSchema = z.object({ id: z.string().regex(/^[a-z0-9-]+$/), input: z.record(jsonValueSchema), replays: z.number().int().min(1).max(3) }).strict();
export const sealedSchema = z.object({ version: z.literal(1), outcomes: z.array(z.object({ task_id: z.string(), output: jsonValueSchema, state: z.record(jsonValueSchema) }).strict()).min(1) }).strict();

export async function loadSuite(root: string) {
  const suite = suiteSchema.parse(await readJson(join(root, 'manifests/suite-v2.json')));
  if (new Set(suite.cases.map((item) => item.id)).size !== 15 || suite.cases.filter((item) => item.held_out).length !== suite.held_out_count
    || suite.cases.some((item) => item.held_out && item.influenced_design)) throw new Error('INVALID_HELD_OUT_POLICY');
  const protocol = await readJson(join(root, 'manifests/protocol-v1.json')) as Record<string, unknown>;
  if (hashJson(protocol) !== suite.protocol_hash || protocol.frozen_before_held_out_authoring !== true) throw new Error('PROTOCOL_DRIFT');
  for (const [name, path] of [
    ['b1_source_hash', '../../benchmark/src/baselines.ts'], ['b3_source_hash', '../../synthesizer/src/synthesis.ts']
  ] as const) {
    if (hashJson((await readFile(new URL(path, import.meta.url), 'utf8')).replace(/\r\n/g, '\n')) !== protocol[name]) throw new Error('FROZEN_BASELINE_DRIFT');
  }
  const v1 = hashJson((await readFile(new URL('./fixtures.ts', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'));
  const v2 = hashJson((await readFile(new URL('./fixtures-v2.ts', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'));
  if ((suite.version === 1 ? v1 : hashJson({ v1, v2 })) !== suite.fixture_source_hash) throw new Error('FIXTURE_SOURCE_DRIFT');
  return { suite, hash: hashJson(suite) };
}

/** Trusted coordinator. Only loaded synthesis values are passed to generators. */
export async function loadBenchmarkCase(root: string, entry: SuiteCase, runDirectory: string) {
  const directory = join(root, 'cases', entry.id);
  const manifest = evidenceManifestSchema.parse(await readJson(join(directory, 'case.json')));
  const fixture = fixtureSpecSchema.parse(await readJson(join(directory, 'fixture.json')));
  const tasks = z.array(taskSchema).min(1).parse(await readJson(join(directory, 'tasks.json')));
  if (manifest.case_id !== entry.id || manifest.held_out !== entry.held_out || hashJson(manifest) !== entry.evidence_manifest_hash
    || hashJson(fixture) !== entry.fixture_hash || hashJson(tasks) !== entry.tasks_hash || new Set(tasks.map((task) => task.id)).size !== tasks.length) throw new Error('CASE_INTEGRITY_FAILED');
  const coordinator = await openEvidenceCase(directory, runDirectory);
  const evidence = synthesisEvidenceSchema.parse(await coordinator.synthesis.read());
  const gate = gateEvidenceSchema.parse(await coordinator.gate.read());
  return { coordinator, evidence, gate, fixture, tasks };
}
