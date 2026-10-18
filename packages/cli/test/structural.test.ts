import { it, expect } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { runCli } from '../product.js';
import { oldContract, newContract, plan, gate } from '../../compiler/test/structural.fixture.js';

it('migrates, verifies and serves a structural plan through the product CLI without credentials', async () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  await mkdir(join(root, '.contractrelay'), { recursive: true });
  const dir = await mkdtemp(join(root, '.contractrelay', 'structural-cli-'));
  const client = new Client({ name: 'unchanged-structural-cli-client', version: '1' });
  const loader = pathToFileURL(join(root, 'node_modules/tsx/dist/loader.mjs')).href;
  let stdout = '', stderr = '';
  const io = { out: (text: string) => { stdout += text; }, err: (text: string) => { stderr += text; } };
  try {
    const old = join(dir, 'old.json'), next = join(dir, 'new.json'), destination = join(dir, 'adapter.json');
    const snapshot = (contract: typeof oldContract) => ({ tools: [{ name: contract.name, inputSchema: contract.inputSchema, outputSchema: contract.outputSchema }] });
    await writeFile(old, JSON.stringify(snapshot(oldContract))); await writeFile(next, JSON.stringify(snapshot(newContract)));
    await writeFile(`${old}.evidence.json`, JSON.stringify({ version: 1, dataClass: 'controlled-synthetic', policy: 'read-only-v1', sourceTool: oldContract.name,
      oldMetadata: { [oldContract.name]: { sideEffect: 'READ_ONLY', idempotency: 'IDEMPOTENT' } }, newMetadata: { [newContract.name]: { sideEffect: 'READ_ONLY', idempotency: 'IDEMPOTENT' } },
      documents: [{ id: 'structural-doc', text: 'Wrap sample-id in sample-list. Reconstruct matched from count > 0 and query from the original sample-id.' }],
      gate: { ...gate, traces: gate.traces.map(trace => ({ traceId: trace.traceId, tool: trace.tool, input: trace.input, output: trace.output, replays: trace.replays })) },
      target: { command: process.execPath, args: ['--import', loader, join(root, 'packages/cli/test/structural-server.ts')], cwd: root } }));
    expect(await runCli(['migrate', '--old', old, '--new', next, '--out', destination], io, { synthesize: async () => plan })).toBe(0);
    expect(await runCli(['verify', '--plan', destination], io)).toBe(0);
    expect(stderr).toBe(''); expect(stdout).toContain('PASS');
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(root, 'bin/contractrelay.mjs'), 'serve', '--plan', destination], cwd: root, stderr: 'pipe' }));
    for (const code of ['alpha', 'beta']) expect((await client.callTool({ name: oldContract.name, arguments: { 'sample-id': { code } } })).structuredContent).toEqual({ matched: code === 'alpha', query: { code } });
  } finally { await client.close(); await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}, 20_000);
