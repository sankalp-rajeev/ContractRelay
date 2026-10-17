import { z } from 'zod';
import { baselineIds } from './methods.js';
export const trialResultSchema = z.object({ version: z.literal(1), case_id: z.string(), baseline: z.enum(baselineIds), trial: z.number().int().positive(),
  suite_hash: z.string(), synthesis_hash: z.string(), artifact_hash: z.string(), paired_b2_artifact_hash: z.string().nullable(),
  held_out: z.boolean(), change_class: z.string(), compatibility: z.enum(['compatible', 'incompatible', 'insufficient-evidence']),
  accepted: z.boolean(), explicit_rejection: z.boolean(), hidden_passed: z.boolean(), side_effects_before_rejection: z.boolean(),
  tasks_total: z.number().int().nonnegative(), tasks_passed: z.number().int().nonnegative(),
  model_jobs: z.array(z.string()), generation_failed: z.boolean(), execution_failed: z.boolean(),
  mode: z.enum(['dev', 'final', 'api-free']), error_code: z.string().nullable() }).strict();
export type TrialResult = z.infer<typeof trialResultSchema>;

export function summarize(results: TrialResult[]) {
  const counts = (subset: TrialResult[]) => ({ trials: subset.length, compatible_trials: subset.filter((run) => run.compatibility === 'compatible').length,
    recovered: subset.filter((run) => run.compatibility === 'compatible' && run.hidden_passed).length,
    accepted: subset.filter((run) => run.accepted).length,
    false_compatible_or_success: subset.filter((run) => run.accepted && !run.hidden_passed).length,
    must_reject_trials: subset.filter((run) => run.compatibility !== 'compatible').length,
    safe_rejections: subset.filter((run) => run.compatibility !== 'compatible' && run.explicit_rejection && !run.generation_failed && !run.side_effects_before_rejection).length,
    insufficient_evidence_acceptances: subset.filter((run) => run.compatibility === 'insufficient-evidence' && run.accepted).length,
    compatible_rejections: subset.filter((run) => run.compatibility === 'compatible' && !run.accepted).length,
    generation_failures: subset.filter((run) => run.generation_failed).length,
    execution_failures: subset.filter((run) => run.execution_failed).length,
    model_jobs: subset.reduce((sum, run) => sum + run.model_jobs.length, 0) });
  const methods = Object.fromEntries(baselineIds.map((baseline) => [baseline, {
    all: counts(results.filter((run) => run.baseline === baseline)),
    development_cases: counts(results.filter((run) => run.baseline === baseline && !run.held_out)),
    held_out_cases: counts(results.filter((run) => run.baseline === baseline && run.held_out)),
    by_change_class: Object.fromEntries([...new Set(results.map((run) => run.change_class))].sort().map((change) =>
      [change, counts(results.filter((run) => run.baseline === baseline && run.change_class === change))])),
    by_case: Object.fromEntries([...new Set(results.map((run) => run.case_id))].sort().map((id) =>
      [id, counts(results.filter((run) => run.baseline === baseline && run.case_id === id))]))
  }]));
  return { version: 1, kind: 'controlled-count-first-results', methods,
    limitations: ['Small controlled suite; no production generalization or semantic-equivalence claim.',
      'Insufficient-evidence cases are reported separately from incompatible semantics.',
      'B0 model jobs recur per task/replay; B2-V inherits B2 generation and artifact hash.',
      'Logical model jobs differ from actual HTTP attempts and token usage; consult scheduler ledger.'] };
}
