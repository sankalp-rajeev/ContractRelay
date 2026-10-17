import { hashContract } from '../../../packages/contracts/src/index.js';
import type { GateEvidence } from '../../../packages/verifier/src/index.js';
import { oldRefundContract, refundEvidenceRefs } from './contracts.js';

export const refundGate: GateEvidence = {
  version: 1,
  traces: [{ traceId: 'refund-gate', tool: 'refund_order', input: { order_id: 'order-1', amount_dollars: 12.99, request_id: 'gate-request-1' },
    output: { refund_id: 'refund-gate-request-1', status: 'refunded' }, contractHash: hashContract(oldRefundContract), replays: 2 }],
  predicates: [{ id: 'returned-refunded', trace_id: 'refund-gate', kind: 'equals', path: 'status', expected: 'refunded' }],
  metamorphic: [], evidence_refs: refundEvidenceRefs,
  supported_defaults: [
    { tool: 'refund_payment', arg: 'reason', value: 'customer_request', evidence_ref: 'change.md#reason' },
    { tool: 'update_order_status', arg: 'status', value: 'refunded', evidence_ref: 'change.md#status' }
  ],
  state_predicates: [
    { id: 'amount', trace_id: 'refund-gate', kind: 'equals', path: 'refund_amount_cents', expected: 1299 },
    { id: 'order-state', trace_id: 'refund-gate', kind: 'equals', path: 'order_status', expected: 'refunded' },
    { id: 'payment-state', trace_id: 'refund-gate', kind: 'equals', path: 'payment_state', expected: 'refunded' },
    { id: 'single-refund', trace_id: 'refund-gate', kind: 'equals', path: 'refund_count', expected: 1 },
    { id: 'ledger-once', trace_id: 'refund-gate', kind: 'equals', path: 'ledger_count', expected: 1 }
  ],
  side_effect_assertions: [
    { id: 'refund-once', trace_id: 'refund-gate', tool: 'refund_payment', count: 1 },
    { id: 'status-once', trace_id: 'refund-gate', tool: 'update_order_status', count: 1 }
  ]
};
