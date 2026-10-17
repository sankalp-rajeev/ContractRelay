import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const environment = { ...process.env };
delete environment.GEMINI_API_KEY;
const checks = [
  ['lint', 'eslint/bin/eslint.js', '.', '--max-warnings', '0'],
  ['typecheck', 'typescript/bin/tsc', '--noEmit'],
  ['test', 'vitest/vitest.mjs', 'run']
];

for (const [name, modulePath, ...args] of checks) {
  process.stdout.write(`\nContractRelay phase gate: ${name}\n`);
  const result = spawnSync(process.execPath, [join(root, 'node_modules', modulePath), ...args],
    { cwd: root, stdio: 'inherit', env: environment, windowsHide: true });
  if (result.error || result.status !== 0) { process.exitCode = result.status ?? 1; break; }
}
