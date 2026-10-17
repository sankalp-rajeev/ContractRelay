import { DatabaseSync } from 'node:sqlite';
import { Ajv } from 'ajv';
import { hashJson, jsonValueSchema, toolContractSchema } from '@contractrelay/contracts';
import { z } from 'zod';
import { createBenchmarkFixture, fixtureSpecSchema } from './fixtures.js';
import type { BenchmarkFixture } from './fixtures.js';

/** Revision 2 adds independently observed data retrieval to the held-out limit case. */
export function createFixtureV2(value: unknown, contractsValue: unknown): BenchmarkFixture {
  const spec = fixtureSpecSchema.parse(value);
  if (spec.scenario !== 'tightened-constraint') return createBenchmarkFixture(value, contractsValue);
  const contracts = z.array(toolContractSchema).length(1).parse(contractsValue);
  const target = contracts[0]!;
  const ajv = new Ajv({ strict: true });
  const validate = ajv.compile(target.inputSchema);
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE items (position INTEGER PRIMARY KEY, value TEXT); CREATE TABLE retrieved (position INTEGER PRIMARY KEY);');
  for (let index = 1; index <= 100; index++) db.prepare('INSERT INTO items VALUES (?,?)').run(index,
    `item-${hashJson({ controlled_dataset: 'limit-v2', position: index }).slice(0, 20)}`);
  return { environment: 'isolated-fixture', reset: async () => { db.exec('DELETE FROM retrieved'); }, close: () => { db.close(); },
    observe: async () => ({ distinct_items_read: db.prepare('SELECT COUNT(*) AS count FROM retrieved').get()?.count as number, side_effects: {} }),
    invoke: async (tool, args) => {
      if (tool !== target.name || !validate(args)) throw new Error('INVALID_TARGET_CALL');
      const rows = db.prepare('SELECT position,value FROM items ORDER BY position LIMIT ?').all(args.limit as number);
      for (const row of rows) db.prepare('INSERT OR IGNORE INTO retrieved VALUES (?)').run(row.position as number);
      return jsonValueSchema.parse({ items: rows.map((row) => row.value) });
    }
  };
}
