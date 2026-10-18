import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const baselinePath = fileURLToPath(new URL('../data/protected-before.json', import.meta.url));
const portablePath = fileURLToPath(new URL('../data/protected-portable.json', import.meta.url));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const before = JSON.parse(await readFile(baselinePath, 'utf8'));
const originalPortable = JSON.parse(await readFile(portablePath, 'utf8'));
const editorial = JSON.parse(await readFile(resolve(root, 'docs/editorial-changes.json'), 'utf8'));
const allowedEditorialPaths = new Set(['prd.md', 'benchmarks/realworld-v1/REPORT.md', 'benchmarks/realworld-v1/flagship-integrity.json']);
assert.equal(editorial.files.length, allowedEditorialPaths.size);
const changes = new Map();
for (const change of editorial.files) {
  assert(allowedEditorialPaths.delete(change.original_path), 'Unexpected or duplicate editorial exception');
  assert.equal(change.before_raw_sha256, before.files[change.original_path]);
  assert.equal(change.before_lf_sha256, originalPortable.files[change.original_path]);
  assert.equal(change.current_path, change.original_path === 'prd.md' ? 'docs/prd.md' : change.original_path);
  if (change.original_path === 'prd.md') assert.equal(change.before_raw_sha256, change.after_raw_sha256, 'PRD content must stay identical');
  changes.set(change.current_path, change);
}
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
const actualHashes = {};
for (const path of [...paths].sort()) {
  const bytes = await readFile(resolve(root, path));
  const rawHash = digest(bytes);
  const lfHash = digest(bytes.toString('utf8').replaceAll('\r\n', '\n'));
  actualHashes[path] = rawHash;
  const change = changes.get(path);
  if (change) {
    assert.equal(lfHash, change.after_lf_sha256, `EDITORIAL_DRIFT: ${path}`);
    if (process.platform === 'win32') assert.equal(rawHash, change.after_raw_sha256, `EDITORIAL_BYTE_DRIFT: ${path}`);
    if (path.endsWith('flagship-integrity.json'))
      assert.equal(digest(bytes.toString('utf8').replace('"docs/prd.md":', '"prd.md":').replaceAll('\r\n', '\n')), change.before_lf_sha256, 'Only the PRD catalog path may change');
  }
  hashes[change?.original_path ?? path] = change?.before_raw_sha256 ?? rawHash;
  normalized[change?.original_path ?? path] = change?.before_lf_sha256 ?? lfHash;
  if (guard.files[path])
    assert.equal(digest(bytes.toString('utf8').replaceAll('\r\n', '\n')), guard.files[path], path);
}
const sorted = value => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')));
// Match the original catalog's lexical key order after projecting documented moves.
const ordered = value => Object.fromEntries(Object.keys(before.files).map(path => [path, value[path]]));
assert.equal(Object.keys(hashes).length, Object.keys(before.files).length);
const aggregate = digest(JSON.stringify(ordered(hashes)));
const current = { algorithm: 'sha256-raw-bytes', files: ordered(hashes), aggregate };
const portable = { algorithm: 'sha256-utf8-lf', files: ordered(normalized), aggregate: digest(JSON.stringify(ordered(normalized))) };
if (process.argv.includes('--capture-before')) {
  // Exclusive creation prevents silently resetting the baseline during later verification.
  await writeFile(baselinePath, `${JSON.stringify(current, null, 2)}\n`, { flag: 'wx' });
} else {
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
      current_raw_aggregate_sha256: digest(JSON.stringify(sorted(actualHashes))),
      documented_editorial_changes: editorial.files.map(({ original_path, current_path }) => ({ original_path, current_path })),
      final_records: JSON.parse(
        await readFile(resolve(root, 'benchmarks/results/final-v3.json'), 'utf8'),
      ).results.length,
      baseline: relative(root, baselinePath),
      scientific_artifacts_unchanged: true,
    },
    null,
    2,
  ),
);
