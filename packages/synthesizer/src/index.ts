import { z } from 'zod';
import { toolContractSchema } from '@contractrelay/contracts';
import type { ToolContract } from '@contractrelay/contracts';
import type { AdapterPlan } from '@contractrelay/dsl';

/** Explicit synthesis-only input. Never pass a case directory or sealed evidence. */
export interface SynthesisEvidence {
  dataClass: 'public' | 'controlled-synthetic';
  oldContract: ToolContract;
  newContracts: readonly ToolContract[];
  documents: readonly { id: string; text: string }[];
}

export const synthesisEvidenceSchema = z.object({
  dataClass: z.enum(['public', 'controlled-synthetic']), oldContract: toolContractSchema,
  newContracts: z.array(toolContractSchema).min(1).max(50),
  documents: z.array(z.object({ id: z.string().min(1), text: z.string().max(100_000) }).strict()).max(100)
}).strict();

/** Provider implementations must use the shared persistent quota scheduler. */
export interface PlanSynthesizer {
  synthesize(evidence: SynthesisEvidence): Promise<AdapterPlan>;
}

export { GeminiProvider, ModelRequestError, retryAfterMilliseconds } from './model.js';
export type { ModelProvider, ModelRequest, ModelResponse } from './model.js';
export { loadModelConfig } from './config.js';
export type { ModelBudget, ModelConfig } from './config.js';
export { QuotaScheduler, quotaDay, modelRunSchema } from './scheduler.js';
export type { ModelJob, ScheduledResult, SchedulerClock } from './scheduler.js';
export { ScheduledPlanSynthesizer } from './synthesis.js';
