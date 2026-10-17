import { mkdir, open, rename, unlink, link, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { canonicalJson } from './index.js';

/** Write and fsync a temporary file before publishing an artifact. */
async function stagedJson(path: string, value: unknown): Promise<string> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.tmp-${randomUUID()}.json`);
  const file = await open(temporary, 'wx');
  try {
    await file.writeFile(`${canonicalJson(value)}\n`, 'utf8');
    await file.sync();
  } finally {
    await file.close();
  }
  return temporary;
}

export async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  const temporary = await stagedJson(path, value);
  try {
    for (let attempt = 0; ; attempt++) {
      try { await rename(temporary, path); break; }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (!['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '') || attempt >= 5) throw error;
        // Windows file scanners can briefly hold an otherwise writable target.
        // Never unlink the old artifact: failed publication must retain its data.
        await new Promise((done) => setTimeout(done, 10 * 2 ** attempt));
      }
    }
  }
  finally { await unlink(temporary).catch(() => undefined); }
}

/** Publish immutable decisions without overwriting a previously frozen decision. */
export async function writeOnceJson(path: string, value: unknown): Promise<void> {
  const temporary = await stagedJson(path, value);
  try {
    await link(temporary, path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST'
      || canonicalJson(JSON.parse(await readFile(path, 'utf8'))) !== canonicalJson(value)) throw error;
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

export async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}
