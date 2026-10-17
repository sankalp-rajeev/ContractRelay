import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { PromotionRegistry } from '@contractrelay/runtime';
import { verifyIsolated } from '../../verifier/src/isolated.js';
import { snapshotTools } from '../src/index.js';
import { createCompatibilityServer, createMcpInvoker, toMcpTool } from '../src/proxy.js';
import { newContract, oldContract, plan, weatherGate, weatherInvoker } from '../../../fixtures/synthetic/weather/fixture.js';

const directories: string[] = [];
const connections: { close(): Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(connections.splice(0).map((connection) => connection.close()));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'contractrelay-mcp-'));
  directories.push(dir);
  let definition = toMcpTool(newContract as Parameters<typeof toMcpTool>[0]);
  let calls = 0;
  const backend = new Server({ name: 'evolved-weather', version: '2' }, { capabilities: { tools: {} } });
  backend.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [definition] }));
  backend.setRequestHandler(CallToolRequestSchema, async (request) => {
    calls++;
    const result = await weatherInvoker(request.params.name, request.params.arguments as Record<string, string>);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result as Record<string, unknown> };
  });
  const target = new Client({ name: 'contractrelay-target-client', version: '1' });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await backend.connect(serverTransport);
  await target.connect(clientTransport);
  connections.push(target, backend);
  const snapshot = { namespace: 'weather', source: 'controlled-mcp-server', version: '2',
    metadata: { fetch_forecast: { sideEffect: 'READ_ONLY', idempotency: 'IDEMPOTENT' } } } as const;
  const current = (await snapshotTools(target, snapshot)).tools[0];
  const input = { oldContract, newContract: current, plan, gateEvidence: weatherGate, invoke: createMcpInvoker(target) };
  const report = await verifyIsolated(input);
  const registry = new PromotionRegistry(join(dir, 'registry'));
  const key = await registry.promote({ ...input, report });
  const proxy = createCompatibilityServer({ oldContract, registry, key, target, snapshot, targetTool: 'fetch_forecast' });
  const client = new Client({ name: 'unchanged-agent', version: '1' });
  const [proxyTransport, agentTransport] = InMemoryTransport.createLinkedPair();
  await proxy.connect(proxyTransport);
  await client.connect(agentTransport);
  connections.push(client, proxy);
  return { client, calls: () => calls, drift: () => { definition = { ...definition, description: 'Changed semantics' }; } };
}

describe('real MCP compatibility protocol (TC-018)', () => {
  it('exposes the old logical interface and translates an unchanged client call', async () => {
    const { client } = await fixture();
    const listed = await client.listTools();
    expect(listed.tools).toEqual([toMcpTool(oldContract as Parameters<typeof toMcpTool>[0])]);
    expect((await client.callTool({ name: 'get_weather', arguments: { city: 'Ann Arbor' } })).structuredContent)
      .toEqual({ temperature: 64, conditions: 'Clear' });
  });

  it('detects live contract drift before forwarding a call', async () => {
    const context = await fixture();
    const before = context.calls();
    context.drift();
    const result = await context.client.callTool({ name: 'get_weather', arguments: { city: 'Ann Arbor' } });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: '{"code":"CONTRACT_DRIFT"}' }]);
    expect(context.calls()).toBe(before);
  });

  it('rejects invalid old inputs and unknown logical tools', async () => {
    const { client, calls } = await fixture();
    const before = calls();
    expect((await client.callTool({ name: 'get_weather', arguments: { city: '' } })).isError).toBe(true);
    expect(calls()).toBe(before);
    await expect(client.callTool({ name: 'fetch_forecast', arguments: { location: 'Ann Arbor', units: 'imperial' } })).rejects.toThrow('Unknown stable tool');
  });
});
