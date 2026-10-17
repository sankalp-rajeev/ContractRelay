import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { hashJson, jsonValueSchema } from '@contractrelay/contracts';
import { runIsolatedTask } from '@contractrelay/contracts/sandbox';
import { adapterPlanSchema } from '@contractrelay/dsl';
import type { AdapterPlan } from '@contractrelay/dsl';
import { synthesisEvidenceSchema } from './index.js';
import type { SynthesisEvidence } from './index.js';
import type { QuotaScheduler } from './scheduler.js';
import type { ScheduledPlanSynthesizer } from './synthesis.js';
import { parseSynthesisCandidate, planResponseJsonSchema } from './synthesis.js';

export async function synthesizeIsolated(scheduler: QuotaScheduler, value: SynthesisEvidence,
  options: ConstructorParameters<typeof ScheduledPlanSynthesizer>[1]): Promise<AdapterPlan> {
  const evidence = synthesisEvidenceSchema.parse(value);
  const settings = { ...options, resume: options.resume ?? false, temperature: options.temperature ?? 0.2 };
  let scheduled = false;
  const result = await runIsolatedTask(fileURLToPath(new URL('./isolation-worker.ts', import.meta.url)),
    { operation: 'synthesize', evidence, settings }, async (method, payload) => {
      if (method !== 'schedule' || scheduled) throw new Error('Unsupported synthesis capability');
      scheduled = true;
      const request = z.object({ resume: z.boolean(), job: z.object({ id: z.literal(settings.jobId), mode: z.literal(settings.mode),
        request: z.object({ model: z.literal(settings.model), prompt: z.string().max(1_000_000), schema: jsonValueSchema,
          maxOutputTokens: z.literal(4096), temperature: z.number().min(0).max(2) }).strict() }).strict() }).strict().parse(payload);
      if (hashJson(request.job.request.schema) !== hashJson(planResponseJsonSchema)) throw new Error('Unexpected output schema');
      return scheduler.run(request.job, (response) => parseSynthesisCandidate(response, evidence), { resume: request.resume });
    });
  return adapterPlanSchema.parse(result);
}
