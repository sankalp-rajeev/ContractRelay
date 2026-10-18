import { afterEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { hashJson } from '@contractrelay/contracts';
import { runCli } from '../product.js';
import { artifactPaths, exists } from '../product-context.js';
import { QuotaScheduler } from '../../synthesizer/src/index.js';
import { synthesizeIsolated } from '../../synthesizer/src/isolated.js';
import type { SynthesisEvidence } from '../../synthesizer/src/index.js';
import type { AdapterPlan } from '../../dsl/src/index.js';
import fixturePlan from '../../../fixtures/synthetic/weather/adapter.plan.json' with { type: 'json' };
import { adapterPlanSchema } from '../../dsl/src/index.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const example = join(root, 'examples/cli/weather');
const loader = pathToFileURL(join(root, 'node_modules/tsx/dist/loader.mjs')).href;
const launcher = join(root, 'bin/contractrelay.mjs');
const exec = promisify(execFile);
const directories: string[] = [];
const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map(client => client.close()));
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })));
});
function output() {
  let stdout = '', stderr = '';
  return { io: { out: (value: string) => { stdout += value; }, err: (value: string) => { stderr += value; } }, get stdout() { return stdout; }, get stderr() { return stderr; } };
}
async function sample() {
  const parent = join(root, '.contractrelay'); await mkdir(parent, { recursive: true });
  const dir = await mkdtemp(join(parent, 'cli-test-')); directories.push(dir);
  for (const file of ['old-tools.json', 'new-tools.json', 'old-tools.json.evidence.json']) await copyFile(join(example, file), join(dir, file));
  const evidencePath = join(dir, 'old-tools.json.evidence.json');
  const evidence = JSON.parse(await readFile(evidencePath, 'utf8')) as { target: { command: string; args: string[]; cwd: string }; gate: { predicates: { id: string }[] }; newMetadata: Record<string, { sideEffect: string; idempotency: string }> };
  evidence.target = { command: process.execPath, args: ['--import', loader, join(root, 'packages/cli/example-server.ts')], cwd: root };
  if (evidence.gate.predicates[0]) evidence.gate.predicates[0].id = 'CLI_GATE_ONLY_SENTINEL';
  await writeFile(evidencePath, JSON.stringify(evidence));
  const plan = join(dir, 'adapter.json');
  const args = ['migrate', '--old', join(dir, 'old-tools.json'), '--new', join(dir, 'new-tools.json'), '--out', plan];
  return { dir, plan, args, evidence, evidencePath };
}
const candidate = adapterPlanSchema.parse(fixturePlan);
const generated = { synthesize: async () => candidate };

describe('thin product CLI', () => {
  it('prints concise help and rejects unknown commands/options or missing flags', async () => {
    const help = output(); expect(await runCli(['--help'], help.io)).toBe(0);
    expect(help.stdout).toContain('contractrelay migrate --old');
    for (const args of [['unknown'], ['migrate'], ['verify', '--arbitrary-code', 'x']]) {
      const result = output(); expect(await runCli(args, result.io)).toBe(1); expect(result.stderr).toContain('ERROR');
    }
  });

  it('uses existing isolated synthesis and retains gate/target data outside the prompt', async () => {
    const data = await sample(); const result = output(); let prompt = '';
    const synthesize = async (evidence: SynthesisEvidence, directory: string): Promise<AdapterPlan> => {
      const provider = { generate: async (request: { prompt: string }) => { prompt = request.prompt; return { text: JSON.stringify({ candidate }), inputTokens: 10, outputTokens: 10 }; } };
      const scheduler = new QuotaScheduler(directory, provider, { model: 'api-free-cli-test', rpm: 1000, tpm: 2_000_000, rpdHard: 100, rpdSoft: 100 }, { cache: false });
      return synthesizeIsolated(scheduler, evidence, { jobId: 'cli-isolated-test', mode: 'dev', model: 'api-free-cli-test' });
    };
    expect(await runCli(data.args, result.io, { synthesize })).toBe(0);
    expect(prompt).toContain('ContractRelay synthesis policy v5');
    expect(prompt).not.toContain('CLI_GATE_ONLY_SENTINEL');
    expect(prompt).not.toContain('example-server.ts');
    expect(result.stdout).toContain('CANDIDATE');
    expect(await readFile(data.plan, 'utf8')).toContain('get_weather');
    expect(await exists(artifactPaths(data.plan).verified)).toBe(false);
  }, 15_000);

  it('verifies through the real gate and serves an unchanged MCP client without a key', async () => {
    const data = await sample(); expect(await runCli(data.args, output().io, generated)).toBe(0);
    const environment = { ...process.env }; delete environment.GEMINI_API_KEY;
    const verified = await exec(process.execPath, [launcher, 'verify', '--plan', data.plan], { cwd: root, env: environment });
    expect(verified.stdout).toContain('V2 PASS'); expect(verified.stdout).toContain('PASS ');
    const client = new Client({ name: 'outsider-old-agent', version: '1' }); clients.push(client);
    const transport = new StdioClientTransport({ command: process.execPath, args: [launcher, 'serve', '--plan', data.plan], cwd: root, env: {}, stderr: 'pipe' });
    await client.connect(transport);
    expect((await client.listTools()).tools.map(tool => tool.name)).toEqual(['get_weather']);
    const request = { name: 'get_weather', arguments: { city: 'Ann Arbor' } };
    expect((await client.callTool(request)).structuredContent).toEqual({ temperature: 64, conditions: 'Clear' });
    expect((await client.callTool(request)).structuredContent).toEqual({ temperature: 64, conditions: 'Clear' });
  }, 20_000);

  it('refuses serving a candidate before verification and keeps stdout protocol-only', async () => {
    const data = await sample(); await runCli(data.args, output().io, generated);
    const result = output(); expect(await runCli(['serve', '--plan', data.plan], result.io)).toBe(1);
    expect(result.stderr).toContain('PLAN_NOT_VERIFIED'); expect(result.stdout).toBe('');
  });

  it('returns explicit rejection for snapshots without independent evidence, without synthesis', async () => {
    const data = await sample(); await rm(data.evidencePath); let called = false;
    const result = output(); expect(await runCli(data.args, result.io, { synthesize: async () => { called = true; return candidate; } })).toBe(2);
    expect(called).toBe(false); expect(result.stdout).toContain('REJECT');
    const served = output(); expect(await runCli(['serve', '--plan', data.plan], served.io)).toBe(2);
    expect(served.stdout).toBe(''); expect(served.stderr).toContain('REJECT');
  });

  it('rejects unsupported effects before calling the model', async () => {
    const data = await sample(); const metadata = data.evidence.newMetadata.fetch_forecast;
    if (!metadata) throw new Error('Missing fixture metadata'); metadata.sideEffect = 'UNKNOWN';
    await writeFile(data.evidencePath, JSON.stringify(data.evidence)); let called = false;
    const result = output(); expect(await runCli(data.args, result.io, { synthesize: async () => { called = true; return candidate; } })).toBe(2);
    expect(called).toBe(false); expect(result.stdout).toContain('READ_ONLY');
  });

  it('preserves an existing output without issuing replacement synthesis', async () => {
    const data = await sample(); await runCli(data.args, output().io, generated); const before = await readFile(data.plan, 'utf8');
    let called = false; const result = output();
    expect(await runCli(data.args, result.io, { synthesize: async () => { called = true; return candidate; } })).toBe(1);
    expect(called).toBe(false); expect(result.stderr).toContain('OUTPUT_EXISTS'); expect(await readFile(data.plan, 'utf8')).toBe(before);
  });

  it('prints actual rejection reasons for a schema-valid semantic mismatch', async () => {
    const data = await sample(); const wrong = structuredClone(candidate);
    if ('op' in wrong) throw new Error('Expected translation');
    const units = wrong.steps.find(step => step.op === 'AddConstantDefault');
    if (!units || units.op !== 'AddConstantDefault') throw new Error('Missing units'); units.value = 'metric';
    await runCli(data.args, output().io, { synthesize: async () => wrong });
    const result = output(); expect(await runCli(['verify', '--plan', data.plan], result.io)).toBe(2);
    expect(result.stdout).toContain('REJECT'); expect(result.stdout).toContain('independent evidence');
    expect(await exists(artifactPaths(data.plan).verified)).toBe(false);
  }, 15_000);

  it('refuses a changed plan or context after verification', async () => {
    const data = await sample(); await runCli(data.args, output().io, generated);
    expect(await runCli(['verify', '--plan', data.plan], output().io)).toBe(0);
    const original = await readFile(data.plan, 'utf8'); const changed = JSON.parse(original) as Record<string, unknown>; changed.rationale = 'tampered';
    await writeFile(data.plan, JSON.stringify(changed)); const result = output();
    expect(await runCli(['serve', '--plan', data.plan], result.io)).toBe(1); expect(result.stderr).toContain('PLAN_CHANGED');
    await writeFile(data.plan, original);
    const path = artifactPaths(data.plan).context; const context = JSON.parse(await readFile(path, 'utf8')) as { target: { args: string[] } };
    context.target.args.push('--changed'); await writeFile(path, JSON.stringify(context));
    const altered = output(); expect(await runCli(['serve', '--plan', data.plan], altered.io)).toBe(1); expect(altered.stderr).toContain('VERIFIED_CONTEXT_CHANGED');
  }, 15_000);

  it('detects target contract drift before verifying', async () => {
    const data = await sample(); const path = join(data.dir, 'new-tools.json');
    const snapshot = JSON.parse(await readFile(path, 'utf8')) as { tools: { description: string }[] };
    if (!snapshot.tools[0]) throw new Error('Missing tool'); snapshot.tools[0].description += ' changed snapshot';
    await writeFile(path, JSON.stringify(snapshot)); await runCli(data.args, output().io, generated);
    const result = output(); expect(await runCli(['verify', '--plan', data.plan], result.io)).toBe(1); expect(result.stderr).toContain('TARGET_CONTRACT_DRIFT');
  }, 15_000);

  it('rejects when the independent promotion gate disagrees with the first pass', async () => {
    const data = await sample(); const server = join(data.dir, 'unstable.mjs');
    const uri = (path: string) => pathToFileURL(join(root, path)).href;
    await writeFile(server, `import {StdioServerTransport} from ${JSON.stringify(uri('packages/cli/node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js'))};
import {createFixtureServer} from ${JSON.stringify(uri('packages/mcp/src/fixture-server.ts'))};
import {newContract,weatherInvoker} from ${JSON.stringify(uri('fixtures/synthetic/weather/fixture.ts'))};
let calls=0;
const backend=createFixtureServer([newContract],(tool,args)=>++calls===1?weatherInvoker(tool,args):Promise.resolve({current:{temperature:999,summary:'Clear'}}));
await backend.connect(new StdioServerTransport());process.stdin.once('end',()=>{void backend.close()});`);
    data.evidence.target.args = ['--import', loader, server]; await writeFile(data.evidencePath, JSON.stringify(data.evidence));
    await runCli(data.args, output().io, generated);
    const result = output(); expect(await runCli(['verify', '--plan', data.plan], result.io)).toBe(2);
    expect(result.stdout).toContain('V2 PASS'); expect(result.stdout).toContain('REJECT Mandatory');
    expect(await exists(artifactPaths(data.plan).verified)).toBe(false);
    const served = output(); expect(await runCli(['serve', '--plan', data.plan], served.io)).toBe(1);
    expect(served.stderr).toContain('PLAN_NOT_VERIFIED');
  }, 15_000);

  it('revokes a prior promotion when a subsequent behavioral gate fails', async () => {
    const data = await sample(); const flag = join(data.dir, 'incorrect.json'); const server = join(data.dir, 'server.mjs');
    const uri = (path: string) => pathToFileURL(join(root, path)).href;
    await writeFile(server, `import {existsSync} from 'node:fs';
import {StdioServerTransport} from ${JSON.stringify(uri('packages/cli/node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js'))};
import {createFixtureServer} from ${JSON.stringify(uri('packages/mcp/src/fixture-server.ts'))};
import {newContract,weatherInvoker} from ${JSON.stringify(uri('fixtures/synthetic/weather/fixture.ts'))};
const backend=createFixtureServer([newContract],(tool,args)=>existsSync(${JSON.stringify(flag)})?Promise.resolve({current:{temperature:999,summary:'Clear'}}):weatherInvoker(tool,args));
await backend.connect(new StdioServerTransport());process.stdin.once('end',()=>{void backend.close()});`);
    data.evidence.target.args = ['--import', loader, server]; await writeFile(data.evidencePath, JSON.stringify(data.evidence));
    await runCli(data.args, output().io, generated); expect(await runCli(['verify', '--plan', data.plan], output().io)).toBe(0);
    await writeFile(flag, '{}'); const rejected = output(); expect(await runCli(['verify', '--plan', data.plan], rejected.io)).toBe(2);
    const served = output(); expect(await runCli(['serve', '--plan', data.plan], served.io)).toBe(1); expect(served.stderr).toContain('PROMOTION_REVOKED');
    const receipt = JSON.parse(await readFile(artifactPaths(data.plan).verified, 'utf8')) as { key: unknown };
    expect(await exists(join(artifactPaths(data.plan).registry, hashJson(receipt.key), 'revoked.json'))).toBe(true);
  }, 20_000);
});
