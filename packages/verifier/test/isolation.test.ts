import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runIsolatedTask } from '@contractrelay/contracts/sandbox';
import { verifyIsolated } from '../src/isolated.js';
import { verifyCandidate } from '../src/index.js';
import { newContract, oldContract, plan, weatherGate, weatherInvoker } from '../../../fixtures/synthetic/weather/fixture.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

describe('actual verifier worker filesystem permissions', () => {
  it('produces the same report through a narrowly allowlisted invocation capability', async () => {
    const input = { newContract, oldContract, plan, gateEvidence: weatherGate, invoke: weatherInvoker };
    expect(await verifyIsolated(input)).toEqual(await verifyCandidate(input));
  });

  it('blocks direct filesystem access from verification code (TC-019)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contractrelay-worker-probe-'));
    directories.push(dir);
    const path = join(dir, 'sealed-evidence.json');
    await writeFile(path, '{"hidden":"must-not-leak"}', 'utf8');
    await expect(runIsolatedTask(fileURLToPath(new URL('../src/isolation-worker.ts', import.meta.url)),
      { operation: 'probe', path }, async () => null)).rejects.toThrow('ERR_ACCESS_DENIED');
  });
});
