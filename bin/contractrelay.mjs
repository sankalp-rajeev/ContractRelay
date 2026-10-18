#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';

const child = spawn(process.execPath, [
  '--experimental-sqlite', '--import', new URL('../node_modules/tsx/dist/loader.mjs', import.meta.url).href,
  fileURLToPath(new URL('../packages/cli/product.ts', import.meta.url)), ...process.argv.slice(2),
], { stdio: 'inherit', windowsHide: true });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
child.once('error', () => { process.stderr.write('Cannot start ContractRelay. Run pnpm install --frozen-lockfile first.\n'); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
