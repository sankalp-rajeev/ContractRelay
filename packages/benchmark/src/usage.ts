import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { readJson } from '@contractrelay/contracts/artifacts';
import { modelRunSchema } from '@contractrelay/synthesizer';
import type { BaselineId } from './index.js';

/** Count retained attempts, including invalid generated artifacts and partial runs. */
export async function collectModelUsage(directory: string, model: string, mode: 'dev' | 'final', caseIds: string[],
  namespace = mode === 'final' ? 'benchmark-final-v1' : 'benchmark-v2') {
  const totals = () => ({ jobs: 0, requests_reserved: 0, responses_with_usage: 0, input_tokens: 0, output_tokens: 0, attempts_without_usage: 0, cache_hits: 0 });
  const byMethod = Object.fromEntries((['b0', 'b1', 'b2', 'b2v', 'b3'] as BaselineId[]).map((method) => [method, totals()]));
  const modelVersions: Record<string, number> = {};
  const response = z.object({ text: z.string(), inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(), modelVersion: z.string().optional() }).strict();
  const walk = async (path: string): Promise<void> => {
    let entries;
    try { entries = await readdir(path, { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'attempts') await walk(join(path, entry.name));
      else if (entry.isFile() && entry.name === 'run.json') {
        const run = modelRunSchema.parse(await readJson(join(path, entry.name)));
        const [, caseId, method] = run.job_id.split('/');
        if (run.mode !== mode || run.model !== model || !caseIds.includes(caseId ?? '') || !method || !(method in byMethod)) continue;
        const usage = byMethod[method]!; usage.jobs++; usage.requests_reserved += run.attempt_count; usage.cache_hits += Number(run.cache_hit);
        for (let index = 1; index <= run.attempt_count; index++) {
          try {
            const value = response.parse(await readJson(join(path, 'attempts', `attempt-${String(index).padStart(3, '0')}`, 'response.json')));
            usage.responses_with_usage++; usage.input_tokens += value.inputTokens; usage.output_tokens += value.outputTokens;
            const version = value.modelVersion ?? 'unreported'; modelVersions[version] = (modelVersions[version] ?? 0) + 1;
          } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; usage.attempts_without_usage++; }
        }
      }
    }
  };
  await walk(join(directory, namespace));
  return { version: 1, model, mode, by_method: byMethod, resolved_model_versions: modelVersions,
    note: 'Requests are durably reserved before sending; crashes may leave reserved attempts without a response. Unknown token usage is not counted as zero consumption.' };
}
