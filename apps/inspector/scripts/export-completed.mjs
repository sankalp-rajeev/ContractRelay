// Presentation-only export of previously completed trial 1 artifacts. No execution or model calls.
import { readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const data = fileURLToPath(new URL('../data/', import.meta.url));
const suite = JSON.parse(
  await readFile(resolve(root, 'benchmarks/manifests/suite-v3.json'), 'utf8'),
);
const manifest = {
  kind: 'byte-identical-completed-artifact-exports',
  selection: 'B3 trial 1 for every frozen suite-v3 case; no new evaluation',
  files: {},
};
for (const entry of suite.cases) {
  await mkdir(resolve(data, 'controlled', entry.id), { recursive: true });
  for (const name of ['candidate.json', 'gate-report.json', 'observations.json', 'result.json']) {
    const source = `runs/benchmark-v3-final-recovery/${entry.id}/b3/trial-001/${name}`;
    const target = `controlled/${entry.id}/${name}`;
    const bytes = await readFile(resolve(root, source));
    await copyFile(resolve(root, source), resolve(data, target));
    manifest.files[target] = { source, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
}
await writeFile(resolve(data, 'exports.json'), `${JSON.stringify(manifest, null, 2)}\n`, {
  flag: 'wx',
});
console.log(`Exported ${Object.keys(manifest.files).length} completed files without execution.`);
