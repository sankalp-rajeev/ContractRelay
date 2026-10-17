import { describe, expect, it, vi } from 'vitest';
import { assertPromotableReport, verifyCandidate } from '../src/index.js';
import { newContract, oldContract, plan, weatherGate, weatherInvoker } from '../../../fixtures/synthetic/weather/fixture.js';

const input = { oldContract, newContract, plan, gateEvidence: weatherGate, invoke: weatherInvoker };

describe('independent evidence gate', () => {
  it('replays gate traces and produces a deterministic V0/V1/V2 promotion report', async () => {
    const first = await verifyCandidate(input);
    expect(first).toEqual(await verifyCandidate(input));
    expect(first.verdict).toBe('PROMOTED');
    expect(first.traces_passed).toBe(1);
    expect(() => assertPromotableReport(first)).not.toThrow();
  });

  it('rejects schema-valid but semantically wrong output', async () => {
    const report = await verifyCandidate({ ...input, invoke: async () => ({ current: { temperature: 17.777, summary: 'Clear' } }) });
    expect(report.checks.find((check) => check.level === 'V1')?.passed).toBe(true);
    expect(report.verdict).toBe('REJECTED');
    expect(report.oracle_results).toContainEqual({ id: 'fahrenheit', passed: false });
  });

  it('fails closed for an invented default, missing behavioral evidence or unresolved references (TC-004)', async () => {
    for (const gate of [
      { ...weatherGate, supported_defaults: [] },
      { ...weatherGate, predicates: [] },
      { ...weatherGate, evidence_refs: [] },
      { ...weatherGate, traces: [] }
    ]) {
      const invoke = vi.fn(weatherInvoker);
      const report = await verifyCandidate({ ...input, gateEvidence: gate, invoke });
      expect(report.verdict).toBe('INCONCLUSIVE');
      expect(invoke).not.toHaveBeenCalled();
      expect(() => assertPromotableReport(report)).toThrow();
    }
  });

  it('checks trace identity and sanitizes backend failure details', async () => {
    const mismatched = { ...weatherGate, traces: weatherGate.traces.map((trace) => ({ ...trace, contractHash: '0'.repeat(64) })) };
    expect((await verifyCandidate({ ...input, gateEvidence: mismatched })).verdict).toBe('REJECTED');
    const report = await verifyCandidate({ ...input, invoke: async () => { throw new Error('secret-key-value'); } });
    expect(report.verdict).toBe('REJECTED');
    expect(JSON.stringify(report)).not.toContain('secret-key-value');
  });

  it('supports independent metamorphic properties', async () => {
    const gate = { ...weatherGate, predicates: [], metamorphic: [{ id: 'case-invariance', baseline_trace_id: 'ann-arbor',
      variant_input: { city: 'ANN ARBOR' }, path: 'temperature', relation: 'equal' }] };
    expect((await verifyCandidate({ ...input, gateEvidence: gate })).verdict).toBe('PROMOTED');
    const wrong = { ...gate, metamorphic: gate.metamorphic.map((property) => ({ ...property, variant_input: { city: 'Detroit' } })) };
    expect((await verifyCandidate({ ...input, gateEvidence: wrong })).verdict).toBe('REJECTED');
  });

  it('rejects explicit refusal artifacts and forged/vacuous promotion reports', async () => {
    const report = await verifyCandidate({ ...input, plan: { version: 1, op: 'Reject', reason: 'No semantic evidence', missing_evidence: ['units'], risk: 'Wrong units' } });
    expect(report.verdict).toBe('REJECTED');
    const good = await verifyCandidate(input);
    expect(() => assertPromotableReport({ ...good, checks: [], oracle_results: [] })).toThrow();
  });
});
