import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GeminiProvider, loadModelConfig, QuotaScheduler, ScheduledPlanSynthesizer, retryAfterMilliseconds } from '../src/index.js';
import type { SynthesisEvidence } from '../src/index.js';
import { createPlanResponseJsonSchema, parseSynthesisCandidate } from '../src/synthesis.js';
import { oldRefundContract, refundTargetContracts, refundEvidenceRefs } from '../../../fixtures/synthetic/refund/contracts.js';
import refundPlan from '../../../fixtures/synthetic/refund/adapter.plan.json' with { type: 'json' };
import { newContract, oldContract, plan } from '../../../fixtures/synthetic/weather/fixture.js';
import { toolContractSchema } from '@contractrelay/contracts';

const directories: string[] = [];
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
const evidence: SynthesisEvidence = { dataClass: 'controlled-synthetic', oldContract: toolContractSchema.parse(oldContract),
  newContracts: [toolContractSchema.parse(newContract)], documents: ['tool', 'location', 'units', 'response'].map((section) => ({ id: `change.md#${section}`, text: 'Documented controlled change' })) };
const planResponseJsonSchema = createPlanResponseJsonSchema(evidence);

const refundEvidence: SynthesisEvidence = { dataClass: 'controlled-synthetic', oldContract: oldRefundContract,
  newContracts: refundTargetContracts, documents: refundEvidenceRefs.map((id) => ({ id, text: 'Controlled authoritative change' })) };
function refundWire() {
  return { decision: 'adapt', source_tool: refundPlan.source_tool, reason: '', missing_evidence: [], risk: '', rationale: refundPlan.rationale,
    calls: refundPlan.target.calls.map((call) => ({ ...call, arguments: Object.entries(call.arguments).map(([name, value]) => {
      const binding = value as { kind: string; path?: string; call?: string; value?: string; to?: string; scale?: number;
        source?: { kind: string; path: string; call?: string }; evidence?: string[] };
      const source = binding.source ?? binding;
      return { name, kind: binding.kind === 'convert' ? `convert_${source.kind}` : binding.kind,
        path: source.path ?? '', call: source.call ?? '', value: binding.value ?? null, to: binding.to ?? 'string',
        scale: binding.scale ?? 1, evidence: binding.evidence ?? [] };
    }) })),
    projection: [
      { field: 'refund_id', source: 'refund.id', enum_map: [], evidence: ['change.md#response'] },
      { field: 'status', source: 'refund.state', enum_map: [{ from: 'completed', to: 'refunded' }], evidence: ['change.md#response'] }
    ] };
}

async function synthesize(response: unknown, input: unknown = evidence) {
  const dir = await mkdtemp(join(tmpdir(), 'contractrelay-synth-'));
  directories.push(dir);
  const generate = vi.fn(async () => ({ text: JSON.stringify(response), inputTokens: 10, outputTokens: 20 }));
  const scheduler = new QuotaScheduler(dir, { generate }, { model: 'configured-test-model', rpm: 10, tpm: 100_000, rpdSoft: 2, rpdHard: 3 });
  const synth = new ScheduledPlanSynthesizer(scheduler, { jobId: 'trial-001', model: 'configured-test-model', mode: 'dev' });
  return { generate, promise: synth.synthesize(input as SynthesisEvidence) };
}

describe('structured synthesis trust boundary', () => {
  it('decodes composed wire data into the bounded canonical plan with independent validation', () => {
    expect(parseSynthesisCandidate({ candidate: refundWire() }, refundEvidence)).toEqual(refundPlan);
  });

  it('rejects ambiguous wire records and enforces bounds outside the provider schema', () => {
    const duplicateBinding = refundWire();
    duplicateBinding.calls[0]!.arguments.push(duplicateBinding.calls[0]!.arguments[0]!);
    const duplicateProjection = refundWire(); duplicateProjection.projection.push(duplicateProjection.projection[0]!);
    const duplicateEnum = refundWire(); duplicateEnum.projection[1]!.enum_map.push({ from: 'completed', to: 'refunded' });
    const oversized = refundWire(); oversized.calls = Array.from({ length: 9 }, () => oversized.calls[0]!);
    const rejectWithCalls = { ...refundWire(), decision: 'reject' };
    for (const wire of [duplicateBinding, duplicateProjection, duplicateEnum, oversized, rejectWithCalls]) {
      expect(() => parseSynthesisCandidate({ candidate: wire }, refundEvidence)).toThrow();
    }
  });

  it('accepts an evidence-grounded bounded plan through the shared scheduler', async () => {
    const { generate, promise } = await synthesize({ candidate: plan });
    expect(await promise).toEqual(plan);
    expect(generate.mock.calls[0]).toBeDefined();
  });

  it('preserves an explicit model rejection', async () => {
    const reject = { version: 1, op: 'Reject', reason: 'Removed capability', missing_evidence: ['oracle'], risk: 'Cannot preserve behavior' };
    expect(await (await synthesize({ candidate: reject })).promise).toEqual(reject);
  });

  it('rejects hallucinated tools, unresolved references and unsupported code before execution', async () => {
    for (const candidate of [
      { ...plan, target: { kind: 'single', tool: 'invented' } },
      { ...plan, steps: [{ op: 'RenameArg', from: 'city', to: 'location', evidence: ['invented-document'] }] },
      { ...plan, steps: [{ op: 'ExecuteCode', code: 'process.exit()' }] }
    ]) await expect((await synthesize({ candidate })).promise).rejects.toThrow();
  });

  it('refuses gate/sealed evidence fields and private data classifications at the input boundary', async () => {
    await expect((await synthesize({ candidate: plan }, { ...evidence, sealed_eval: { sentinel: 'hidden' } })).promise).rejects.toThrow();
    await expect((await synthesize({ candidate: plan }, { ...evidence, dataClass: 'private' })).promise).rejects.toThrow();
  });

  it('configures Gemini structured output and disables invisible retries', async () => {
    const generate = vi.fn(async () => ({ text: '{"candidate":{}}', usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, thoughtsTokenCount: 5 } }));
    // The SDK response has text as a getter; this controlled transport supplies the same public shape.
    const provider = new GeminiProvider('test-only-placeholder', generate);
    expect(await provider.generate({ model: 'configured-test-model', prompt: 'synthetic', schema: planResponseJsonSchema, maxOutputTokens: 100, temperature: 0.2 }))
      .toEqual({ text: '{"candidate":{}}', inputTokens: 10, outputTokens: 25 });
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ config: expect.objectContaining({ responseMimeType: 'application/json',
      responseJsonSchema: planResponseJsonSchema }) }));
    expect(() => new GeminiProvider('')).toThrow('MISSING_GEMINI_API_KEY');
  });

  it('preserves real SDK HTTP errors and makes exactly one transport call', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED',
      message: 'requestsPerDay quota exceeded', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '2s' }] } }),
    { status: 429, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    const provider = new GeminiProvider('test-only-placeholder');
    await expect(provider.generate({ model: 'configured-test-model', prompt: 'synthetic', schema: planResponseJsonSchema, maxOutputTokens: 100, temperature: 0.2 }))
      .rejects.toMatchObject({ code: 'RESOURCE_EXHAUSTED', dailyQuota: true, retryAfterMs: 2000 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('loads explicit quotas, rejects invalid overrides, and forces final cache off', async () => {
    const defaults = await loadModelConfig({});
    expect(defaults.budget.model).toBe('gemini-3.5-flash-lite');
    expect((await loadModelConfig({ CONTRACTRELAY_MODEL_MODE: 'final', CONTRACTRELAY_CACHE_MODE: 'dev' })).cache).toBe(false);
    await expect(loadModelConfig({ CONTRACTRELAY_DEV_RPD_SOFT: '9999' })).rejects.toThrow();
    expect((await loadModelConfig({ CONTRACTRELAY_DEV_RPD_SOFT: '2' })).budget.rpdSoft).toBe(2);
    expect(retryAfterMilliseconds('2', 0)).toBe(2000);
    expect(retryAfterMilliseconds('Sun, 18 Oct 2026 07:00:00 GMT', Date.parse('2026-10-18T06:59:58Z'))).toBe(2000);
  });
});
