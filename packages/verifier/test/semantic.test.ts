import { describe, expect, it } from 'vitest';
import { SemanticFixture, semanticCase } from '../../../fixtures/synthetic/semantic/sqlite.js';
import { verifyIsolated } from '../src/isolated.js';

describe('controlled semantic refusals (TC-013/014)', () => {
  it.each(['send-vs-draft', 'delete-vs-deactivate'] as const)('rejects %s despite valid schemas and successful responses', async (scenario) => {
    const fixture = new SemanticFixture(scenario);
    try {
      const report = await verifyIsolated({ ...semanticCase(scenario), fixture, invoke: fixture.invoke, policyVersion: 'stateful-simulator-v1' });
      expect(report.traces_passed).toBe(1);
      expect(report.oracle_results).toContainEqual({ id: 'surface-success', passed: true });
      expect(report.state_oracle_results).toContainEqual({ id: 'old-effect', passed: false });
      expect(report.verdict).toBe('REJECTED');
    } finally { fixture.close(); }
  });

  it('refuses irreversible effects under an ordinary fixture policy', async () => {
    const fixture = new SemanticFixture('send-vs-draft');
    try {
      const report = await verifyIsolated({ ...semanticCase('send-vs-draft'), fixture, invoke: fixture.invoke, policyVersion: 'stateful-fixture-v1' });
      expect(report.verdict).toBe('REJECTED');
      expect(await fixture.observe()).toMatchObject({ sent_count: 0, side_effects: { create_message: 0 } });
    } finally { fixture.close(); }
  });
});
