import { DatabaseSync } from 'node:sqlite';
import { canonicalJson, hashJson, jsonValueSchema } from '../../../packages/contracts/src/index.js';
import type { JsonValue } from '../../../packages/contracts/src/index.js';
import type { ToolInvoker } from '../../../packages/compiler/src/index.js';
import type { GateFixture } from '../../../packages/verifier/src/index.js';

export class RefundFixture implements GateFixture {
  readonly environment = 'isolated-fixture' as const;
  private readonly db: DatabaseSync;
  private failFinalize: boolean;
  constructor(private readonly options: { pending?: boolean; duplicateEffects?: boolean; failFinalizeOnce?: boolean;
    wrongProvenance?: boolean; database?: string } = {}) {
    this.db = new DatabaseSync(options.database ?? ':memory:');
    this.failFinalize = options.failFinalizeOnce ?? false;
    this.db.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS orders (order_id TEXT PRIMARY KEY, payment_id TEXT UNIQUE, status TEXT, total_cents INTEGER);
      CREATE TABLE IF NOT EXISTS payments (payment_id TEXT PRIMARY KEY, state TEXT, refunded_cents INTEGER);
      CREATE TABLE IF NOT EXISTS refunds (id TEXT PRIMARY KEY, payment_id TEXT, amount_cents INTEGER, reason TEXT, state TEXT, request_key TEXT UNIQUE);
      CREATE TABLE IF NOT EXISTS ledger (id INTEGER PRIMARY KEY, refund_id TEXT, amount_cents INTEGER, provenance TEXT);
      CREATE TABLE IF NOT EXISTS receipts (tool TEXT, request_key TEXT, args_hash TEXT, result TEXT, PRIMARY KEY (tool, request_key));
      CREATE TABLE IF NOT EXISTS effects (id INTEGER PRIMARY KEY, tool TEXT);
    `);
    this.resetSync();
  }
  close(): void { this.db.close(); }
  private resetSync(): void {
    this.db.exec('DELETE FROM effects; DELETE FROM receipts; DELETE FROM ledger; DELETE FROM refunds; DELETE FROM orders; DELETE FROM payments;');
    for (const [order, payment, total] of [['order-1', 'payment-1', 10000], ['order-2', 'payment-2', 5000]] as const) {
      this.db.prepare('INSERT INTO orders VALUES (?, ?, ?, ?)').run(order, payment, 'paid', total);
      this.db.prepare('INSERT INTO payments VALUES (?, ?, ?)').run(payment, 'paid', 0);
    }
    this.failFinalize = this.options.failFinalizeOnce ?? false;
  }
  async reset(): Promise<void> { this.resetSync(); }

  private effect(tool: string, key: string, args: Readonly<Record<string, JsonValue>>, action: () => JsonValue): JsonValue {
    const hash = hashJson(args);
    const prior = this.db.prepare('SELECT args_hash, result FROM receipts WHERE tool=? AND request_key=?').get(tool, key);
    if (prior) {
      if (prior.args_hash !== hash) throw new Error('IDEMPOTENCY_CONFLICT');
      if (this.options.duplicateEffects && tool === 'refund_payment') {
        this.db.prepare('UPDATE payments SET refunded_cents=refunded_cents+? WHERE payment_id=?').run(args.amount_cents as number, args.payment_id as string);
        this.db.prepare('INSERT INTO ledger(refund_id,amount_cents,provenance) VALUES (?,?,?)').run(`refund-${key}`, args.amount_cents as number, 'customer_request');
        this.db.prepare('INSERT INTO effects(tool) VALUES (?)').run(tool);
      }
      return jsonValueSchema.parse(JSON.parse(prior.result as string));
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = action();
      this.db.prepare('INSERT INTO receipts VALUES (?,?,?,?)').run(tool, key, hash, canonicalJson(result));
      this.db.prepare('INSERT INTO effects(tool) VALUES (?)').run(tool);
      this.db.exec('COMMIT');
      return result;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  readonly invoke: ToolInvoker = async (tool, args) => {
    if (tool === 'lookup_payment') {
      const row = this.db.prepare('SELECT payment_id FROM orders WHERE order_id=?').get(args.order_id as string);
      if (!row) throw new Error('ORDER_NOT_FOUND');
      return { payment_id: row.payment_id as string };
    }
    if (tool === 'refund_payment') return this.effect(tool, args.idempotency_key as string, args, () => {
      const payment = this.db.prepare('SELECT payment_id FROM payments WHERE payment_id=?').get(args.payment_id as string);
      if (!payment || !Number.isSafeInteger(args.amount_cents) || (args.amount_cents as number) < 1) throw new Error('INVALID_REFUND');
      const state = this.options.pending ? 'pending' : 'completed';
      const id = `refund-${args.idempotency_key}`;
      this.db.prepare('INSERT INTO refunds VALUES (?,?,?,?,?,?)').run(id, args.payment_id as string, args.amount_cents as number, args.reason as string, state, args.idempotency_key as string);
      this.db.prepare('UPDATE payments SET state=?, refunded_cents=refunded_cents+? WHERE payment_id=?')
        .run(this.options.pending ? 'pending' : 'refunded', args.amount_cents as number, args.payment_id as string);
      this.db.prepare('INSERT INTO ledger(refund_id,amount_cents,provenance) VALUES (?,?,?)')
        .run(id, args.amount_cents as number, this.options.wrongProvenance ? 'unrelated_operation' : args.reason as string);
      return { id, state };
    });
    if (tool === 'update_order_status') {
      if (this.failFinalize) { this.failFinalize = false; throw new Error('TRANSIENT_FINALIZE_FAILURE'); }
      return this.effect(tool, args.idempotency_key as string, args, () => {
        const order = this.db.prepare('SELECT order_id FROM orders WHERE order_id=?').get(args.order_id as string);
        if (!order) throw new Error('ORDER_NOT_FOUND');
        this.db.prepare('UPDATE orders SET status=? WHERE order_id=?').run(args.status as string, args.order_id as string);
        return { order_id: args.order_id as string, status: args.status as string };
      });
    }
    throw new Error('UNALLOWLISTED_TARGET');
  };

  async observe(): Promise<JsonValue> {
    const refund = this.db.prepare('SELECT * FROM refunds ORDER BY rowid DESC LIMIT 1').get();
    const order = refund ? this.db.prepare('SELECT status FROM orders WHERE payment_id=?').get(refund.payment_id as string) : undefined;
    const payment = refund ? this.db.prepare('SELECT state,refunded_cents FROM payments WHERE payment_id=?').get(refund.payment_id as string) : undefined;
    const ledger = this.db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(amount_cents),0) AS total FROM ledger').get();
    const provenance = this.db.prepare('SELECT provenance FROM ledger ORDER BY id DESC LIMIT 1').get();
    const sideEffects = Object.fromEntries(['refund_payment', 'update_order_status', 'lookup_payment'].map((tool) =>
      [tool, this.db.prepare('SELECT COUNT(*) AS count FROM effects WHERE tool=?').get(tool)?.count as number]));
    return jsonValueSchema.parse({ refund_count: this.db.prepare('SELECT COUNT(*) AS count FROM refunds').get()?.count ?? 0,
      refund_amount_cents: refund?.amount_cents ?? 0, order_status: order?.status ?? 'paid', payment_state: payment?.state ?? 'paid',
      refunded_cents: payment?.refunded_cents ?? 0, ledger_count: ledger?.count ?? 0, ledger_total_cents: ledger?.total ?? 0,
      ledger_provenance: provenance?.provenance ?? '', request_key: refund?.request_key ?? '', side_effects: sideEffects });
  }
}
