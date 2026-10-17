import { join } from 'node:path';
import { connectFixtureClient } from '../../../packages/mcp/src/testing.js';
import { hashJson, jsonValueSchema } from '../../../packages/contracts/src/index.js';
import { writeOnceJson, atomicWriteJson } from '../../../packages/contracts/src/artifacts.js';
import { freezeEvidenceCase, openEvidenceCase } from '../../../packages/contracts/src/evidence.js';
import { createFixtureServer } from '../../../packages/mcp/src/fixture-server.js';
import { createCompatibilityServer, createMcpInvoker } from '../../../packages/mcp/src/proxy.js';
import { snapshotTools } from '../../../packages/mcp/src/index.js';
import { verifyIsolated } from '../../../packages/verifier/src/isolated.js';
import { PromotionRegistry } from '../../../packages/runtime/src/index.js';
import { RefundFixture } from './sqlite.js';
import { oldRefundContract, refundTargetContracts, refundEvidenceRefs } from './contracts.js';
import { refundGate } from './gate.js';
import plan from './adapter.plan.json' with { type: 'json' };

/** Full controlled MCP/state lifecycle. Sealed state predicates are absent from the gate. */
export async function runRefundLifecycle(directory: string, options: { candidate?: unknown; wrongProvenance?: boolean } = {}) {
  const fixture = new RefundFixture({ wrongProvenance: options.wrongProvenance ?? false });
  const backend = createFixtureServer(refundTargetContracts, fixture.invoke);
  const target = await connectFixtureClient(backend, 'refund-target-client');
  let proxy: ReturnType<typeof createCompatibilityServer> | undefined;
  let client: Awaited<ReturnType<typeof connectFixtureClient>> | undefined;
  try {
    const snapshotConfig = { namespace: 'refund', source: 'controlled-refund-mcp-server', version: '2',
      metadata: Object.fromEntries(refundTargetContracts.map((contract) => [contract.name, { sideEffect: contract.sideEffect, idempotency: contract.idempotency }])) };
    const snapshot = await snapshotTools(target, snapshotConfig);
    const candidate = options.candidate ?? plan;
    const root = join(directory, hashJson({ candidate, contracts: snapshot.hash, wrongProvenance: options.wrongProvenance ?? false }));
    const caseDir = join(root, 'case');
    await writeOnceJson(join(caseDir, 'synthesis', 'evidence.json'), { dataClass: 'controlled-synthetic', oldContract: oldRefundContract,
      newContracts: snapshot.tools, documents: refundEvidenceRefs.map((id) => ({ id, text: 'Controlled refund decomposition; see fixture change.md' })) });
    await writeOnceJson(join(caseDir, 'gate', 'evidence.json'), refundGate);
    await writeOnceJson(join(caseDir, 'sealed-eval', 'evidence.json'), { input: { order_id: 'order-2', amount_dollars: 3.21, request_id: 'sealed-request-2' },
      expected: { refund_amount_cents: 321, ledger_total_cents: 321, ledger_provenance: 'customer_request', request_key: 'sealed-request-2', ledger_count: 1 } });
    await freezeEvidenceCase(caseDir, 'refund-controlled-demo', false);
    const session = await openEvidenceCase(caseDir, join(root, 'decision'));
    const input = { plan: candidate, oldContract: oldRefundContract, newContract: snapshot.tools, gateEvidence: await session.gate.read(),
      policyVersion: 'stateful-fixture-v1' as const, fixture, invoke: createMcpInvoker(target) };
    const report = await verifyIsolated(input);
    if (report.verdict !== 'PROMOTED') throw new Error('Controlled refund gate failed');
    const registry = new PromotionRegistry(join(root, 'registry'));
    const key = await registry.promote({ ...input, report });
    await session.commitDecision(candidate, report, report.verdict);
    const sealed = await (await session.openSealedEvaluation()).read() as { input: Record<string, unknown>; expected: Record<string, unknown> };
    await fixture.reset();
    proxy = createCompatibilityServer({ oldContract: oldRefundContract, target, registry, key, snapshot: snapshotConfig,
      targetTools: snapshot.tools.map((tool) => tool.name), executionEnvironment: 'isolated-fixture' });
    client = await connectFixtureClient(proxy, 'unchanged-refund-agent');
    const listed = await client.listTools();
    const first = await client.callTool({ name: 'refund_order', arguments: sealed.input });
    const retry = await client.callTool({ name: 'refund_order', arguments: sealed.input });
    const state = jsonValueSchema.parse(await fixture.observe());
    if (state === null || typeof state !== 'object' || Array.isArray(state)) throw new Error('Invalid fixture state');
    const passed = !first.isError && !retry.isError && hashJson(first.structuredContent) === hashJson(retry.structuredContent)
      && Object.entries(sealed.expected).every(([name, value]) => hashJson(state[name]) === hashJson(value));
    const summary = { kind: 'controlled-mcp-sqlite-demo', verdict: report.verdict, sealed_opened_after_decision: true,
      sealed_fixture_passed: passed, stable_tool: listed.tools[0]?.name ?? '', output: first.structuredContent ?? null,
      plan_hash: report.plan_hash, side_effects: state.side_effects };
    await atomicWriteJson(join(root, 'summary.json'), summary);
    return summary;
  } finally {
    await client?.close(); await proxy?.close(); await target.close(); await backend.close(); fixture.close();
  }
}
