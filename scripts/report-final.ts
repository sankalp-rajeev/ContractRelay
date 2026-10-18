import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashJson } from '../packages/contracts/src/index.js';
import { readJson, atomicWriteJson } from '../packages/contracts/src/artifacts.js';
import { summarize, trialResultSchema } from '../packages/benchmark/src/metrics.js';

// Regenerate measured counts from the versioned records without a key or model calls.
const root = fileURLToPath(new URL('../', import.meta.url));
const snapshot = await readJson(join(root, 'benchmarks/results/final-v3.json')) as {
  final_model_results: boolean; results: unknown[]; summary: Record<string, unknown> };
if (snapshot.final_model_results !== true || !Array.isArray(snapshot.results) || snapshot.results.length !== 195) throw new Error('INVALID_FINAL_SNAPSHOT');
const counts = summarize(snapshot.results.map((result) => trialResultSchema.parse(result)));
for (const [key, value] of Object.entries(counts)) {
  if (hashJson(value) !== hashJson(snapshot.summary[key])) throw new Error('FINAL_SUMMARY_DRIFT');
}
const path = join(root, 'reports/final-summary.json');
await atomicWriteJson(path, { ...snapshot.summary, ...counts });
process.stdout.write(`${JSON.stringify({ records: snapshot.results.length, model_calls: 0, summary_path: path })}\n`);
