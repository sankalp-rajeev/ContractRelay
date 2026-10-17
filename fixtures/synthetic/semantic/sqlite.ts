import { DatabaseSync } from 'node:sqlite';
import { hashContract, toolContractSchema } from '../../../packages/contracts/src/index.js';
import type { JsonValue } from '../../../packages/contracts/src/index.js';
import type { GateFixture, GateEvidence } from '../../../packages/verifier/src/index.js';
import type { ToolInvoker } from '../../../packages/compiler/src/index.js';

/** Controlled semantic traps: no real messages or user accounts are touched. */
export class SemanticFixture implements GateFixture {
  readonly environment = 'simulator' as const;
  private readonly db = new DatabaseSync(':memory:');
  constructor(readonly scenario: 'send-vs-draft' | 'delete-vs-deactivate') {
    this.db.exec('CREATE TABLE messages (id INTEGER PRIMARY KEY, state TEXT); CREATE TABLE users (id TEXT PRIMARY KEY, active INTEGER); CREATE TABLE effects (tool TEXT);');
    void this.reset();
  }
  close(): void { this.db.close(); }
  async reset(): Promise<void> {
    this.db.exec("DELETE FROM messages; DELETE FROM users; DELETE FROM effects; INSERT INTO users VALUES ('user-1',1);");
  }
  readonly invoke: ToolInvoker = async (tool) => {
    if (this.scenario === 'send-vs-draft' && tool === 'create_message') {
      this.db.prepare('INSERT INTO messages(state) VALUES (?)').run('draft');
      this.db.prepare('INSERT INTO effects VALUES (?)').run(tool);
      return { success: true };
    }
    if (this.scenario === 'delete-vs-deactivate' && tool === 'deactivate_user') {
      this.db.prepare('UPDATE users SET active=0 WHERE id=?').run('user-1');
      this.db.prepare('INSERT INTO effects VALUES (?)').run(tool);
      return { success: true };
    }
    throw new Error('UNALLOWLISTED_TARGET');
  };
  async observe(): Promise<JsonValue> {
    const tool = this.scenario === 'send-vs-draft' ? 'create_message' : 'deactivate_user';
    return { sent_count: this.db.prepare("SELECT COUNT(*) AS count FROM messages WHERE state='sent'").get()?.count as number,
      user_count: this.db.prepare('SELECT COUNT(*) AS count FROM users').get()?.count as number,
      side_effects: { [tool]: this.db.prepare('SELECT COUNT(*) AS count FROM effects WHERE tool=?').get(tool)?.count as number } };
  }
}

export function semanticCase(scenario: SemanticFixture['scenario']) {
  const send = scenario === 'send-vs-draft';
  const oldName = send ? 'send_email' : 'delete_user';
  const newName = send ? 'create_message' : 'deactivate_user';
  const properties = send ? { recipient: { type: 'string' } } : { user_id: { type: 'string' } };
  const shared = { provenance: { kind: 'curated-fixture', source: `fixtures/synthetic/semantic/${scenario}` },
    inputSchema: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' } }, required: ['success'], additionalProperties: false },
    idempotency: 'NON_IDEMPOTENT' };
  const oldContract = toolContractSchema.parse({ ...shared, contractId: `${scenario}/old`, name: oldName, sideEffect: 'IRREVERSIBLE_WRITE' });
  const newContract = toolContractSchema.parse({ ...shared, contractId: `${scenario}/new`, name: newName, sideEffect: 'REVERSIBLE_WRITE' });
  const plan = { version: 1, source_tool: oldName, target: { kind: 'single', tool: newName },
    steps: [{ op: 'RenameTool', from: oldName, to: newName, evidence: ['change.md#surface'] }], response: [],
    rationale: 'Deliberately wrong controlled candidate; surface success does not establish old side effects.' };
  const gate: GateEvidence = { version: 1, traces: [{ traceId: 'semantic', tool: oldName,
    input: send ? { recipient: 'synthetic@example.test' } : { user_id: 'user-1' }, output: { success: true }, contractHash: hashContract(oldContract) }],
    predicates: [{ id: 'surface-success', trace_id: 'semantic', path: 'success', kind: 'equals', expected: true }],
    metamorphic: [], evidence_refs: ['change.md#surface'], supported_defaults: [],
    state_predicates: [{ id: 'old-effect', trace_id: 'semantic', path: send ? 'sent_count' : 'user_count', kind: 'equals', expected: send ? 1 : 0 }],
    side_effect_assertions: [{ id: 'one-operation', trace_id: 'semantic', tool: newName, count: 1 }] };
  return { oldContract, newContract, plan, gateEvidence: gate };
}
