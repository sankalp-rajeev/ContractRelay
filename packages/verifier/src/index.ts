export type VerificationVerdict = 'PROMOTED' | 'REJECTED' | 'INCONCLUSIVE';
export type VerificationLevel = 'V0' | 'V1' | 'V2' | 'V3';

/** Planned report contract. A report cannot itself authorize runtime execution. */
export interface VerificationReport {
  plan_hash: string;
  contract_old_hash: string;
  contract_new_hash: string;
  gate_evidence_hash: string;
  checks: readonly { level: VerificationLevel; passed: boolean; detail: string }[];
  traces_total: number;
  traces_passed: number;
  oracle_results: readonly { id: string; passed: boolean }[];
  side_effect_results: readonly { id: string; passed: boolean }[];
  verdict: VerificationVerdict;
  residual_risks: readonly string[];
}

// Replay, independent oracles, policy, evidence loading and promotion remain unimplemented.
