import { join } from 'node:path';
import { z } from 'zod';
import { hashJson } from '@contractrelay/contracts';
import { readJson, writeOnceJson } from '@contractrelay/contracts/artifacts';

export const tier1EpochSchema = z.object({
  version: z.literal(1), authorization: z.literal('user-requested-phase5-tier1-upgrade'),
  baseline_commit: z.literal('9cf0753b81d744a85b61551116bc2de9d63e4adc'),
  original_manifest_hash: z.string().regex(/^[a-f0-9]{64}$/),
  previous_fingerprint: z.literal('a5cbfd226835154feaba027062dd0b0e468df10f255770d3cd88cdc5cd538a7d'),
  execution_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  quota: z.object({ model: z.literal('gemini-3.8-flash'), rpm: z.literal(1000), tpm: z.literal(2000000),
    rpdHard: z.literal(10000), rpdSoft: z.literal(10000) }).strict(),
  max_concurrency: z.literal(4), changed_operational_files: z.array(z.string()).min(1),
  created_at: z.string().datetime()
}).strict();

/** An explicit local audit receipt permits only the authorized execution epoch.
 * The original run identity and all trial/job artifacts remain immutable. */
export async function ensureRunIdentity(runRoot: string, identity: Record<string, unknown>, resume: boolean): Promise<void> {
  const path = join(runRoot, 'run-manifest.json');
  let original: Record<string, unknown>;
  try { original = await readJson(path) as Record<string, unknown>; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await writeOnceJson(path, identity); return;
  }
  if (hashJson(original) === hashJson(identity)) return;
  const withoutFingerprint = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'execution_fingerprint'));
  if (!resume || identity.mode !== 'final' || identity.model !== 'gemini-3.8-flash'
    || hashJson(withoutFingerprint(original)) !== hashJson(withoutFingerprint(identity))) throw new Error('RUN_IDENTITY_DRIFT');
  let epoch;
  try { epoch = tier1EpochSchema.parse(await readJson(join(runRoot, 'execution-epochs/tier1-v1.json'))); }
  catch { throw new Error('EXECUTION_EPOCH_REQUIRED'); }
  if (epoch.original_manifest_hash !== hashJson(original) || epoch.previous_fingerprint !== original.execution_fingerprint
    || epoch.execution_fingerprint !== identity.execution_fingerprint) throw new Error('EXECUTION_EPOCH_DRIFT');
}
