// Only public presentation inputs are packaged. Never walk the repository or
// include environment files, raw provider interactions, or sealed case partitions.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../../', import.meta.url));

export async function publicArtifacts() {
  const catalog = Object.create(null);
  const add = async path => { catalog[path] = await readFile(resolve(root, path), 'utf8'); };
  for (const path of ['benchmarks/results/final-v3.json', 'benchmarks/manifests/suite-v3.json',
    'apps/inspector/data/historical-catalog.json', 'apps/inspector/data/exports.json',
    'apps/inspector/data/refund-execution.json']) await add(path);
  const suite = JSON.parse(catalog['benchmarks/manifests/suite-v3.json']);
  for (const { id } of suite.cases) {
    assert(/^[a-z0-9-]+$/.test(id));
    for (const name of ['candidate.json', 'gate-report.json', 'observations.json', 'result.json'])
      await add(`apps/inspector/data/controlled/${id}/${name}`);
    for (const name of ['synthesis/evidence.json', 'tasks.json'])
      await add(`benchmarks/cases/${id}/${name}`);
  }
  for (const historicalRoot of JSON.parse(catalog['apps/inspector/data/historical-catalog.json']).roots) {
    assert(/^benchmarks\/realworld-v[1-9][0-9]*$/.test(historicalRoot));
    await add(`${historicalRoot}/results/summary.json`);
    for (const entry of JSON.parse(catalog[`${historicalRoot}/results/summary.json`]).cases) {
      assert(/^[a-z0-9-]+$/.test(entry.project));
      assert(Number.isInteger(entry.trials) && entry.trials > 0 && entry.trials <= 100);
      for (const name of ['old-contract.json', 'new-contract.json', 'provenance.json'])
        await add(`${historicalRoot}/${entry.project}/${name}`);
      for (let trial = 1; trial <= entry.trials; trial++)
        await add(`${historicalRoot}/${entry.project}/results/trial-${String(trial).padStart(3, '0')}.json`);
    }
  }
  return catalog;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const catalog = await publicArtifacts();
  const directory = resolve(root, 'apps/inspector/.generated');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'artifacts.json'), JSON.stringify(catalog));
  console.log(`Packaged ${Object.keys(catalog).length} public inspector artifacts.`);
}
