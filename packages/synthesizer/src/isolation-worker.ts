import { readFile } from 'node:fs/promises';
import { wireWorker } from '@contractrelay/contracts/worker';
import type { ModelJob, QuotaScheduler, ScheduledResult } from './scheduler.js';
import type { AdapterPlan } from '@contractrelay/dsl';
import type { SynthesisEvidence } from './index.js';
import { ScheduledPlanSynthesizer } from './synthesis.js';
import { StructuralPlanSynthesizer } from './structural.js';
import type { StructuralSynthesisSettings } from './structural.js';

wireWorker(async (payload, rpc) => {
  const task = payload as { operation: string; path?: string; evidence?: SynthesisEvidence;
    settings?: StructuralSynthesisSettings };
  if (task.operation === 'probe' && task.path) return readFile(task.path, 'utf8');
  if (task.operation !== 'synthesize' || !task.evidence || !task.settings) throw new Error('Invalid synthesis task');
  const scheduler: Pick<QuotaScheduler, 'run'> = {
    async run<T>(job: ModelJob, parse: (value: unknown) => T, options: { resume?: boolean } = {}) {
      const result = await rpc('schedule', { job, resume: options?.resume ?? false }) as ScheduledResult<AdapterPlan>;
      if (result.status === 'quota_blocked') return result;
      return { ...result, artifact: parse({ candidate: result.artifact }) };
    }
  };
  const Synthesizer = task.settings.capabilities === 'structural-v1' ? StructuralPlanSynthesizer : ScheduledPlanSynthesizer;
  return new Synthesizer(scheduler, task.settings).synthesize(task.evidence);
});
