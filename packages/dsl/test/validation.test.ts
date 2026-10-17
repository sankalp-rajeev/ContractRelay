import { describe, expect, it } from 'vitest';
import { adapterPlanSchema, PlanValidationError, validatePlan } from '../src/index.js';
import plan from '../../../fixtures/synthetic/weather/adapter.plan.json' with { type: 'json' };
import oldContract from '../../../fixtures/synthetic/weather/old.contract.json' with { type: 'json' };
import newContract from '../../../fixtures/synthetic/weather/new.contract.json' with { type: 'json' };

function codes(candidate: unknown, old: unknown = oldContract, next: unknown = newContract): readonly string[] {
  try {
    validatePlan(candidate, old, next);
    throw new Error('Expected rejection');
  } catch (error) {
    if (!(error instanceof PlanValidationError)) throw error;
    return error.diagnostics.map((item) => item.code);
  }
}

describe('bounded AdapterPlan validation', () => {
  it('accepts primitive plans and explicit rejection artifacts', () => {
    expect(validatePlan(plan, oldContract, newContract)).toEqual(plan);
    expect(adapterPlanSchema.parse({
      version: 1, op: 'Reject', reason: 'Removed capability', missing_evidence: [], risk: 'Semantic mismatch'
    })).toHaveProperty('op', 'Reject');
  });

  it('rejects unsupported versions, operations, and arbitrary executable fields', () => {
    expect(codes({ ...plan, version: 2 })).toContain('PLAN_SCHEMA');
    expect(codes({ ...plan, steps: [{ op: 'RunCode', code: 'process.exit()' }] })).toContain('PLAN_SCHEMA');
    expect(codes({ ...plan, code: 'arbitrary' })).toContain('PLAN_SCHEMA');
  });

  it('rejects a target outside the explicit contract allowlist', () => {
    expect(codes({ ...plan, target: { kind: 'single', tool: 'hallucinated' } })).toContain('TARGET_TOOL');
  });

  it('rejects nonexistent fields and overwrites', () => {
    expect(codes({ ...plan, steps: [{ op: 'RenameArg', from: 'missing', to: 'location', evidence: ['doc'] }] })).toContain('SOURCE_FIELD');
    expect(codes({ ...plan, steps: [{ op: 'RenameArg', from: 'city', to: 'hallucinated', evidence: ['doc'] }] })).toContain('TARGET_FIELD');
    expect(codes({ ...plan, steps: [...plan.steps, plan.steps[2]] })).toContain('DUPLICATE_ASSIGNMENT');
  });

  it('requires new required inputs to be guaranteed', () => {
    expect(codes({ ...plan, steps: plan.steps.slice(0, 2) })).toContain('MISSING_REQUIRED');
  });

  it('requires evidence references for every transformation', () => {
    expect(codes({ ...plan, steps: [{ op: 'RenameArg', from: 'city', to: 'location', evidence: [] }] })).toContain('PLAN_SCHEMA');
  });

  it('refuses unsafe paths and hallucinated response properties', () => {
    expect(codes({ ...plan, response: [{ op: 'ProjectResponse', mapping: { temperature: '__proto__.x' }, evidence: ['doc'] }] })).toContain('PLAN_SCHEMA');
    expect(codes({ ...plan, response: [{ op: 'ProjectResponse', mapping: { temperature: 'current.missing' }, evidence: ['doc'] }] })).toContain('RESPONSE_SOURCE');
    expect(codes({ ...plan, response: [{ op: 'ProjectResponse', mapping: { missing: 'current.temperature' }, evidence: ['doc'] }] })).toContain('RESPONSE_TARGET');
  });

  it.each(['UNKNOWN', 'IDEMPOTENT_WRITE', 'REVERSIBLE_WRITE', 'IRREVERSIBLE_WRITE'])(
    'refuses %s before state policy and isolated oracles exist', (sideEffect) => {
      expect(codes(plan, oldContract, { ...newContract, sideEffect })).toContain('SIDE_EFFECT_POLICY');
    }
  );
});
