import { it, expect } from 'vitest';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hashJson } from '@contractrelay/contracts';
import { createPlanResponseJsonSchema, ScheduledPlanSynthesizer, synthesisPromptVersion } from '../src/synthesis.js';
import { parseStructuralCandidate } from '../src/structural.js';
import { QuotaScheduler } from '../src/scheduler.js';
import { synthesizeIsolated } from '../src/isolated.js';
import type { SynthesisEvidence } from '../src/index.js';
import type { AdapterPlan } from '@contractrelay/dsl';
import baseline from './legacy-v6-hashes.json' with { type: 'json' };
import { oldContract, newContract, plan } from '../../compiler/test/structural.fixture.js';

it('keeps the frozen v6 prompt and provider schema exactly equal to the pre-extension implementation', async () => {
  expect(synthesisPromptVersion).toBe(baseline.version);
  for (const [id, expected] of Object.entries(baseline.entries)) {
    const evidence = JSON.parse(await readFile(`benchmarks/realworld-v3/${id}/synthesis-evidence/evidence.json`, 'utf8')) as SynthesisEvidence;
    expect(hashJson(createPlanResponseJsonSchema(evidence))).toBe(expected.schema_hash);
    let prompt = '';
    const scheduler = { run: async () => ({ status: 'quota_blocked' as const, artifact: null, skipped: false as const, cacheHit: false as const }) };
    const synth = new ScheduledPlanSynthesizer({ ...scheduler, run: async (...args) => { prompt = args[0].request.prompt; return scheduler.run(); } }, { jobId: 'baseline', model: 'baseline', mode: 'dev' });
    await expect(synth.synthesize(evidence)).rejects.toThrow('QUOTA_BLOCKED');
    expect(hashJson(prompt)).toBe(expected.prompt_hash);
  }
});

it('decodes bounded structural wire data through the isolated synthesis boundary and rejects duplicate fields', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'structural-synthesis-'));
  try {
    const evidence: SynthesisEvidence = { dataClass: 'controlled-synthetic', oldContract, newContracts: [newContract], documents: [{ id: 'structural-doc', text: 'Generic structural migration fixture' }] };
    if ('op' in plan) throw new Error('Expected translation fixture');
    const construction = plan.response[0]; if (construction?.op !== 'ConstructResponse') throw new Error('Expected construction');
    const fields = Object.entries(construction.fields).map(([name, binding]) => ({ name, binding }));
    const wire = { candidate: { ...plan, response: [{ ...construction, fields }] } };
    let prompt = '';
    const scheduler = new QuotaScheduler(directory, { generate: async request => { prompt = request.prompt; return { text: JSON.stringify(wire), inputTokens: 10, outputTokens: 10 }; } },
      { model: 'api-free-structural', rpm: 100, tpm: 100_000, rpdHard: 100, rpdSoft: 100 }, { cache: false });
    const candidate: AdapterPlan = await synthesizeIsolated(scheduler, evidence, { jobId: 'structural-test', model: 'api-free-structural', mode: 'dev', capabilities: 'structural-v1' });
    expect(candidate).toEqual(plan); expect(prompt).toContain('bounded structural extension v1');
    expect(() => parseStructuralCandidate({ candidate: { ...plan, response: [{ ...construction, fields: [fields[0], fields[0]] }] } }, evidence)).toThrow();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
