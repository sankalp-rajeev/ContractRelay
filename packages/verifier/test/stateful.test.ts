import { afterEach, describe, expect, it } from 'vitest';
import { RefundFixture } from '../../../fixtures/synthetic/refund/sqlite.js';
import { oldRefundContract, refundTargetContracts } from '../../../fixtures/synthetic/refund/contracts.js';
import { refundGate } from '../../../fixtures/synthetic/refund/gate.js';
import plan from '../../../fixtures/synthetic/refund/adapter.plan.json' with { type: 'json' };
import { verifyIsolated } from '../src/isolated.js';
import { assertPromotableReport } from '../src/index.js';
import { translationPlanSchema } from '@contractrelay/dsl';
import { compileCandidate } from '@contractrelay/compiler';

const fixtures: RefundFixture[] = [];
afterEach(() => { fixtures.splice(0).forEach((fixture) => fixture.close()); });
function fixture(options: ConstructorParameters<typeof RefundFixture>[0] = {}) {
  const result = new RefundFixture(options); fixtures.push(result); return result;
}
const parameters = (backend: RefundFixture) => ({ oldContract: oldRefundContract, newContract: refundTargetContracts,
  plan, gateEvidence: refundGate, invoke: backend.invoke, fixture: backend, policyVersion: 'stateful-fixture-v1' as const });

describe('independent SQLite state and side-effect oracles (TC-012/015)', () => {
  it('promotes a composed refund with exact amounts, state and one effect across replay', async () => {
    const backend = fixture();
    const report = await verifyIsolated(parameters(backend));
    expect(report.verdict).toBe('PROMOTED');
    expect(report.checks.some((check) => check.level === 'V3' && check.passed)).toBe(true);
    expect(() => assertPromotableReport(report)).not.toThrow();
    expect(await backend.observe()).toMatchObject({ refund_amount_cents: 1299, ledger_count: 1,
      side_effects: { refund_payment: 1, update_order_status: 1 } });
  });

  it('rejects missing V3 evidence or undeclared isolated capabilities before writing', async () => {
    const backend = fixture();
    const input = parameters(backend);
    const { fixture: _fixture, ...withoutFixture } = input;
    expect(_fixture.environment).toBe('isolated-fixture');
    expect((await verifyIsolated(withoutFixture)).verdict).toBe('INCONCLUSIVE');
    expect((await verifyIsolated({ ...input, gateEvidence: { ...refundGate, state_predicates: [] } })).verdict).toBe('INCONCLUSIVE');
    expect(await backend.observe()).toMatchObject({ refund_count: 0 });
  });

  it('rejects duplicate effects even when every response remains schema-valid', async () => {
    const backend = fixture({ duplicateEffects: true });
    const report = await verifyIsolated(parameters(backend));
    expect(report.traces_passed).toBe(1);
    expect(report.verdict).toBe('REJECTED');
    expect(report.side_effect_results).toContainEqual({ id: 'refund-once', passed: false });
  });

  it('rejects a plausible pending-to-refunded mapping using independently observed payment state', async () => {
    const backend = fixture({ pending: true });
    const contracts = structuredClone(refundTargetContracts);
    const payment = contracts.find((contract) => contract.name === 'refund_payment');
    if (!payment) throw new Error('Missing fixture contract');
    payment.outputSchema = { type: 'object', properties: { id: { type: 'string' }, state: { type: 'string', enum: ['completed', 'pending'] } }, required: ['id', 'state'], additionalProperties: false };
    const candidate = translationPlanSchema.parse(plan);
    for (const step of candidate.response) if (step.op === 'MapEnum') step.mapping.pending = 'refunded';
    const report = await verifyIsolated({ ...parameters(backend), newContract: contracts, plan: candidate });
    expect(report.traces_passed).toBe(1);
    expect(report.oracle_results.every((oracle) => oracle.passed)).toBe(true);
    expect(report.verdict).toBe('REJECTED');
    expect(report.state_oracle_results).toContainEqual({ id: 'payment-state', passed: false });
  });

  it('recovers a partial workflow retry without duplicating the completed refund', async () => {
    const backend = fixture({ failFinalizeOnce: true });
    const adapter = compileCandidate(plan, oldRefundContract, refundTargetContracts, 'stateful-fixture-v1');
    const input = { order_id: 'order-1', amount_dollars: 12.99, request_id: 'retry-request' };
    await expect(adapter.executeForVerification(input, backend.invoke)).rejects.toThrow('TRANSIENT_FINALIZE_FAILURE');
    expect(await adapter.executeForVerification(input, backend.invoke)).toEqual({ refund_id: 'refund-retry-request', status: 'refunded' });
    expect(await backend.observe()).toMatchObject({ refund_count: 1, ledger_count: 1, side_effects: { refund_payment: 1, update_order_status: 1 } });
    await expect(adapter.executeForVerification({ ...input, amount_dollars: 10 }, backend.invoke)).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  });
});
