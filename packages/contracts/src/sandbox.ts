import { spawn } from 'node:child_process';
import { link, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { createHash, randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import { jsonValueSchema } from './index.js';

const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
const compiled = new Map<string, Promise<string>>();

async function bundle(entry: string): Promise<string> {
  const source = resolve(entry);
  const rel = relative(join(projectRoot, 'packages'), source);
  if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error('Worker entry must be trusted package source');
  let pending = compiled.get(source);
  if (!pending) {
    pending = (async () => {
      const result = await build({ entryPoints: [source], bundle: true, platform: 'node', format: 'cjs', target: 'node22',
        write: false, logLevel: 'silent' });
      const contents = result.outputFiles[0]?.contents;
      if (!contents) throw new Error('Worker bundle is empty');
      const digest = createHash('sha256').update(contents).digest('hex');
      const output = join(projectRoot, '.contractrelay', 'workers', `${digest}.cjs`);
      await mkdir(dirname(output), { recursive: true });
      const temporary = `${output}.${randomUUID()}.tmp`;
      await writeFile(temporary, contents, { flag: 'wx' });
      try { await link(temporary, output); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST'
          || createHash('sha256').update(await readFile(output)).digest('hex') !== digest) throw error;
      } finally { await unlink(temporary).catch(() => undefined); }
      return output;
    })();
    compiled.set(source, pending);
  }
  return pending;
}

/** Permission boundary for actual synthesis/verifier code, not just its file loader. */
export async function runIsolatedTask(entry: string, payload: unknown,
  onRequest: (method: string, payload: unknown) => Promise<unknown>): Promise<unknown> {
  const worker = await bundle(entry);
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, ['--experimental-permission', `--allow-fs-read=${worker}`, worker],
      { stdio: ['pipe', 'pipe', 'pipe'], env: {}, windowsHide: true });
    const lines = createInterface({ input: child.stdout });
    let settled = false;
    let messages = 0;
    const settle = (error: Error | undefined, value?: unknown) => {
      if (settled) return;
      settled = true; clearTimeout(timer); lines.close(); child.stdin.end();
      if (error) { child.kill(); reject(error); } else resolveResult(value);
    };
    const timer = setTimeout(() => settle(new Error('ISOLATED_WORKER_TIMEOUT')), 120_000);
    child.stderr.resume();
    child.stdin.on('error', () => { if (!settled) settle(new Error('ISOLATED_WORKER_PIPE_FAILED')); });
    child.on('error', (error) => settle(error));
    child.on('close', () => { if (!settled) settle(new Error('ISOLATED_WORKER_EXITED')); });
    lines.on('line', (line) => {
      if (line.length > 8_000_000 || ++messages > 20_000) return settle(new Error('ISOLATED_WORKER_LIMIT'));
      try {
        const message = JSON.parse(line) as { type: string; id?: number; method?: string; payload?: unknown; value?: unknown; code?: string };
        if (message.type === 'result') settle(undefined, jsonValueSchema.parse(message.value));
        else if (message.type === 'error') settle(new Error(message.code ?? 'ISOLATED_WORKER_FAILED'));
        else if (message.type === 'request' && typeof message.id === 'number' && typeof message.method === 'string') {
          void onRequest(message.method, jsonValueSchema.parse(message.payload)).then((value) => {
            if (!settled) child.stdin.write(`${JSON.stringify({ type: 'response', id: message.id, ok: true, payload: jsonValueSchema.parse(value) })}\n`);
          }).catch((error: unknown) => {
            const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
              && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code) ? error.code : 'RPC_FAILED';
            if (!settled) child.stdin.write(`${JSON.stringify({ type: 'response', id: message.id, ok: false, error: code })}\n`);
          });
        } else settle(new Error('INVALID_WORKER_MESSAGE'));
      } catch { settle(new Error('INVALID_WORKER_MESSAGE')); }
    });
    child.stdin.write(`${JSON.stringify({ type: 'start', payload: jsonValueSchema.parse(payload) })}\n`);
  });
}
