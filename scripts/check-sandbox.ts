import { DockerSandbox } from '../packages/benchmark/src/sandbox.js';
import config from '../config/sandbox.json' with { type: 'json' };
import { oldContract, newContract, weatherInvoker } from '../fixtures/synthetic/weather/fixture.js';
import { toolContractSchema } from '../packages/contracts/src/index.js';
import assert from 'node:assert/strict';

const sandbox = new DockerSandbox(config);
process.env.GEMINI_API_KEY = 'controlled-sandbox-secret-sentinel';
const target = toolContractSchema.parse(newContract);
const good = 'export async function adapt(input, callTool) { const r = await callTool("fetch_forecast", {location:input.city,units:"imperial"}); return {temperature:r.current.temperature,conditions:r.current.summary}; }';
assert.deepEqual(await sandbox.execute(good, { city: 'Ann Arbor' }, target, weatherInvoker), { temperature: 64, conditions: 'Clear' });
const probe = `import fs from 'node:fs'; export async function adapt() {
  let filesystemDenied=false, networkDenied=false;
  try { fs.writeFileSync('/host-leak','blocked'); } catch { filesystemDenied=true; }
  try { await fetch('http://1.1.1.1', {signal:AbortSignal.timeout(500)}); } catch { networkDenied=true; }
  return { filesystemDenied, networkDenied, secretAbsent: !process.env.GEMINI_API_KEY, hostAbsent: !fs.existsSync('/var/run/docker.sock') && !fs.existsSync('/workspace') };
}`;
assert.deepEqual(await sandbox.execute(probe, {}, target, weatherInvoker), { filesystemDenied: true, networkDenied: true, secretAbsent: true, hostAbsent: true });
await assert.rejects(sandbox.execute('export async function adapt(_,call) { return call("invented",{}); }', {}, target, weatherInvoker), { code: 'UNALLOWLISTED_TOOL_CALL' });
const short = new DockerSandbox({ ...config, wallTimeMs: 2000 });
await assert.rejects(short.execute('export function adapt() { for(;;){} }', {}, target, weatherInvoker), { code: 'SANDBOX_TIMEOUT' });
await assert.rejects(sandbox.execute('export async function adapt() { await new Promise(resolve => process.stdout.write("x".repeat(1100000), resolve)); return {}; }', {}, target, weatherInvoker), { code: 'SANDBOX_OUTPUT_LIMIT' });
console.log(JSON.stringify({ kind: 'real-docker-sandbox-acceptance', image: config.image, checks_passed: 5,
  old_interface: oldContract.name, network: 'none', host_mounts: 0, model_calls: 0 }, null, 2));
