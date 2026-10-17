import { z } from 'zod';
import { readJson } from '@contractrelay/contracts/artifacts';
import { fileURLToPath } from 'node:url';

const budgetSchema = z.object({ model: z.string().min(1), rpm: z.number().int().positive(), tpm: z.number().int().positive(),
  rpdHard: z.number().int().positive(), rpdSoft: z.number().int().positive() })
  .refine((value) => value.rpdSoft <= value.rpdHard, 'Soft quota cannot exceed hard quota');
export type ModelBudget = z.infer<typeof budgetSchema>;
export interface ModelConfig { mode: 'dev' | 'final'; budget: ModelBudget; cache: boolean; maxConcurrency: 1 }

export async function loadModelConfig(environment: NodeJS.ProcessEnv = process.env): Promise<ModelConfig> {
  const raw = z.object({ modes: z.object({ dev: budgetSchema, final: budgetSchema }) })
    .parse(await readJson(fileURLToPath(new URL('../../../config/models.json', import.meta.url))));
  const mode = z.enum(['dev', 'final']).parse(environment.CONTRACTRELAY_MODEL_MODE ?? 'dev');
  const prefix = mode === 'dev' ? 'CONTRACTRELAY_DEV' : 'CONTRACTRELAY_FINAL';
  const configured = raw.modes[mode];
  const integer = (suffix: string, fallback: number) => environment[`${prefix}_${suffix}`] === undefined
    ? fallback : Number(environment[`${prefix}_${suffix}`]);
  const budget = budgetSchema.parse({ model: environment[`${prefix}_MODEL`] ?? configured.model,
    rpm: integer('RPM', configured.rpm), tpm: integer('TPM', configured.tpm),
    rpdHard: integer('RPD_HARD', configured.rpdHard), rpdSoft: integer('RPD_SOFT', configured.rpdSoft) });
  const maxConcurrency = Number(environment.CONTRACTRELAY_MAX_CONCURRENCY ?? 1);
  if (maxConcurrency !== 1) throw new Error('The persistent scheduler currently requires concurrency 1');
  const cacheMode = z.enum(['off', 'dev']).parse(environment.CONTRACTRELAY_CACHE_MODE ?? 'off');
  return { mode, budget, cache: mode === 'dev' && cacheMode === 'dev', maxConcurrency: 1 };
}
