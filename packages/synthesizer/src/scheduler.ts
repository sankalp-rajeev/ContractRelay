import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { lock } from 'proper-lockfile';
import { z } from 'zod';
import { canonicalJson, hashJson } from '@contractrelay/contracts';
import { atomicWriteJson, readJson, writeOnceJson } from '@contractrelay/contracts/artifacts';
import { ModelRequestError, normalizeModelError } from './model.js';
import type { ModelProvider, ModelRequest, ModelResponse } from './model.js';
import type { ModelBudget } from './config.js';

export interface SchedulerClock { now(): number; sleep(milliseconds: number): Promise<void> }
const wallClock: SchedulerClock = { now: () => Date.now(), sleep: (ms) => new Promise((done) => setTimeout(done, ms)) };
const responseSchema = z.object({ text: z.string(), inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() }).strict();
const ledgerSchema = z.object({ version: z.literal(1), model: z.string(), day: z.string(), requests: z.number().int().nonnegative(),
  blocked: z.boolean(), window: z.array(z.object({ at: z.number(), tokens: z.number().int().nonnegative() }).strict()) }).strict();
type Ledger = z.infer<typeof ledgerSchema>;
export const modelRunSchema = z.object({
  version: z.literal(1), status: z.enum(['pending', 'running', 'completed', 'failed', 'quota_blocked']),
  provider: z.literal('google'), model: z.string(), mode: z.enum(['dev', 'final']), job_id: z.string(), request_hash: z.string(),
  started_at: z.string(), completed_at: z.string().nullable(), request_index_for_model_day: z.number().int().nonnegative(),
  prompt_hash: z.string(), response_hash: z.string().nullable(), artifact_hash: z.string().nullable(),
  input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative(), retry_count: z.number().int().nonnegative(),
  attempt_count: z.number().int().nonnegative(),
  error_code: z.string().nullable(), cache_hit: z.boolean(), attempts: z.array(z.object({ at: z.string(), code: z.string() }).strict())
}).strict();
export type ModelRun = z.infer<typeof modelRunSchema>;
export interface ModelJob { id: string; mode: 'dev' | 'final'; request: ModelRequest }
export type ScheduledResult<T> = { status: 'completed'; artifact: T; skipped: boolean; cacheHit: boolean }
  | { status: 'quota_blocked'; artifact: null; skipped: false; cacheHit: false };

export function quotaDay(milliseconds: number): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(milliseconds));
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export class QuotaScheduler {
  private readonly root: string;
  private readonly clock: SchedulerClock;
  private chain: Promise<void> = Promise.resolve();
  constructor(directory: string, private readonly provider: ModelProvider, private readonly budget: ModelBudget,
    private readonly options: { cache?: boolean; maxRetries?: number; clock?: SchedulerClock } = {}) {
    this.root = resolve(directory);
    this.clock = options.clock ?? wallClock;
    if (![budget.rpm, budget.tpm, budget.rpdHard, budget.rpdSoft].every((n) => Number.isSafeInteger(n) && n > 0)
      || budget.rpdSoft > budget.rpdHard || !Number.isSafeInteger(options.maxRetries ?? 2) || (options.maxRetries ?? 2) < 0) {
      throw new Error('Invalid model budget/retry policy');
    }
  }

  /** Serialize in-process and lock across processes; final jobs never use response caching. */
  async run<T>(job: ModelJob, parse: (value: unknown) => T, options: { resume?: boolean } = {}): Promise<ScheduledResult<T>> {
    let releaseQueue!: () => void;
    const previous = this.chain;
    this.chain = new Promise<void>((done) => { releaseQueue = done; });
    await previous;
    try {
      await mkdir(this.root, { recursive: true });
      const release = await lock(this.root, { realpath: true, retries: 0, stale: 30_000, update: 10_000 });
      try { return await this.runLocked(job, parse, options); }
      finally { await release(); }
    } finally { releaseQueue(); }
  }

  private async ledger(): Promise<Ledger> {
    const path = join(this.root, `quota-${hashJson(this.budget.model)}.json`);
    const day = quotaDay(this.clock.now());
    try {
      const saved = ledgerSchema.parse(await readJson(path));
      if (saved.model !== this.budget.model) throw new Error('Quota ledger model mismatch');
      if (saved.day === day) return saved;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    return { version: 1, model: this.budget.model, day, requests: 0, window: [], blocked: false };
  }

  private async saveLedger(ledger: Ledger): Promise<void> {
    await atomicWriteJson(join(this.root, `quota-${hashJson(this.budget.model)}.json`), ledger);
  }

  private async reserve(tokens: number): Promise<number | null> {
    if (tokens > this.budget.tpm) throw new ModelRequestError('REQUEST_EXCEEDS_TPM');
    for (;;) {
      const ledger = await this.ledger();
      if (ledger.blocked || ledger.requests >= this.budget.rpdSoft) return null;
      const now = this.clock.now();
      ledger.window = ledger.window.filter((entry) => entry.at > now - 60_000);
      if (ledger.window.length >= this.budget.rpm || ledger.window.reduce((sum, entry) => sum + entry.tokens, 0) + tokens > this.budget.tpm) {
        const first = ledger.window[0];
        if (!first) throw new Error('Invalid token reservation');
        await this.clock.sleep(Math.min(50_000, Math.max(1, first.at + 60_001 - now)));
        continue;
      }
      ledger.requests++;
      ledger.window.push({ at: now, tokens });
      await this.saveLedger(ledger); // Reserve durably BEFORE sending a request.
      return ledger.requests;
    }
  }

  private async runLocked<T>(job: ModelJob, parse: (value: unknown) => T, options: { resume?: boolean }): Promise<ScheduledResult<T>> {
    if (!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(job.id)) throw new Error('Invalid job ID');
    if (job.request.model !== this.budget.model) throw new Error('Job model is outside the configured budget');
    if (!Number.isSafeInteger(job.request.maxOutputTokens) || job.request.maxOutputTokens < 1
      || !Number.isFinite(job.request.temperature) || job.request.temperature < 0 || job.request.temperature > 2) throw new Error('Invalid generation parameters');
    const dir = join(this.root, ...job.id.split('/'));
    const requestHash = hashJson(job);
    const requestPath = join(dir, 'request.json');
    const runPath = join(dir, 'run.json');
    await writeOnceJson(requestPath, job);
    let existing: ModelRun | undefined;
    try { existing = modelRunSchema.parse(await readJson(runPath)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (existing && (existing.request_hash !== requestHash || existing.job_id !== job.id || existing.model !== job.request.model || existing.mode !== job.mode)) {
      throw new ModelRequestError('RUN_IDENTITY_MISMATCH');
    }
    if (existing?.status === 'completed') {
      if (!options.resume) throw new ModelRequestError('COMPLETED_TRIAL_EXISTS_USE_RESUME');
      const response = responseSchema.parse(await readJson(join(dir, 'response.json')));
      const artifact = await readJson(join(dir, 'artifact.json'));
      if (hashJson(response) !== existing.response_hash || hashJson(artifact) !== existing.artifact_hash) throw new ModelRequestError('RUN_INTEGRITY_FAILED');
      const reparsed = parse(JSON.parse(response.text));
      if (canonicalJson(reparsed) !== canonicalJson(artifact)) throw new ModelRequestError('ARTIFACT_VALIDATION_CHANGED');
      return { status: 'completed', artifact: reparsed, skipped: true, cacheHit: existing.cache_hit };
    }
    const run: ModelRun = existing ?? {
      version: 1, status: 'pending', provider: 'google', model: job.request.model, mode: job.mode, job_id: job.id,
      request_hash: requestHash, started_at: new Date(this.clock.now()).toISOString(), completed_at: null,
      request_index_for_model_day: 0, prompt_hash: hashJson(job.request.prompt), response_hash: null, artifact_hash: null,
      input_tokens: 0, output_tokens: 0, retry_count: 0, attempt_count: 0, error_code: null, cache_hit: false, attempts: []
    };
    // Recover a persisted response from a crash after the call but before completion.
    const finish = async (response: ModelResponse, cacheHit: boolean): Promise<ScheduledResult<T>> => {
      let artifact: T;
      try { artifact = parse(JSON.parse(response.text)); }
      catch (error) { throw error instanceof ModelRequestError ? error : new ModelRequestError('INVALID_MODEL_OUTPUT'); }
      await atomicWriteJson(join(dir, 'artifact.json'), artifact);
      run.status = 'completed'; run.completed_at = new Date(this.clock.now()).toISOString(); run.response_hash = hashJson(response);
      run.artifact_hash = hashJson(artifact); run.input_tokens = response.inputTokens; run.output_tokens = response.outputTokens;
      run.error_code = null; run.cache_hit = cacheHit;
      await atomicWriteJson(runPath, run);
      return { status: 'completed', artifact, skipped: false, cacheHit };
    };
    if (existing?.status === 'running') {
      try {
        const recovered = responseSchema.parse(await readJson(join(dir, 'attempts', `attempt-${String(run.attempt_count).padStart(3, '0')}`, 'response.json')));
        await atomicWriteJson(join(dir, 'response.json'), recovered);
        return await finish(recovered, false);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          run.status = 'failed'; run.error_code = normalizeModelError(error).code; await atomicWriteJson(runPath, run); throw error;
        }
      }
    }
    const cachePath = join(this.root, 'cache', `${hashJson(job.request)}.json`);
    if (job.mode === 'dev' && this.options.cache) {
      try {
        const cached = responseSchema.parse(await readJson(cachePath));
        await atomicWriteJson(join(dir, 'response.json'), cached);
        return await finish(cached, true);
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    await atomicWriteJson(runPath, run);
    const tokens = Buffer.byteLength(canonicalJson(job.request), 'utf8') + job.request.maxOutputTokens + 128;
    const blocked = async (): Promise<ScheduledResult<T>> => {
      run.status = 'quota_blocked'; run.error_code = 'QUOTA_BLOCKED';
      await atomicWriteJson(runPath, run);
      return { status: 'quota_blocked', artifact: null, skipped: false, cacheHit: false };
    };
    for (let attempt = 0; attempt <= (this.options.maxRetries ?? 2); attempt++) {
      let index: number | null;
      try { index = await this.reserve(tokens); }
      catch (error) {
        run.status = 'failed'; run.error_code = normalizeModelError(error).code; await atomicWriteJson(runPath, run); throw error;
      }
      if (index === null) return blocked();
      run.status = 'running'; run.request_index_for_model_day = index; run.attempt_count++;
      await atomicWriteJson(runPath, run);
      const attemptDir = join(dir, 'attempts', `attempt-${String(run.attempt_count).padStart(3, '0')}`);
      await writeOnceJson(join(attemptDir, 'request.json'), { job, at: new Date(this.clock.now()).toISOString(),
        request_index_for_model_day: index, quota_day: quotaDay(this.clock.now()) });
      try {
        const response = responseSchema.parse(await this.provider.generate(job.request));
        await writeOnceJson(join(attemptDir, 'response.json'), response);
        await atomicWriteJson(join(dir, 'response.json'), response);
        const result = await finish(response, false);
        if (job.mode === 'dev' && this.options.cache) await atomicWriteJson(cachePath, response);
        return result;
      } catch (error) {
        const failure = normalizeModelError(error);
        await writeOnceJson(join(attemptDir, 'error.json'), { code: failure.code, retry_after_ms: failure.retryAfterMs, daily_quota: failure.dailyQuota });
        run.error_code = failure.code; run.attempts.push({ at: new Date(this.clock.now()).toISOString(), code: failure.code });
        if (failure.code === 'RESOURCE_EXHAUSTED') {
          if (failure.dailyQuota || attempt === (this.options.maxRetries ?? 2) || failure.retryAfterMs > 60_000) {
            const ledger = await this.ledger(); ledger.blocked = true; await this.saveLedger(ledger);
            return blocked();
          }
          run.retry_count++; run.status = 'pending'; await atomicWriteJson(runPath, run);
          await this.clock.sleep(Math.max(failure.retryAfterMs, 1000 * 2 ** attempt));
        } else {
          run.status = 'failed'; await atomicWriteJson(runPath, run);
          throw failure;
        }
      }
    }
    return blocked();
  }
}
