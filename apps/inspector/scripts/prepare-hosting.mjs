// Build a hosting mirror from the real inspector, with an allowlisted artifact
// catalog replacing filesystem reads. No model/runtime execution is bundled.
import { cp, readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const app = resolve(root, 'apps/inspector');
const target = resolve(root, '.contractrelay/inspector-site');
const manifest = JSON.parse(await readFile(resolve(target, '.openai/hosting.json'), 'utf8'));
assert(manifest.project_id, 'Initialize the Sites starter and persist its identity first.');
for (const name of ['app', 'components', 'src']) {
  const path = resolve(target, name);
  assert(path.startsWith(target + sep));
  await rm(path, { recursive: true, force: true });
}
await cp(resolve(app, 'src'), resolve(target, 'src'), { recursive: true });
await cp(resolve(app, 'src/app'), resolve(target, 'app'), { recursive: true });
await rm(resolve(target, 'src/app'), { recursive: true });
// Vinext's current next/link prefetch fails on Workers. Native anchors preserve
// the existing pages and interactions without changing the local Next.js app.
async function adaptLinks(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await adaptLinks(path);
    else if (/\.tsx?$/.test(entry.name)) {
      const source = await readFile(path, 'utf8');
      const adapted = source.replaceAll("from 'next/link'", "from '@/hosting-link'");
      if (source !== adapted) await writeFile(path, adapted);
    }
  }
}
await adaptLinks(resolve(target, 'app'));
await adaptLinks(resolve(target, 'src'));
await writeFile(resolve(target, 'src/hosting-link.tsx'), `import type { AnchorHTMLAttributes } from 'react';
export default function Link(props: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a {...props} />;
}
`);
await mkdir(resolve(target, 'public'), { recursive: true });
const catalog = {};
const add = async path => { catalog[path] = await readFile(resolve(root, path), 'utf8'); };
for (const path of ['benchmarks/results/final-v3.json', 'benchmarks/manifests/suite-v3.json',
  'apps/inspector/data/historical-catalog.json', 'apps/inspector/data/exports.json', 'apps/inspector/data/refund-execution.json']) await add(path);
const suite = JSON.parse(catalog['benchmarks/manifests/suite-v3.json']);
for (const { id } of suite.cases) {
  assert(/^[a-z0-9-]+$/.test(id));
  for (const name of ['candidate.json', 'gate-report.json', 'observations.json', 'result.json']) await add(`apps/inspector/data/controlled/${id}/${name}`);
  for (const name of ['synthesis/evidence.json', 'tasks.json']) await add(`benchmarks/cases/${id}/${name}`);
}
for (const historicalRoot of JSON.parse(catalog['apps/inspector/data/historical-catalog.json']).roots) {
  assert(/^benchmarks\/realworld-v[1-9][0-9]*$/.test(historicalRoot));
  await add(`${historicalRoot}/results/summary.json`);
for (const entry of JSON.parse(catalog[`${historicalRoot}/results/summary.json`]).cases) {
  assert(/^[a-z0-9-]+$/.test(entry.project));
  for (const name of ['old-contract.json', 'new-contract.json', 'provenance.json']) await add(`${historicalRoot}/${entry.project}/${name}`);
  for (let trial = 1; trial <= entry.trials; trial++) await add(`${historicalRoot}/${entry.project}/results/trial-${String(trial).padStart(3, '0')}.json`);
}
}
await writeFile(resolve(target, 'src/server/artifact-catalog.json'), JSON.stringify(catalog));
let service = await readFile(resolve(app, 'src/server/artifacts.ts'), 'utf8');
service = service.replace("import { readFile } from 'node:fs/promises';\n", '').replace("import { resolve } from 'node:path';\n", '');
const boundary = service.indexOf('// Works from app directory');
assert(boundary > 0);
service = "import catalog from './artifact-catalog.json';\n" + service.slice(0, boundary) + `
export const artifacts = new ArtifactService(async path => {
  const value = (catalog as Record<string, string>)[path];
  if (value === undefined) throw Object.assign(new Error('Missing versioned artifact'), { code: 'ENOENT' });
  return value;
});\n`;
await writeFile(resolve(target, 'src/server/artifacts.ts'), service);
let graphql = await readFile(resolve(app, 'src/server/graphql.ts'), 'utf8');
graphql = graphql.replace("import { readFileSync } from 'node:fs';\n", '').replace("import { resolve } from 'node:path';\n", '');
graphql = graphql.replace(/export const schema = buildSchema\([\s\S]*?\);/, 'export const schema = buildSchema(schemaText);');
graphql = "import schemaText from '../graphql/schema-text.json';\n" + graphql;
await writeFile(resolve(target, 'src/server/graphql.ts'), graphql);
await writeFile(resolve(target, 'src/graphql/schema-text.json'), JSON.stringify(await readFile(resolve(app, 'src/graphql/schema.graphql'), 'utf8')));
const packagePath = resolve(target, 'package.json');
const pkg = JSON.parse(await readFile(packagePath, 'utf8'));
pkg.name = 'contractrelay-inspector-hosting';
pkg.dependencies = { next: '16.3.4', react: '19.2.6', 'react-dom': '19.2.6', graphql: '16.11.0', zod: '4.1.12',
  '@fontsource-variable/dm-sans': '5.3.0', '@fontsource-variable/manrope': '5.3.0', '@graphql-typed-document-node/core': '3.2.0' };
for (const key of ['drizzle-kit', '@tailwindcss/postcss', 'tailwindcss', 'tw-animate-css', 'eslint', 'eslint-config-next']) delete pkg.devDependencies[key];
pkg.scripts.typecheck = 'tsc --noEmit';
await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
await writeFile(resolve(target, 'postcss.config.mjs'), 'export default { plugins: {} };\n');
const tsconfig = JSON.parse(await readFile(resolve(target, 'tsconfig.json'), 'utf8'));
tsconfig.compilerOptions.paths = { '@/*': ['./src/*'] };
tsconfig.include = ['app/**/*.ts', 'app/**/*.tsx', 'src/**/*.ts', 'src/**/*.tsx', 'build/**/*', 'lib/connector-*', 'cloudflare-env.d.ts', 'vite.config.ts'];
await writeFile(resolve(target, 'tsconfig.json'), `${JSON.stringify(tsconfig, null, 2)}\n`);
await writeFile(resolve(target, 'README.md'), '# ContractRelay public inspector\n\nGenerated hosting mirror of the Next.js inspector in https://github.com/sankalp-rajeev/ContractRelay. The same GraphQL schema, resolvers and validated artifact service run on Sites through Vinext. Filesystem reads are replaced with a catalog of public versioned artifacts. No secrets, model calls or tool execution are included.\n');
console.log(`Prepared the existing inspector with ${Object.keys(catalog).length} allowlisted public artifacts.`);
