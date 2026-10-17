import { describe, expect, it, vi } from 'vitest';
import { compileCandidate } from '../src/index.js';
import { oldRefundContract, refundTargetContracts } from '../../../fixtures/synthetic/refund/contracts.js';
import plan from '../../../fixtures/synthetic/refund/adapter.plan.json' with { type: 'json' };
import { translationPlanSchema } from '@contractrelay/dsl';

describe('bounded ComposeCalls (TC-011)', () => {
  it('binds intermediate results, scales exactly, preserves call order and maps the old result', async () => {
    const calls: { tool: string; args: unknown }[] = [];
    const onOperation = vi.fn();
    const candidate = compileCandidate(plan, oldRefundContract, refundTargetContracts, 'stateful-fixture-v1');
    const result = await candidate.executeForVerification({ order_id: 'order-1', amount_dollars: 0.29, request_id: 'request-1' }, async (tool, args) => {
      calls.push({ tool, args });
      if (tool === 'lookup_payment') return { payment_id: 'payment-1' };
      if (tool === 'refund_payment') return { id: 'refund-1', state: 'completed' };
      return { order_id: 'order-1', status: 'refunded' };
    }, onOperation);
    expect(calls.map((call) => call.tool)).toEqual(['lookup_payment', 'refund_payment', 'update_order_status']);
    expect(calls[1]?.args).toEqual({ payment_id: 'payment-1', amount_cents: 29, reason: 'customer_request', idempotency_key: 'request-1' });
    expect(result).toEqual({ refund_id: 'refund-1', status: 'refunded' });
    expect(onOperation).toHaveBeenCalledWith({ phase: 'input', op: 'ConvertType', index: 1, tool: 'refund_payment', field: 'amount_cents' });
    expect(onOperation.mock.calls.flatMap(([operation]) => operation.phase === 'call' ? [operation.tool] : []))
      .toEqual(['lookup_payment', 'refund_payment', 'update_order_status']);
  });

  it('rejects forward references, cycles, duplicate IDs and unallowlisted calls before invocation', () => {
    const canonical = translationPlanSchema.parse(plan);
    const target = canonical.target;
    if (target.kind !== 'compose') throw new Error('Fixture must compose calls');
    const invalids = [
      { ...canonical, target: { ...target, calls: [target.calls[1], target.calls[0], target.calls[2]] } },
      { ...canonical, target: { ...target, calls: [...target.calls, target.calls[0]] } },
      { ...canonical, target: { ...target, calls: target.calls.map((call) => ({ ...call, tool: 'invented' })) } },
      { ...canonical, target: { ...target, calls: Array.from({ length: 9 }, () => target.calls[0]) } }
    ];
    for (const invalid of invalids) expect(() => compileCandidate(invalid, oldRefundContract, refundTargetContracts, 'stateful-fixture-v1')).toThrow();
  });

  it('requires an explicit stateful policy and refuses unknown effects', () => {
    expect(() => compileCandidate(plan, oldRefundContract, refundTargetContracts)).toThrow('Side effects');
    expect(() => compileCandidate(plan, oldRefundContract, refundTargetContracts.map((target) => ({ ...target, sideEffect: 'UNKNOWN' })), 'stateful-fixture-v1')).toThrow('Side effects');
  });

  it('does not execute later writes after an invalid intermediate result', async () => {
    const invoke = vi.fn(async () => ({ payment_id: 42 }));
    const candidate = compileCandidate(plan, oldRefundContract, refundTargetContracts, 'stateful-fixture-v1');
    await expect(candidate.executeForVerification({ order_id: 'order-1', amount_dollars: 1, request_id: 'request-1' }, invoke)).rejects.toThrow();
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
