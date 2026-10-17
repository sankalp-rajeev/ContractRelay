import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBenchmark } from '../src/runner.js';
import { DockerSandbox } from '../src/sandbox.js';
import config from '../../../config/sandbox.json' with { type: 'json' };
import { QuotaScheduler } from '@contractrelay/synthesizer';
import type { ModelRequest } from '@contractrelay/synthesizer';
import type { JsonValue } from '@contractrelay/contracts';
import { atomicWriteJson } from '@contractrelay/contracts/artifacts';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
const suiteRoot = fileURLToPath(new URL('../../../benchmarks/', import.meta.url));
class ControlledSandbox extends DockerSandbox {
  override async execute(_code: string, input: JsonValue): Promise<JsonValue> {
    return { results: [`${(input as Record<string, JsonValue>).query}-catalog`] };
  }
}
describe('matched comparison interruption and pairing (TC-020/021/023)', () => {
  it('resumes a quota stop inside B0, reuses prior responses and pairs B2-V without generation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'contractrelay-matched-')); dirs.push(root);
    let now = Date.parse('2026-10-17T18:00:00Z');
    const generate = vi.fn(async (request: ModelRequest) => {
      let value: unknown;
      if (request.prompt.startsWith('ContractRelay matched-information replanning')) {
        const input = JSON.parse(request.prompt.split('TASK_INPUT_JSON\n')[1]!.split('\nTRANSCRIPT_JSON')[0]!) as { query: string };
        const transcript = JSON.parse(request.prompt.split('TRANSCRIPT_JSON\n')[1]!) as unknown[];
        value = transcript.length === 0 ? { action: 'call', tool: 'search_catalog', arguments_json: JSON.stringify(input), output_json: '', reason: '' }
          : { action: 'finish', tool: '', arguments_json: '{}', output_json: JSON.stringify({ results: [`${input.query}-catalog`] }), reason: '' };
      } else if (request.prompt.startsWith('ContractRelay matched-information generic')) {
        value = { decision: 'adapt', code: 'controlled-test-wrapper-not-evaluated', reason: '', rationale: 'Fixture transport' };
      } else value = { candidate: { version: 1, source_tool: 'search', target: { kind: 'single', tool: 'search_catalog' },
        steps: [{ op: 'RenameTool', from: 'search', to: 'search_catalog', evidence: ['change.json'] }], response: [], rationale: 'Documented rename' } };
      return { text: JSON.stringify(value), inputTokens: 5, outputTokens: 10 };
    });
    const scheduler = new QuotaScheduler(join(root, 'scheduler'), { generate }, { model: 'controlled', rpm: 100, tpm: 1000000, rpdSoft: 3, rpdHard: 3 },
      { clock: { now: () => now, sleep: async (ms) => { now += ms; } } });
    const settings = { suiteRoot, runRoot: join(root, 'run'), mode: 'dev' as const, model: 'controlled', trials: 1, resume: true,
      scheduler, sandbox: new ControlledSandbox(config), caseIds: ['01-tool-rename'] };
    const stopped = await runBenchmark(settings);
    expect(stopped.summary.quota_blocked).toBe(true); expect(generate).toHaveBeenCalledTimes(3);
    now += 24 * 60 * 60 * 1000;
    const resumed = await runBenchmark(settings);
    expect(resumed.summary.complete).toBe(true); expect(resumed.results).toHaveLength(5);
    expect(generate).toHaveBeenCalledTimes(6);
    expect(resumed.results.every((result) => result.hidden_passed)).toBe(true);
    const b2 = resumed.results.find((result) => result.baseline === 'b2')!;
    const b2v = resumed.results.find((result) => result.baseline === 'b2v')!;
    expect(b2v.artifact_hash).toBe(b2.artifact_hash); expect(b2v.paired_b2_artifact_hash).toBe(b2.artifact_hash);
    expect(b2v.model_jobs).toEqual([]);
    expect((await runBenchmark(settings)).results).toEqual(resumed.results);
    expect(generate).toHaveBeenCalledTimes(6);
    await atomicWriteJson(join(root, 'run/01-tool-rename/b2/trial-001/generated-wrapper.json'),
      { decision: 'adapt', code: 'tampered-wrapper-artifact', rationale: 'untrusted change' });
    await expect(runBenchmark(settings)).rejects.toThrow('GENERATED_WRAPPER_DRIFT');
    expect(generate).toHaveBeenCalledTimes(6);
  }, 20000);
});
