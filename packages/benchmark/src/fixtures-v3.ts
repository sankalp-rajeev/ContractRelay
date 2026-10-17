import { z } from 'zod';
import { Ajv } from 'ajv';
import { DatabaseSync } from 'node:sqlite';
import { hashJson, jsonValueSchema, toolContractSchema } from '@contractrelay/contracts';
import { fixtureSpecSchema as previousSchema } from './fixtures.js';
import { createFixtureV2 } from './fixtures-v2.js';
import type { BenchmarkFixture } from './fixtures.js';

export const fixtureSpecSchema = z.union([previousSchema, z.object({ version: z.literal(1),
  scenario: z.enum(['delivery-enum', 'three-call-report', 'stream-cap']) }).strict()]);
export function createFixtureV3(value: unknown, contractsValue: unknown): BenchmarkFixture {
  const spec = fixtureSpecSchema.parse(value);
  if (previousSchema.safeParse(spec).success) return createFixtureV2(value, contractsValue);
  const contracts = z.array(toolContractSchema).parse(contractsValue);
  const ajv = new Ajv({ strict: true });
  const validators = new Map(contracts.map((contract) => [contract.name, ajv.compile(contract.inputSchema)]));
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE records (position INTEGER PRIMARY KEY, value TEXT); CREATE TABLE retrieved (position INTEGER PRIMARY KEY);');
  for (let index = 1; index <= 80; index++) db.prepare('INSERT INTO records VALUES (?,?)').run(index,
    `record-${hashJson({ controlled_dataset: 'stream-v3', position: index }).slice(0, 20)}`);
  return { environment: 'isolated-fixture', close: () => { db.close(); }, reset: async () => { db.exec('DELETE FROM retrieved'); },
    observe: async () => ({ distinct_records_read: db.prepare('SELECT COUNT(*) AS count FROM retrieved').get()?.count as number, side_effects: {} }),
    invoke: async (tool, args) => {
      if (!validators.get(tool)?.(args)) throw new Error('INVALID_TARGET_CALL');
      if (spec.scenario === 'delivery-enum') return { stage: args.parcel_id === 'parcel-new' ? 'queued' : args.parcel_id === 'parcel-moving' ? 'transporting' : 'settled' };
      if (spec.scenario === 'three-call-report') {
        if (tool === 'resolve_user') return { uid: `uid-${args.user}` };
        if (tool === 'select_workspace') return { workspace_id: `workspace-${args.uid}` };
        return { details: { label: `Overview ${args.workspace_id}` } };
      }
      const rows = db.prepare('SELECT position,value FROM records ORDER BY position LIMIT ?').all(args.page_size as number);
      for (const row of rows) db.prepare('INSERT OR IGNORE INTO retrieved VALUES (?)').run(row.position as number);
      return jsonValueSchema.parse({ records: rows.map((row) => row.value) });
    }
  };
}
