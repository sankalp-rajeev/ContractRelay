import { z } from 'zod';
import { canonicalJson, hashContract, hashJson, jsonValueSchema, toolContractSchema } from '@contractrelay/contracts';
import type { JsonValue } from '@contractrelay/contracts';
import { hashContractSet, normalizeContracts, policyVersionSchema } from '@contractrelay/contracts/policy';
import type { PolicyVersion } from '@contractrelay/contracts/policy';
import { AdapterError, compileCandidate } from '@contractrelay/compiler';
import type { CandidateAdapter, ToolInvoker } from '@contractrelay/compiler';
import { adapterPlanSchema } from '@contractrelay/dsl';
import { toolTraceSchema } from '@contractrelay/traces';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const safePath = z.string().refine((value) => value === '' || value.split('.').every((part) =>
  /^[A-Za-z_][A-Za-z0-9_]*$/.test(part) && !['__proto__', 'constructor', 'prototype'].includes(part)), 'Unsafe predicate path');
const predicateBase = { id: z.string().min(1), trace_id: z.string().min(1), path: safePath };
export const predicateSchema = z.discriminatedUnion('kind', [
  z.object({ ...predicateBase, kind: z.literal('equals'), expected: jsonValueSchema }).strict(),
  z.object({ ...predicateBase, kind: z.literal('exists') }).strict(),
  z.object({ ...predicateBase, kind: z.literal('number_range'), min: z.number().finite(), max: z.number().finite() }).strict()
]);

export const gateEvidenceSchema = z.object({
  version: z.literal(1),
  traces: z.array(toolTraceSchema.extend({ replays: z.number().int().min(1).max(3).optional() })).max(10_000),
  predicates: z.array(predicateSchema).max(10_000),
  metamorphic: z.array(z.object({ id: z.string().min(1), baseline_trace_id: z.string().min(1),
    variant_input: jsonValueSchema, path: safePath, relation: z.literal('equal') }).strict()).max(10_000),
  evidence_refs: z.array(z.string().min(1)),
  supported_defaults: z.array(z.object({ arg: z.string().min(1), value: jsonValueSchema, evidence_ref: z.string().min(1), tool: z.string().optional() }).strict()),
  state_predicates: z.array(predicateSchema).optional(),
  side_effect_assertions: z.array(z.object({ id: z.string().min(1), trace_id: z.string().min(1), tool: z.string().min(1), count: z.number().int().nonnegative() }).strict()).optional()
}).strict();
export type GateEvidence = z.infer<typeof gateEvidenceSchema>;

export const verificationReportSchema = z.object({
  version: z.literal(1), policy_version: policyVersionSchema,
  plan_hash: digest, contract_old_hash: digest, contract_new_hash: digest, gate_evidence_hash: digest,
  checks: z.array(z.object({ id: z.string(), level: z.enum(['V0', 'V1', 'V2', 'V3']), passed: z.boolean(), detail: z.string() }).strict()),
  traces_total: z.number().int().nonnegative(), traces_passed: z.number().int().nonnegative(),
  oracle_results: z.array(z.object({ id: z.string(), passed: z.boolean() }).strict()),
  state_oracle_results: z.array(z.object({ id: z.string(), passed: z.boolean() }).strict()).optional(),
  side_effect_results: z.array(z.object({ id: z.string(), passed: z.boolean() }).strict()),
  verdict: z.enum(['PROMOTED', 'REJECTED', 'INCONCLUSIVE']), residual_risks: z.array(z.string())
}).strict();
export type VerificationReport = z.infer<typeof verificationReportSchema>;
export type VerificationVerdict = VerificationReport['verdict'];
export type VerificationLevel = VerificationReport['checks'][number]['level'];

export interface GateFixture {
  environment: 'isolated-fixture' | 'simulator';
  reset(): Promise<void>;
  observe(): Promise<JsonValue>;
}

function atPath(value: JsonValue, path: string): JsonValue | undefined {
  if (path === '') return value;
  let current = value;
  for (const part of path.split('.')) {
    if (current === null || typeof current !== 'object' || Array.isArray(current) || !Object.hasOwn(current, part)) return undefined;
    current = current[part] as JsonValue;
  }
  return current;
}

function evaluate(predicate: z.infer<typeof predicateSchema>, output: JsonValue | undefined): boolean {
  const value = output === undefined ? undefined : atPath(output, predicate.path);
  if (value === undefined) return false;
  if (predicate.kind === 'equals') return canonicalJson(value) === canonicalJson(predicate.expected);
  if (predicate.kind === 'number_range') return typeof value === 'number' && value >= predicate.min && value <= predicate.max;
  return true;
}

/** Execute gate evidence only. No case paths or sealed-evaluation input. */
export async function verifyCandidate(input: {
  plan: unknown; oldContract: unknown; newContract: unknown; gateEvidence: unknown; invoke: ToolInvoker;
  policyVersion?: PolicyVersion; fixture?: GateFixture;
}): Promise<VerificationReport> {
  const oldContract = toolContractSchema.parse(input.oldContract);
  const targets = normalizeContracts(input.newContract);
  const policy = policyVersionSchema.parse(input.policyVersion ?? 'read-only-v1');
  const gate = gateEvidenceSchema.parse(input.gateEvidence);
  const plan = adapterPlanSchema.parse(input.plan);
  const report: VerificationReport = {
    version: 1, policy_version: policy, plan_hash: hashJson(plan),
    contract_old_hash: hashContract(oldContract), contract_new_hash: hashContractSet(input.newContract),
    gate_evidence_hash: hashJson(gate), checks: [], traces_total: gate.traces.length, traces_passed: 0,
    oracle_results: [], side_effect_results: [], verdict: 'INCONCLUSIVE', residual_risks: []
  };
  if ('op' in plan) {
    report.checks.push({ id: 'explicit-reject', level: 'V0', passed: false, detail: 'Candidate explicitly rejects compatibility' });
    report.verdict = 'REJECTED';
    return report;
  }
  let candidate: CandidateAdapter;
  try {
    candidate = compileCandidate(plan, oldContract, input.newContract, policy);
    report.checks.push({ id: 'structural', level: 'V0', passed: true, detail: 'Bounded plan and contract schemas validated' });
  } catch {
    report.checks.push({ id: 'structural', level: 'V0', passed: false, detail: 'Plan compilation or side-effect policy failed' });
    report.verdict = 'REJECTED';
    return report;
  }
  const refs = new Set(gate.evidence_refs);
  for (const step of [...plan.steps, ...plan.response]) {
    if (step.evidence.some((ref) => !refs.has(ref))) report.residual_risks.push('Unresolved transformation evidence reference');
    if (step.op === 'AddConstantDefault' && !gate.supported_defaults.some((entry) => entry.arg === step.arg
      && canonicalJson(entry.value) === canonicalJson(step.value) && step.evidence.includes(entry.evidence_ref))) {
      report.residual_risks.push(`No independent evidence supports constant default for ${step.arg}`);
    }
  }
  if (plan.target.kind === 'compose') {
    for (const call of plan.target.calls) {
      const citations = [...call.evidence, ...Object.values(call.arguments).flatMap((binding) => 'evidence' in binding ? binding.evidence : [])];
      if (citations.some((ref) => !refs.has(ref))) report.residual_risks.push('Unresolved composed-call evidence reference');
      for (const [arg, binding] of Object.entries(call.arguments)) {
        if (binding.kind === 'constant' && !gate.supported_defaults.some((entry) => entry.tool === call.tool && entry.arg === arg
          && canonicalJson(entry.value) === canonicalJson(binding.value) && binding.evidence.includes(entry.evidence_ref))) {
          report.residual_risks.push(`No independent evidence supports composed constant for ${call.tool}.${arg}`);
        }
      }
    }
  }
  const stateful = policy !== 'read-only-v1';
  if (stateful) {
    const environment = policy === 'stateful-simulator-v1' ? 'simulator' : 'isolated-fixture';
    if (input.fixture?.environment !== environment) report.residual_risks.push('Missing isolated state fixture or simulator capability');
    if (!gate.state_predicates?.length || !gate.side_effect_assertions?.length) report.residual_risks.push('Missing V3 state or side-effect evidence');
    if (gate.metamorphic.length) report.residual_risks.push('Write metamorphic variants require independently reset trace fixtures');
    for (const trace of gate.traces) {
      if (!gate.state_predicates?.some((predicate) => predicate.trace_id === trace.traceId)
        || !gate.side_effect_assertions?.some((assertion) => assertion.trace_id === trace.traceId)) report.residual_risks.push('Each write trace requires state and side-effect assertions');
    }
    for (const assertion of gate.side_effect_assertions ?? []) {
      if (!targets.some((target) => target.name === assertion.tool)) report.residual_risks.push('Unknown side-effect assertion tool');
    }
    report.state_oracle_results = [];
  }
  const ids = gate.traces.map((trace) => trace.traceId);
  const oracleIds = [...gate.predicates, ...gate.metamorphic, ...(gate.state_predicates ?? []), ...(gate.side_effect_assertions ?? [])].map((oracle) => oracle.id);
  if (new Set(ids).size !== ids.length || new Set(oracleIds).size !== oracleIds.length) report.residual_risks.push('Duplicate trace or oracle identifiers');
  if (gate.traces.length === 0) report.residual_risks.push('Missing gate replay traces');
  if (gate.predicates.length + gate.metamorphic.length === 0) report.residual_risks.push('Missing independent behavioral evidence');
  if (report.residual_risks.length) return report;
  const outputs = new Map<string, JsonValue>();
  const states = new Map<string, JsonValue>();
  for (const trace of gate.traces) {
    try {
      if (trace.tool !== oldContract.name || trace.contractHash !== report.contract_old_hash) throw new AdapterError('TRACE_CONTRACT', 'Trace does not bind the old contract');
      if (stateful) await input.fixture?.reset();
      for (let replay = 0; replay < (trace.replays ?? 1); replay++) outputs.set(trace.traceId, await candidate.executeForVerification(trace.input, input.invoke));
      if (stateful && input.fixture) states.set(trace.traceId, jsonValueSchema.parse(await input.fixture.observe()));
      report.traces_passed++;
      report.checks.push({ id: `trace:${trace.traceId}`, level: 'V1', passed: true, detail: 'Replay passed schema boundaries' });
    } catch (error) {
      report.checks.push({ id: `trace:${trace.traceId}`, level: 'V1', passed: false,
        detail: error instanceof AdapterError ? error.code : 'EXECUTION_FAILED' });
    }
  }
  for (const predicate of gate.predicates) {
    const passed = evaluate(predicate, outputs.get(predicate.trace_id));
    report.oracle_results.push({ id: predicate.id, passed });
    report.checks.push({ id: `predicate:${predicate.id}`, level: 'V2', passed, detail: 'Independent output predicate' });
  }
  if (stateful) {
    for (const predicate of gate.state_predicates ?? []) {
      const passed = evaluate(predicate, states.get(predicate.trace_id));
      report.state_oracle_results?.push({ id: predicate.id, passed });
      report.checks.push({ id: `state:${predicate.id}`, level: 'V3', passed, detail: 'Independent fixture state predicate' });
    }
    for (const assertion of gate.side_effect_assertions ?? []) {
      const state = states.get(assertion.trace_id);
      const count = state === undefined ? undefined : atPath(state, `side_effects.${assertion.tool}`);
      const passed = count === assertion.count;
      report.side_effect_results.push({ id: assertion.id, passed });
      report.checks.push({ id: `effects:${assertion.id}`, level: 'V3', passed, detail: 'Independent side-effect count' });
    }
  }
  for (const property of gate.metamorphic) {
    let passed = false;
    try {
      const baseline = outputs.get(property.baseline_trace_id);
      const variant = await candidate.executeForVerification(property.variant_input, input.invoke);
      const expected = baseline === undefined ? undefined : atPath(baseline, property.path);
      const actual = atPath(variant, property.path);
      passed = expected !== undefined && actual !== undefined && canonicalJson(expected) === canonicalJson(actual);
    } catch { /* An unexecutable relation is a failing property, never a pass. */ }
    report.oracle_results.push({ id: property.id, passed });
    report.checks.push({ id: `metamorphic:${property.id}`, level: 'V2', passed, detail: 'Independent metamorphic relation' });
  }
  report.verdict = report.checks.every((check) => check.passed) ? 'PROMOTED' : 'REJECTED';
  return verificationReportSchema.parse(report);
}

export function assertPromotableReport(value: unknown): VerificationReport {
  const report = verificationReportSchema.parse(value);
  if (report.verdict !== 'PROMOTED' || report.residual_risks.length || report.traces_total < 1
    || report.traces_total !== report.traces_passed || report.oracle_results.length < 1
    || report.checks.some((check) => !check.passed) || report.oracle_results.some((check) => !check.passed)
    || !['V0', 'V1', 'V2'].every((level) => report.checks.some((check) => check.level === level && check.passed))
    || (report.policy_version !== 'read-only-v1' && (!report.state_oracle_results?.length || !report.side_effect_results.length
      || report.state_oracle_results.some((check) => !check.passed) || report.side_effect_results.some((check) => !check.passed)
      || !report.checks.some((check) => check.level === 'V3' && check.passed)))) {
    throw new AdapterError('PROMOTION_REFUSED', 'Mandatory read-only verification gates did not pass');
  }
  return report;
}
