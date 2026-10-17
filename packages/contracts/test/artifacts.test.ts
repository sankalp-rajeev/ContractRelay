import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rename, rm } from 'node:fs/promises';
import type * as FileSystem from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atomicWriteJson, readJson, writeOnceJson } from '../src/artifacts.js';

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof FileSystem>();
  return { ...actual, rename: vi.fn(actual.rename) };
});
const directories: string[] = [];
afterEach(async () => { vi.mocked(rename).mockClear(); await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

describe('artifact publication under filesystem contention', () => {
  it('publishes after a transient sharing violation', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contractrelay-atomic-'));
    directories.push(dir);
    const path = join(dir, 'artifact.json');
    await atomicWriteJson(path, { version: 1 });
    vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error('Sharing violation'), { code: 'EPERM' }));
    await atomicWriteJson(path, { version: 2 });
    expect(await readJson(path)).toEqual({ version: 2 });
  });

  it('preserves the previous artifact when bounded replacement retries fail', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contractrelay-atomic-failure-'));
    directories.push(dir);
    const path = join(dir, 'artifact.json');
    await atomicWriteJson(path, { preserved: true });
    for (let index = 0; index < 10; index++) vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error('Sharing violation'), { code: 'EPERM' }));
    await expect(atomicWriteJson(path, { preserved: false })).rejects.toThrow('Sharing violation');
    expect(await readJson(path)).toEqual({ preserved: true });
  });

  it('does not replace an immutable decision with a conflicting value', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'contractrelay-immutable-'));
    directories.push(dir);
    const path = join(dir, 'decision.json');
    await writeOnceJson(path, { verdict: 'REJECTED' });
    await writeOnceJson(path, { verdict: 'REJECTED' });
    await expect(writeOnceJson(path, { verdict: 'PROMOTED' })).rejects.toThrow();
    expect(await readJson(path)).toEqual({ verdict: 'REJECTED' });
  });
});
