import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashJson } from '@contractrelay/contracts';

/** Final resume must not silently mix changed runtime/gates/dependencies in one run. */
export async function executionFingerprint(): Promise<string> {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const files: Record<string, string> = {};
  const walk = async (path: string): Promise<void> => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const target = join(path, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (entry.isFile() && /\.(?:ts|mjs|json)$/.test(entry.name)) files[relative(root, target).replace(/\\/g, '/')] =
        hashJson((await readFile(target, 'utf8')).replace(/\r\n/g, '\n'));
    }
  };
  for (const entry of await readdir(join(root, 'packages'), { withFileTypes: true })) if (entry.isDirectory()) await walk(join(root, 'packages', entry.name, 'src'));
  for (const name of ['pnpm-lock.yaml', 'scripts/benchmark.ts', 'config/models.json', 'config/sandbox.json']) {
    files[name] = hashJson((await readFile(join(root, name), 'utf8')).replace(/\r\n/g, '\n'));
  }
  return hashJson({ files, node: process.version, platform: process.platform, architecture: process.arch });
}
