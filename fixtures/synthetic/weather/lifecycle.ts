import { join } from 'node:path';
import { hashJson, toolContractSchema } from '../../../packages/contracts/src/index.js';
import { atomicWriteJson, writeOnceJson } from '../../../packages/contracts/src/artifacts.js';
import { freezeEvidenceCase, openEvidenceCase } from '../../../packages/contracts/src/evidence.js';
import { verifyIsolated } from '../../../packages/verifier/src/isolated.js';
import { PromotionRegistry } from '../../../packages/runtime/src/index.js';
import { synthesisEvidenceSchema } from '../../../packages/synthesizer/src/index.js';
import type { SynthesisEvidence } from '../../../packages/synthesizer/src/index.js';
import { adapterPlanSchema } from '../../../packages/dsl/src/index.js';
import { newContract, oldContract, plan, weatherGate, weatherInvoker } from './fixture.js';

export const weatherSynthesisEvidence: SynthesisEvidence = {
  dataClass: 'controlled-synthetic', oldContract: toolContractSchema.parse(oldContract), newContracts: [toolContractSchema.parse(newContract)],
  documents: [
    { id: 'change.md#tool', text: 'get_weather is replaced by fetch_forecast.' },
    { id: 'change.md#location', text: 'city is renamed to location, retaining its meaning.' },
    { id: 'change.md#units', text: 'The old tool always returns Fahrenheit. The new required units parameter must be imperial to preserve Fahrenheit; metric means Celsius.' },
    { id: 'change.md#response', text: 'Old temperature maps from current.temperature and old conditions maps from current.summary.' }
  ]
};

/** Controlled lifecycle demonstration; not a frozen benchmark or model-backed result. */
export async function runWeatherLifecycle(directory: string, candidate: unknown = plan) {
  const activePlan = adapterPlanSchema.parse(candidate);
  const identity = hashJson({ oldContract, newContract, plan: activePlan, weatherGate });
  const root = join(directory, identity);
  const caseDir = join(root, 'case');
  await writeOnceJson(join(caseDir, 'synthesis', 'evidence.json'), weatherSynthesisEvidence);
  await writeOnceJson(join(caseDir, 'gate', 'evidence.json'), weatherGate);
  await writeOnceJson(join(caseDir, 'sealed-eval', 'evidence.json'), {
    input: { city: 'Detroit' }, expected: { temperature: 50, conditions: 'Clear' }
  });
  await freezeEvidenceCase(caseDir, 'weather-controlled-demo', false);
  const session = await openEvidenceCase(caseDir, join(root, 'decision'));
  const synthesis = synthesisEvidenceSchema.parse(await session.synthesis.read());
  const verification = { oldContract: synthesis.oldContract, newContract: synthesis.newContracts[0], plan: activePlan,
    gateEvidence: await session.gate.read(), invoke: weatherInvoker };
  const report = await verifyIsolated(verification);
  const semanticRejection = await verifyIsolated({ ...verification, invoke: async () => ({ current: { temperature: 17.777, summary: 'Clear' } }) });
  if (report.verdict !== 'PROMOTED' || semanticRejection.verdict !== 'REJECTED') throw new Error('Controlled gate demonstration failed');
  const registry = new PromotionRegistry(join(root, 'registry'));
  const key = await registry.promote({ ...verification, report });
  await session.commitDecision(activePlan, report, report.verdict);
  const sealed = await (await session.openSealedEvaluation()).read() as { input: unknown; expected: unknown };
  const output = await registry.execute({ key, oldContract, newContract, input: sealed.input, invoke: weatherInvoker });
  if (hashJson(output) !== hashJson(sealed.expected)) throw new Error('Controlled sealed evaluation failed');
  const summary = { kind: 'controlled-local-demo', model_calls: 0, compatible_verdict: report.verdict,
    semantic_mismatch_verdict: semanticRejection.verdict, sealed_opened_after_decision: true,
    sealed_fixture_passed: true, plan_hash: report.plan_hash };
  await atomicWriteJson(join(root, 'summary.json'), summary);
  return summary;
}
