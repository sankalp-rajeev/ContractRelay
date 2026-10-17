import { spawn } from 'node:child_process';
import { mkdir, open, unlink, access, readFile } from 'node:fs/promises';
import { openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { atomicWriteJson, readJson } from '../packages/contracts/src/artifacts.js';
import { quotaDay } from '../packages/synthesizer/src/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const control = join(root, '.contractrelay');
await mkdir(control, { recursive: true });
const lockPath = join(control, 'final-runner.lock');
const statusPath = join(control, 'final-runner.json');
const stopPath = join(control, 'final-runner.stop');
const logPath = join(control, 'final-runner.log');
const summaryPath = join(root, 'runs/benchmark-v3-final/summary.json');
let lock;
try { lock = await open(lockPath, 'wx'); }
catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  const prior = JSON.parse(await readFile(lockPath, 'utf8')) as { pid: number };
  let alive = false;
  try { process.kill(prior.pid, 0); alive = true; } catch (failure) { if ((failure as NodeJS.ErrnoException).code !== 'ESRCH') throw failure; }
  if (alive) throw new Error('FINAL_RUNNER_ALREADY_ACTIVE');
  await unlink(lockPath); lock = await open(lockPath, 'wx');
}
await lock.writeFile(JSON.stringify({ pid: process.pid, root })); await lock.close();
const stopped = async () => { try { await access(stopPath); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; return false; } };
const status = (state: string, extra: Record<string, unknown> = {}) => atomicWriteJson(statusPath,
  { version: 1, pid: process.pid, state, updated_at: new Date().toISOString(), quota_day: quotaDay(Date.now()), summary_path: summaryPath, log_path: logPath, ...extra });
try {
  await status('starting');
  while (!await stopped()) {
    await status('running');
    const env: NodeJS.ProcessEnv = { CONTRACTRELAY_MODEL_MODE: 'final' };
    for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'HOME']) {
      if (process.env[key] !== undefined) env[key] = process.env[key];
    }
    const fd = openSync(logPath, 'a');
    const code = await new Promise<number | null>((resolve, reject) => {
      const child = spawn(process.execPath, ['--experimental-sqlite', '--env-file', join(root, '.env'), '--import',
        pathToFileURL(join(root, 'node_modules/tsx/dist/loader.mjs')).href, join(root, 'scripts/benchmark.ts'), '--resume'],
      { cwd: root, env, stdio: ['ignore', fd, fd], windowsHide: true });
      child.once('error', reject); child.once('exit', resolve);
    }).finally(() => closeSync(fd));
    if (code !== 0) throw new Error('FINAL_BATCH_FAILED_CHECK_LOG');
    const summary = await readJson(summaryPath) as { complete: boolean; quota_blocked: boolean; trials: number };
    if (summary.complete) { await status('completed', { trials: summary.trials }); break; }
    if (!summary.quota_blocked) throw new Error('FINAL_BATCH_INCOMPLETE_WITHOUT_QUOTA_STOP');
    const blockedDay = quotaDay(Date.now());
    await status('waiting_for_quota_day', { trials: summary.trials });
    while (quotaDay(Date.now()) === blockedDay && !await stopped()) await new Promise((done) => setTimeout(done, 60000));
  }
  if (await stopped()) await status('stopped');
} catch (error) {
  await status('failed', { error_code: error instanceof Error ? error.message : 'FINAL_RUNNER_FAILED' });
  process.exitCode = 1;
} finally { await unlink(lockPath); }
