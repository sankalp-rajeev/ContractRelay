// Maintainer-only, API-free capture. Not called by install, dev, the API, or UI.
// Uses the existing verifier, registry, MCP proxy and SQLite fixture unchanged.
// This is a separate local demonstration, never a new benchmark result.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { connectFixtureClient } from '../../../packages/mcp/src/testing.ts';
import { createFixtureServer } from '../../../packages/mcp/src/fixture-server.ts';
import { createCompatibilityServer, createMcpInvoker } from '../../../packages/mcp/src/proxy.ts';
import { snapshotTools } from '../../../packages/mcp/src/index.ts';
import { verifyIsolated } from '../../../packages/verifier/src/isolated.ts';
import { PromotionRegistry } from '../../../packages/runtime/src/index.ts';
import { RefundFixture } from '../../../fixtures/synthetic/refund/sqlite.ts';
import {
  oldRefundContract,
  refundTargetContracts,
} from '../../../fixtures/synthetic/refund/contracts.ts';
import { refundGate } from '../../../fixtures/synthetic/refund/gate.ts';

const fixture = new RefundFixture();
const backend = createFixtureServer(refundTargetContracts, fixture.invoke);
const target = await connectFixtureClient(backend, 'inspector-capture-backend');
let proxy;
let client;
try {
  const plan = JSON.parse(
    await readFile('apps/inspector/data/controlled/12-refund-workflow/candidate.json', 'utf8'),
  );
  const snapshotConfig = {
    namespace: 'refund',
    source: 'controlled-refund-mcp-server',
    version: '2',
    metadata: Object.fromEntries(
      refundTargetContracts.map((contract) => [
        contract.name,
        { sideEffect: contract.sideEffect, idempotency: contract.idempotency },
      ]),
    ),
  };
  const snapshot = await snapshotTools(target, snapshotConfig);
  const input = {
    plan,
    oldContract: oldRefundContract,
    newContract: snapshot.tools,
    gateEvidence: refundGate,
    policyVersion: 'stateful-fixture-v1',
    fixture,
    invoke: createMcpInvoker(target),
  };
  const report = await verifyIsolated(input);
  const registry = new PromotionRegistry(resolve('.contractrelay/inspector-refund-registry'));
  const key = await registry.promote({ ...input, report });
  await fixture.reset();
  const calls = [];
  let invocation = 1;
  const recordedTarget = {
    listTools: (params) => target.listTools(params),
    callTool: async (params) => {
      const response = await target.callTool(params);
      calls.push({ invocation, call: params, response });
      return response;
    },
  };
  proxy = createCompatibilityServer({
    oldContract: oldRefundContract,
    registry,
    key,
    target: recordedTarget,
    snapshot: snapshotConfig,
    targetTools: snapshot.tools.map((tool) => tool.name),
    executionEnvironment: 'isolated-fixture',
  });
  client = await connectFixtureClient(proxy, 'unchanged-inspector-demo-client');
  const oldInvocation = {
    name: 'refund_order',
    arguments: { order_id: 'order-2', amount_dollars: 3.21, request_id: 'inspector-demo' },
  };
  const first = await client.callTool(oldInvocation);
  invocation = 2;
  const retry = await client.callTool(oldInvocation);
  const state = await fixture.observe();
  assert.equal(first.isError, undefined);
  assert.deepEqual(first.structuredContent, retry.structuredContent);
  assert.equal(state.ledger_count, 1);
  const capture = {
    kind: 'separate-api-free-local-mcp-fixture-capture',
    model_calls: 0,
    description:
      'Recorded local replay of the completed B3 trial-1 plan through existing verification, promotion and MCP APIs. Separate from frozen benchmark measurements. Timings deliberately not measured.',
    adapter_hash: report.plan_hash,
    old_invocation: oldInvocation,
    backend_calls: calls,
    first_output: first.structuredContent,
    retry_output: retry.structuredContent,
    final_state: state,
    verification: report,
    old_contract: oldRefundContract,
    new_contracts: snapshot.tools,
  };
  await writeFile(
    'apps/inspector/data/refund-execution.json',
    `${JSON.stringify(capture, null, 2)}\n`,
    { flag: 'wx' },
  );
  console.log(
    `Recorded ${calls.length} actual backend calls over two unchanged invocations, with one ledger entry. No model calls.`,
  );
} finally {
  await client?.close();
  await proxy?.close();
  await target.close();
  await backend.close();
  fixture.close();
}
