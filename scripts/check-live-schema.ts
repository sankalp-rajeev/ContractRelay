import { readJson } from '../packages/contracts/src/artifacts.js';
import { canonicalJson } from '../packages/contracts/src/index.js';
import { GeminiProvider, loadModelConfig, QuotaScheduler, synthesisEvidenceSchema } from '../packages/synthesizer/src/index.js';
import { createPlanResponseJsonSchema } from '../packages/synthesizer/src/synthesis.js';

const config = await loadModelConfig();
if (config.mode !== 'dev') throw new Error('DEVELOPMENT_SCHEMA_CHECK_ONLY');
const scheduler = new QuotaScheduler('runs/development', new GeminiProvider(process.env.GEMINI_API_KEY ?? ''), config.budget, { retainFailed: true });
for (const id of ['03-weather-default', '07-input-enum']) {
  const evidence = synthesisEvidenceSchema.parse(await readJson(`benchmarks/cases/${id}/synthesis/evidence.json`));
  const result = await scheduler.run({ id: `schema-acceptance-v6/${id}`, mode: 'dev', request: { model: config.budget.model,
    prompt: `Return a migration candidate or explicit rejection based only on these contracts/docs. ${canonicalJson(evidence)}`,
    schema: createPlanResponseJsonSchema(evidence), maxOutputTokens: 4096, temperature: 0.2 } }, (value) => value, { resume: true });
  if (result.status !== 'completed') throw new Error('SCHEMA_CHECK_QUOTA_BLOCKED');
  console.log(JSON.stringify({ case: id, structured_schema_accepted: true, note: 'Provider serving acceptance only; no promotion or benchmark score' }));
}
