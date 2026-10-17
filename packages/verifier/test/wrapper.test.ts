import { describe, expect, it } from 'vitest';
import { verifyWrapperIsolated } from '../src/isolated.js';
import { verifyIsolated } from '../src/isolated.js';
import { compileCandidate } from '@contractrelay/compiler';
import { newContract, oldContract, plan, weatherGate, weatherInvoker } from '../../../fixtures/synthetic/weather/fixture.js';
import { SemanticFixture, semanticCase } from '../../../fixtures/synthetic/semantic/sqlite.js';
import { hashJson } from '@contractrelay/contracts';

describe('same evidence gate for generic wrappers (TC-021)', () => {
  it('shares replay and independent predicate checks with B3 while binding the wrapper hash', async () => {
    const adapter = compileCandidate(plan, oldContract, newContract);
    const artifact = { kind: 'javascript-wrapper', code: 'controlled-test-artifact-never-executed-on-host' };
    const wrapper = await verifyWrapperIsolated({ artifact, oldContract, newContract, gateEvidence: weatherGate,
      execute: (input) => adapter.executeForVerification(input, weatherInvoker) });
    const dsl = await verifyIsolated({ plan, oldContract, newContract, gateEvidence: weatherGate, invoke: weatherInvoker });
    expect(wrapper.verdict).toBe('PROMOTED');
    expect(wrapper.plan_hash).toBe(hashJson(artifact));
    expect(wrapper.checks.filter((check) => check.level !== 'V0')).toEqual(dsl.checks.filter((check) => check.level !== 'V0'));
    expect(wrapper.oracle_results).toEqual(dsl.oracle_results);
  });
  it('rejects schema-valid generic wrapper surface success when the independent V3 effect is wrong', async () => {
    const fixture = new SemanticFixture('send-vs-draft');
    const data = semanticCase('send-vs-draft');
    try {
      const report = await verifyWrapperIsolated({ artifact: { kind: 'javascript-wrapper', code: 'controlled-test-artifact' },
        oldContract: data.oldContract, newContract: data.newContract, gateEvidence: data.gateEvidence,
        fixture, policyVersion: 'stateful-simulator-v1', execute: async () => fixture.invoke('create_message', { recipient: 'synthetic@example.test' }) as never });
      expect(report.traces_passed).toBe(1);
      expect(report.verdict).toBe('REJECTED');
      expect(report.state_oracle_results).toContainEqual({ id: 'old-effect', passed: false });
    } finally { fixture.close(); }
  });
});
