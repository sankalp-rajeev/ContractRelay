import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSuite } from '../src/suite.js';
import { runBenchmark } from '../src/runner.js';
import { summarize } from '../src/metrics.js';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
const suiteRoot = fileURLToPath(new URL('../../../benchmarks/', import.meta.url));
describe('frozen benchmark protocol and API-free execution (TC-020/023)', () => {
  it('freezes exactly fifteen cases with three held out and refuses prompt/source drift', async () => {
    const { suite } = await loadSuite(suiteRoot);
    expect(suite.cases).toHaveLength(15);
    expect(suite.cases.filter((item) => item.held_out)).toHaveLength(3);
    expect(suite.cases.filter((item) => item.held_out).every((item) => !item.influenced_design)).toBe(true);
    expect(new Set(suite.cases.map((item) => item.change_class)).size).toBe(9);
  });
  it('runs deterministic B1 without credentials, scores unseen tasks and resumes without reexecution', async () => {
    const runRoot = await mkdtemp(join(tmpdir(), 'contractrelay-suite-')); dirs.push(runRoot);
    const settings = { suiteRoot, runRoot, mode: 'api-free' as const, model: 'none', trials: 1, resume: false, includeHeldOut: true };
    const first = await runBenchmark(settings);
    expect(first.results).toHaveLength(15);
    expect(first.results.every((run) => run.model_jobs.length === 0)).toBe(true);
    expect(first.results.filter((run) => run.hidden_passed)).toHaveLength(9);
    expect(first.results.filter((run) => run.compatibility !== 'compatible').every((run) => run.explicit_rejection)).toBe(true);
    expect((await runBenchmark({ ...settings, resume: true })).results).toEqual(first.results);
    const metrics = summarize(first.results);
    expect(metrics.methods.b1!.all).toMatchObject({ trials: 15, recovered: 9, safe_rejections: 4, generation_failures: 0 });
  }, 20000);
});
