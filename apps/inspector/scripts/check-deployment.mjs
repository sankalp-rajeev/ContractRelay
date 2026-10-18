// Check the files Vercel actually receives, rather than relying on a local server
// that can still reach the original checkout.
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const app = fileURLToPath(new URL('../', import.meta.url));
for (const route of ['page', 'real-world/page', 'benchmarks/page', 'migrations/[id]/page', 'api/graphql/route']) {
  const tracePath = resolve(app, `.next/server/app/${route}.js.nft.json`);
  const trace = JSON.parse(await readFile(tracePath, 'utf8'));
  const files = new Set(trace.files.map(path => resolve(dirname(tracePath), path)));
  for (const required of ['.generated/artifacts.json', 'src/graphql/schema.graphql']) {
    assert(files.has(resolve(app, required)), `${route} deployment is missing ${required}`);
  }
}
console.log('All five data routes include the public artifact bundle and GraphQL schema.');
