import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const baselinePath = fileURLToPath(new URL('../data/protected-before.json', import.meta.url));
const portablePath = fileURLToPath(new URL('../data/protected-portable.json', import.meta.url));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const guard = JSON.parse(
  await readFile(resolve(root, 'benchmarks/realworld-v1/flagship-integrity.json'), 'utf8'),
);
const paths = new Set(Object.keys(guard.files));
// Include every existing frozen/result artifact and core fixture, beyond the original guard.
async function walk(dir) {
  for (const entry of await readdir(resolve(root, dir), { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await walk(path);
    else paths.add(path);
  }
}
await walk('benchmarks');
await walk('fixtures');
const hashes = {};
const normalized = {};
for (const path of [...paths].sort()) {
  const bytes = await readFile(resolve(root, path));
  hashes[path] = digest(bytes);
  normalized[path] = digest(bytes.toString('utf8').replaceAll('\r\n', '\n'));
  if (guard.files[path])
    assert.equal(digest(bytes.toString('utf8').replaceAll('\r\n', '\n')), guard.files[path], path);
}
const aggregate = digest(JSON.stringify(hashes));
const current = { algorithm: 'sha256-raw-bytes', files: hashes, aggregate };
const portable = { algorithm: 'sha256-utf8-lf', files: normalized, aggregate: digest(JSON.stringify(normalized)) };
if (process.argv.includes('--capture-before')) {
  // Exclusive creation prevents silently resetting the baseline during later verification.
  await writeFile(baselinePath, `${JSON.stringify(current, null, 2)}\n`, { flag: 'wx' });
} else {
  const before = JSON.parse(await readFile(baselinePath, 'utf8'));
  // Raw-byte baseline records the original Windows workspace. Git checks out LF
  // on other platforms; the separate canonical receipt makes CI portable.
  if (process.platform === 'win32' || process.argv.includes('--capture-portable'))
    assert.deepEqual(current, before, 'Protected artifact bytes or file set changed');
  if (process.argv.includes('--capture-portable'))
    await writeFile(portablePath, `${JSON.stringify(portable, null, 2)}\n`, { flag: 'wx' });
  else assert.deepEqual(portable, JSON.parse(await readFile(portablePath, 'utf8')), 'Protected content or file set changed');
}
console.log(
  JSON.stringify(
    {
      protected_files: paths.size,
      original_guard_files: Object.keys(guard.files).length,
      aggregate_sha256: aggregate,
      normalized_aggregate_sha256: portable.aggregate,
      final_records: JSON.parse(
        await readFile(resolve(root, 'benchmarks/results/final-v3.json'), 'utf8'),
      ).results.length,
      baseline: relative(root, baselinePath),
      unchanged: !process.argv.includes('--capture-before'),
    },
    null,
    2,
  ),
);
