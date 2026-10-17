import { describe, expect, it, vi } from 'vitest';
import { compileCandidate } from '../src/index.js';
import type { ToolInvoker } from '../src/index.js';
import oldContract from '../../../fixtures/synthetic/weather/old.contract.json' with { type: 'json' };
import newContract from '../../../fixtures/synthetic/weather/new.contract.json' with { type: 'json' };
import plan from '../../../fixtures/synthetic/weather/adapter.plan.json' with { type: 'json' };

describe('controlled weather migration', () => {
  it('renames the tool and argument, adds an evidenced default, and projects the response', async () => {
    const invoke = vi.fn(async () => ({ current: { temperature: 64, summary: 'Clear' } }));
    const candidate = compileCandidate(plan, oldContract, newContract);
    const input = { city: 'Ann Arbor' };
    expect(await candidate.executeForVerification(input, invoke)).toEqual({ temperature: 64, conditions: 'Clear' });
    expect(invoke).toHaveBeenCalledExactlyOnceWith('fetch_forecast', { location: 'Ann Arbor', units: 'imperial' });
    expect(input).toEqual({ city: 'Ann Arbor' });
  });

  it('checks old inputs before invoking the backend', async () => {
    const invoke = vi.fn();
    const candidate = compileCandidate(plan, oldContract, newContract);
    await expect(candidate.executeForVerification({ city: '' }, invoke)).rejects.toMatchObject({ code: 'SCHEMA_VALIDATION' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('checks translated inputs before invoking the backend', async () => {
    const invalid = {
      ...plan,
      steps: plan.steps.map((step) => step.op === 'AddConstantDefault' ? { ...step, value: 'invented-unit' } : step)
    };
    const invoke = vi.fn();
    const candidate = compileCandidate(invalid, oldContract, newContract);
    await expect(candidate.executeForVerification({ city: 'Ann Arbor' }, invoke)).rejects.toMatchObject({ code: 'SCHEMA_VALIDATION' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('rejects malformed target output', async () => {
    const candidate = compileCandidate(plan, oldContract, newContract);
    await expect(candidate.executeForVerification({ city: 'Ann Arbor' }, async () => ({ current: { temperature: 'cold', summary: 'Clear' } })))
      .rejects.toMatchObject({ code: 'SCHEMA_VALIDATION' });
  });

  it('checks the old response schema after projection', async () => {
    const incomplete = { ...plan, response: [{ op: 'ProjectResponse', mapping: { temperature: 'current.temperature' }, evidence: ['doc'] }] };
    const candidate = compileCandidate(incomplete, oldContract, newContract);
    await expect(candidate.executeForVerification({ city: 'Ann Arbor' }, async () => ({ current: { temperature: 64, summary: 'Clear' } })))
      .rejects.toMatchObject({ code: 'SCHEMA_VALIDATION' });
  });

  it('is deterministic and isolates its executable plan from caller mutation', async () => {
    const mutable = structuredClone(plan);
    const candidate = compileCandidate(mutable, oldContract, newContract);
    const hash = candidate.planHash;
    mutable.target.tool = 'attacker';
    candidate.plan.target.tool = 'also-attacker';
    const invoke = vi.fn<ToolInvoker>(async () => ({ current: { temperature: 64, summary: 'Clear' } }));
    const results = await Promise.all(Array.from({ length: 5 }, () => candidate.executeForVerification({ city: 'Ann Arbor' }, invoke)));
    expect(results.every((value) => JSON.stringify(value) === JSON.stringify(results[0]))).toBe(true);
    expect(candidate.planHash).toBe(hash);
    expect(candidate.planHash).toBe(compileCandidate(plan, oldContract, newContract).planHash);
    expect(invoke.mock.calls.every((call) => call[0] === 'fetch_forecast')).toBe(true);
  });
});
