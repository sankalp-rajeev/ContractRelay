import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readJson } from '@contractrelay/contracts/artifacts';
import { snapshotTools } from '@contractrelay/mcp';
import { createFixtureServer } from '@contractrelay/mcp/fixture-server';
import { createCompatibilityServer, createMcpInvoker } from '@contractrelay/mcp/proxy';
import { connectFixtureClient } from '../../mcp/src/testing.js';
import { PromotionRegistry } from '@contractrelay/runtime';
import { verifyIsolated } from '@contractrelay/verifier/isolated';
import { newContract, oldContract, plan, weatherGate, weatherInvoker } from '../../../fixtures/synthetic/weather/fixture.js';
import { RefundFixture } from '../../../fixtures/synthetic/refund/sqlite.js';
import { oldRefundContract, refundTargetContracts } from '../../../fixtures/synthetic/refund/contracts.js';
import refundPlan from '../../../fixtures/synthetic/refund/adapter.plan.json' with { type: 'json' };
import { refundGate } from '../../../fixtures/synthetic/refund/gate.js';
import { toolContractSchema } from '@contractrelay/contracts';

export async function serveFixture(options: { fixture: 'weather' | 'refund'; registry: string; plan?: string }): Promise<void> {
  const refund = options.fixture === 'refund' ? new RefundFixture() : undefined;
  const targets = refund ? refundTargetContracts : [toolContractSchema.parse(newContract)];
  const old = refund ? oldRefundContract : oldContract;
  const selected = options.plan ? await readJson(options.plan) : refund ? refundPlan : plan;
  const backend = createFixtureServer(targets, refund?.invoke ?? weatherInvoker);
  const target = await connectFixtureClient(backend, 'contractrelay-fixture-target');
  const snapshotConfig = { namespace: options.fixture, source: `controlled-${options.fixture}-stdio`, version: '2',
    metadata: Object.fromEntries(targets.map((contract) => [contract.name, { sideEffect: contract.sideEffect, idempotency: contract.idempotency }])) };
  const snapshot = await snapshotTools(target, snapshotConfig);
  const current = refund ? snapshot.tools : snapshot.tools[0];
  const verification = { oldContract: old, newContract: current, plan: selected, gateEvidence: refund ? refundGate : weatherGate,
    invoke: createMcpInvoker(target), ...(refund ? { fixture: refund, policyVersion: 'stateful-fixture-v1' as const } : {}) };
  const report = await verifyIsolated(verification);
  const registry = new PromotionRegistry(options.registry);
  const key = await registry.promote({ ...verification, report });
  await refund?.reset();
  const proxy = createCompatibilityServer({ oldContract: old, registry, key, target, snapshot: snapshotConfig,
    ...(refund ? { targetTools: targets.map((contract) => contract.name), executionEnvironment: 'isolated-fixture' as const }
      : { targetTool: targets[0]?.name ?? '' }) });
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await proxy.close(); await target.close(); await backend.close(); refund?.close();
  };
  process.once('SIGTERM', () => { void close(); }); process.once('SIGINT', () => { void close(); });
  process.stdin.once('end', () => { void close(); });
  proxy.onclose = () => { void close(); };
  await proxy.connect(new StdioServerTransport());
}
