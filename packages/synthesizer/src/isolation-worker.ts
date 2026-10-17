import { readFile } from 'node:fs/promises';
import { wireWorker } from '@contractrelay/contracts/worker';
import type { ModelJob, QuotaScheduler, ScheduledResult } from './scheduler.js';
import type { AdapterPlan } from '@contractrelay/dsl';
import type { SynthesisEvidence } from './index.js';
import { ScheduledPlanSynthesizer } from './synthesis.js';

wireWorker(async (payload, rpc) => {
  const task = payload as { operation: string; path?: string; evidence?: SynthesisEvidence;
    settings?: ConstructorParameters<typeof ScheduledPlanSynthesizer>[1] };
  if (task.operation === 'probe' && task.path) return readFile(task.path, 'utf8');
  if (task.operation !== 'synthesize' || !task.evidence || !task.settings) throw new Error('Invalid synthesis task');
  const scheduler: Pick<QuotaScheduler, 'run'> = {
    async run<T>(job: ModelJob, parse: (value: unknown) => T, options: { resume?: boolean } = {}) {
      const result = await rpc('schedule', { job, resume: options?.resume ?? false }) as ScheduledResult<AdapterPlan>;
      if (result.status === 'quota_blocked') return result;
      return { ...result, artifact: parse({ candidate: result.artifact }) };
    }
  };
  return new ScheduledPlanSynthesizer(scheduler, task.settings).synthesize(task.evidence);
});
