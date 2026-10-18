import { z } from 'zod';
import { readJson } from '@contractrelay/contracts/artifacts';
import { fileURLToPath } from 'node:url';

const budgetSchema = z.object({ model: z.string().min(1), rpm: z.number().int().positive(), tpm: z.number().int().positive(),
  rpdHard: z.number().int().positive(), rpdSoft: z.number().int().positive() })
  .refine((value) => value.rpdSoft <= value.rpdHard, 'Soft quota cannot exceed hard quota');
export type ModelBudget = z.infer<typeof budgetSchema>;
export interface ModelConfig { mode: 'dev' | 'final'; budget: ModelBudget; cache: boolean; maxConcurrency: number }

export async function loadModelConfig(environment: NodeJS.ProcessEnv = process.env): Promise<ModelConfig> {
  const raw = z.object({ maxConcurrency: z.number().int().min(1).max(5), modes: z.object({ dev: budgetSchema, final: budgetSchema }) })
    .parse(await readJson(fileURLToPath(new URL('../../../config/models.json', import.meta.url))));
  const mode = z.enum(['dev', 'final']).parse(environment.CONTRACTRELAY_MODEL_MODE ?? 'dev');
  const prefix = mode === 'dev' ? 'CONTRACTRELAY_DEV' : 'CONTRACTRELAY_FINAL';
  const configured = raw.modes[mode];
  const integer = (suffix: string, fallback: number) => environment[`${prefix}_${suffix}`] === undefined
    ? fallback : Number(environment[`${prefix}_${suffix}`]);
  const budget = budgetSchema.parse({ model: environment[`${prefix}_MODEL`] ?? configured.model,
    rpm: integer('RPM', configured.rpm), tpm: integer('TPM', configured.tpm),
    rpdHard: integer('RPD_HARD', configured.rpdHard), rpdSoft: integer('RPD_SOFT', configured.rpdSoft) });
  const maxConcurrency = Number(environment.CONTRACTRELAY_MAX_CONCURRENCY ?? (mode === 'final' ? raw.maxConcurrency : 1));
  if (!Number.isSafeInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 5) throw new Error('Concurrency must be an integer from 1 to 5');
  if (mode === 'final' && (budget.rpm > 1000 || budget.tpm > 2000000 || budget.rpdHard > 10000)) throw new Error('Final quota exceeds the user-authorized Tier 1 limits');
  const cacheMode = z.enum(['off', 'dev']).parse(environment.CONTRACTRELAY_CACHE_MODE ?? 'off');
  return { mode, budget, cache: mode === 'dev' && cacheMode === 'dev', maxConcurrency };
}
