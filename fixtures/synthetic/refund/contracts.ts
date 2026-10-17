import { toolContractSchema } from '../../../packages/contracts/src/index.js';

const provenance = { kind: 'curated-fixture', source: 'fixtures/synthetic/refund' };
const schema = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const identifier = { type: 'string', minLength: 1 };

export const oldRefundContract = toolContractSchema.parse({
  contractId: 'synthetic/refund/old', version: '1', provenance, name: 'refund_order',
  description: 'Immediately refund an order in dollars, mark it refunded, and record exactly one customer-request ledger entry. Repeating the same request_id must not refund twice.',
  inputSchema: schema({ order_id: identifier, amount_dollars: { type: 'number', minimum: 0.01, maximum: 1000, multipleOf: 0.01 }, request_id: identifier }),
  outputSchema: schema({ refund_id: identifier, status: { type: 'string', enum: ['refunded'] } }),
  sideEffect: 'REVERSIBLE_WRITE', idempotency: 'CONDITIONAL'
});

export const refundTargetContracts = [
  toolContractSchema.parse({ contractId: 'synthetic/refund/lookup', version: '2', provenance, name: 'lookup_payment',
    description: 'Resolve order_id to its payment_id without changing state.',
    inputSchema: schema({ order_id: identifier }), outputSchema: schema({ payment_id: identifier }),
    sideEffect: 'READ_ONLY', idempotency: 'IDEMPOTENT' }),
  toolContractSchema.parse({ contractId: 'synthetic/refund/payment', version: '2', provenance, name: 'refund_payment',
    description: 'Refund amount_cents immediately with reason customer_request. The same idempotency_key and arguments return the existing refund and never duplicate the ledger entry.',
    inputSchema: schema({ payment_id: identifier, amount_cents: { type: 'integer', minimum: 1, maximum: 100000 },
      reason: { type: 'string', enum: ['customer_request'] }, idempotency_key: identifier }),
    outputSchema: schema({ id: identifier, state: { type: 'string', enum: ['completed'] } }),
    sideEffect: 'REVERSIBLE_WRITE', idempotency: 'CONDITIONAL' }),
  toolContractSchema.parse({ contractId: 'synthetic/refund/status', version: '2', provenance, name: 'update_order_status',
    description: 'After a completed payment refund, set order status to refunded. Replays with the same idempotency_key do not duplicate the status-change event.',
    inputSchema: schema({ order_id: identifier, status: { type: 'string', enum: ['refunded'] }, idempotency_key: identifier }),
    outputSchema: schema({ order_id: identifier, status: { type: 'string', enum: ['refunded'] } }),
    sideEffect: 'IDEMPOTENT_WRITE', idempotency: 'IDEMPOTENT' })
];

export const refundEvidenceRefs = ['change.md#lookup', 'change.md#amount', 'change.md#reason', 'change.md#idempotency', 'change.md#status', 'change.md#response'];
