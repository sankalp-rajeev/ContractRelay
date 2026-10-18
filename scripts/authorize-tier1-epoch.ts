import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashJson } from '../packages/contracts/src/index.js';
import { readJson, writeOnceJson } from '../packages/contracts/src/artifacts.js';
import { executionFingerprint } from '../packages/benchmark/src/fingerprint.js';
import { tier1EpochSchema } from '../packages/benchmark/src/execution-epoch.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const baseline = '9cf0753b81d744a85b61551116bc2de9d63e4adc';
const git = (...args: string[]) => execFileSync('git', ['-c', `safe.directory=${root.replace(/\\/g, '/')}`, ...args], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
// Only scheduling, accounting and the explicit migration may change executable files.
const allowed = new Set(['config/models.json', 'scripts/benchmark.ts', 'scripts/continue-final.ts', 'scripts/authorize-tier1-epoch.ts',
  'packages/synthesizer/src/config.ts', 'packages/synthesizer/src/scheduler.ts', 'packages/synthesizer/src/concurrency.ts',
  'packages/benchmark/src/runner.ts', 'packages/benchmark/src/usage.ts', 'packages/benchmark/src/cost.ts', 'packages/benchmark/src/execution-epoch.ts']);
const paths = ['packages', 'scripts', 'config', 'benchmarks', 'fixtures', 'pnpm-lock.yaml', 'prd.md'];
const changed = [...new Set([...git('diff', '--name-only', baseline, '--', ...paths).split('\n'),
  ...git('ls-files', '--others', '--exclude-standard', '--', ...paths).split('\n')].filter(Boolean))].sort();
for (const path of changed) {
  if (path.includes('/test/') || allowed.has(path)) continue;
  throw new Error(`NON_OPERATIONAL_CHANGE: ${path}`);
}
const runRoot = join(root, 'runs/benchmark-v3-final-recovery');
const original = await readJson(join(runRoot, 'run-manifest.json')) as Record<string, unknown>;
const epoch = tier1EpochSchema.parse({ version: 1, authorization: 'user-requested-phase5-tier1-upgrade', baseline_commit: baseline,
  original_manifest_hash: hashJson(original), previous_fingerprint: original.execution_fingerprint, execution_fingerprint: await executionFingerprint(),
  quota: { model: 'gemini-3.8-flash', rpm: 1000, tpm: 2000000, rpdHard: 10000, rpdSoft: 10000 }, max_concurrency: 4,
  changed_operational_files: changed.filter((path) => allowed.has(path)), created_at: new Date().toISOString() });
await writeOnceJson(join(runRoot, 'execution-epochs/tier1-v1.json'), epoch);
process.stdout.write(`Tier 1 epoch recorded; original manifest ${epoch.original_manifest_hash} preserved.\n`);
