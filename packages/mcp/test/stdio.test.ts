import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const directories: string[] = [];
const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('native MCP stdio compatibility server', () => {
  it('serves an unchanged refund client from a separate process without credentials', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contractrelay-stdio-')); directories.push(dir);
    const root = fileURLToPath(new URL('../../../', import.meta.url));
    const transport = new StdioClientTransport({ command: process.execPath,
      args: ['--experimental-sqlite', '--import', pathToFileURL(join(root, 'node_modules/tsx/dist/loader.mjs')).href, join(root, 'packages/cli/src/index.ts'),
        'serve', '--fixture', 'refund', '--registry', join(dir, 'registry')], cwd: root, env: {}, stderr: 'pipe' });
    let diagnostics = '';
    transport.stderr?.on('data', (chunk: Buffer) => { diagnostics = `${diagnostics}${chunk.toString()}`.slice(-4000); });
    const client = new Client({ name: 'unchanged-stdio-agent', version: '1' }); clients.push(client);
    try { await client.connect(transport); }
    catch (error) { throw new Error(`${error instanceof Error ? error.message : 'Connection failed'}\n${diagnostics}`); }
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(['refund_order']);
    const request = { name: 'refund_order', arguments: { order_id: 'order-2', amount_dollars: 3.21, request_id: 'stdio-request' } };
    const first = await client.callTool(request);
    expect(first.structuredContent).toEqual({ refund_id: 'refund-stdio-request', status: 'refunded' });
    expect((await client.callTool(request)).structuredContent).toEqual(first.structuredContent);
  }, 15_000);
});
