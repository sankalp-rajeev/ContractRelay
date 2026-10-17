import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runWeatherLifecycle } from '../../../fixtures/synthetic/weather/lifecycle.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

describe('local candidate, gate, promotion and sealed scoring lifecycle', () => {
  it('demonstrates an accepted migration and independent semantic rejection with no API key', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contractrelay-lifecycle-'));
    directories.push(dir);
    expect(await runWeatherLifecycle(dir)).toMatchObject({ model_calls: 0, compatible_verdict: 'PROMOTED',
      semantic_mismatch_verdict: 'REJECTED', sealed_opened_after_decision: true, sealed_fixture_passed: true });
    // Re-running uses the same immutable evidence/decision rather than overwriting it.
    expect(await runWeatherLifecycle(dir)).toMatchObject({ sealed_fixture_passed: true });
  }, 15000); // Two full permissioned-process lifecycles, including immutable resume.
});
