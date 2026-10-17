import { hashJson } from '../packages/contracts/src/index.js';
import { readJson, writeOnceJson } from '../packages/contracts/src/artifacts.js';

const summary = await readJson('runs/benchmark-v3-dev/full-summary.json');
const usage = await readJson('runs/benchmark-v3-dev/model-usage.json');
const acceptance = await readJson('benchmarks/manifests/development-acceptance-v3.json') as { summary_hash: string; infrastructure_failures: number };
if (hashJson(summary) !== acceptance.summary_hash || acceptance.infrastructure_failures !== 0) throw new Error('DEVELOPMENT_EXPORT_BINDING_FAILED');
await writeOnceJson('benchmarks/results/development-v3.json', { version: 1, kind: 'development-regression-only', final_model_results: false,
  stochastic_trials_per_case: 1, summary, model_usage: usage, acceptance,
  caveats: ['Single-trial controlled development regression; not the final three-trial comparison.',
    'Invalid model artifacts and hidden failures remain in counts.', 'Earlier provider-schema pilots are retained locally and excluded from this revision.'] });
console.log(JSON.stringify({ development_snapshot_saved: true, summary_hash: hashJson(summary) }));
