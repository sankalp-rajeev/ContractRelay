import type { ToolContract } from '@contractrelay/contracts';
import type { AdapterPlan } from '@contractrelay/dsl';

/** Explicit synthesis-only input. Never pass a case directory or sealed evidence. */
export interface SynthesisEvidence {
  oldContract: ToolContract;
  newContracts: readonly ToolContract[];
  documents: readonly { id: string; text: string }[];
}

/** Provider implementations must use the shared persistent quota scheduler. */
export interface PlanSynthesizer {
  synthesize(evidence: SynthesisEvidence): Promise<AdapterPlan>;
}

// The Gemini provider, scheduler and structured generation are next-milestone work.
