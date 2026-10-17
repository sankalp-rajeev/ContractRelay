import { access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { hashContract, hashJson, toolContractSchema } from '@contractrelay/contracts';
import type { JsonValue } from '@contractrelay/contracts';
import { readJson, writeOnceJson } from '@contractrelay/contracts/artifacts';
import { AdapterError, compileCandidate } from '@contractrelay/compiler';
import type { CandidateAdapter, ToolInvoker } from '@contractrelay/compiler';
import { adapterPlanSchema } from '@contractrelay/dsl';
import { assertPromotableReport, gateEvidenceSchema } from '@contractrelay/verifier';
import type { verifyCandidate } from '@contractrelay/verifier';
import { verifyIsolated } from '@contractrelay/verifier/isolated';
import { redactTrace } from '@contractrelay/traces';
import type { ToolTrace } from '@contractrelay/traces';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const promotionKeySchema = z.object({
  oldContractHash: digest, newContractHash: digest, adapterPlanHash: digest,
  policyVersion: z.literal('read-only-v1')
}).strict();
export type PromotionKey = z.infer<typeof promotionKeySchema>;
const manifestSchema = z.object({ version: z.literal(1), key: promotionKeySchema,
  reportHash: digest, gateEvidenceHash: digest }).strict();

export class PromotionRegistry {
  private readonly root: string;
  constructor(directory: string) { this.root = resolve(directory); }
  private directory(key: PromotionKey): string { return join(this.root, hashJson(promotionKeySchema.parse(key))); }

  /** Re-run the trusted gate; a caller-supplied PROMOTED string cannot authorize serving. */
  async promote(input: Parameters<typeof verifyCandidate>[0] & { report: unknown }): Promise<PromotionKey> {
    const report = assertPromotableReport(input.report);
    const fresh = assertPromotableReport(await verifyIsolated(input));
    if (hashJson(report) !== hashJson(fresh)) throw new AdapterError('PROMOTION_REFUSED', 'Report differs from independently repeated verification');
    const oldContract = toolContractSchema.parse(input.oldContract);
    const newContract = toolContractSchema.parse(input.newContract);
    const plan = adapterPlanSchema.parse(input.plan);
    const gate = gateEvidenceSchema.parse(input.gateEvidence);
    const key = promotionKeySchema.parse({ oldContractHash: hashContract(oldContract),
      newContractHash: hashContract(newContract), adapterPlanHash: hashJson(plan), policyVersion: report.policy_version });
    const dir = this.directory(key);
    await writeOnceJson(join(dir, 'old.contract.json'), oldContract);
    await writeOnceJson(join(dir, 'new.contract.json'), newContract);
    await writeOnceJson(join(dir, 'adapter.plan.json'), plan);
    await writeOnceJson(join(dir, 'gate.evidence.json'), gate);
    await writeOnceJson(join(dir, 'verification.report.json'), report);
    await writeOnceJson(join(dir, 'promotion.manifest.json'), { version: 1, key,
      reportHash: hashJson(report), gateEvidenceHash: hashJson(gate) });
    return key;
  }

  async invalidate(key: PromotionKey, reason: string): Promise<void> {
    if (!reason.trim()) throw new Error('Invalidation requires a reason');
    await writeOnceJson(join(this.directory(key), 'revoked.json'), { reason });
  }

  async execute(input: { key: PromotionKey; oldContract: unknown; newContract: unknown; input: unknown;
    invoke: ToolInvoker; onTrace?: (trace: ToolTrace) => void | Promise<void> }): Promise<JsonValue> {
    const key = promotionKeySchema.parse(input.key);
    if (hashContract(input.oldContract) !== key.oldContractHash || hashContract(input.newContract) !== key.newContractHash) {
      throw new AdapterError('CONTRACT_DRIFT', 'Current contracts differ from the exact promoted pair');
    }
    const dir = this.directory(key);
    let candidate: CandidateAdapter;
    let sourceTool: string;
    try {
      let revoked = false;
      try { await access(join(dir, 'revoked.json')); revoked = true; } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      if (revoked) throw new Error('Revoked');
      const manifest = manifestSchema.parse(await readJson(join(dir, 'promotion.manifest.json')));
      const oldContract = toolContractSchema.parse(await readJson(join(dir, 'old.contract.json')));
      const newContract = toolContractSchema.parse(await readJson(join(dir, 'new.contract.json')));
      const plan = adapterPlanSchema.parse(await readJson(join(dir, 'adapter.plan.json')));
      const report = assertPromotableReport(await readJson(join(dir, 'verification.report.json')));
      const gate = gateEvidenceSchema.parse(await readJson(join(dir, 'gate.evidence.json')));
      if (hashJson(manifest.key) !== hashJson(key) || hashContract(oldContract) !== key.oldContractHash
        || hashContract(newContract) !== key.newContractHash || hashJson(plan) !== key.adapterPlanHash
        || hashJson(report) !== manifest.reportHash || hashJson(gate) !== manifest.gateEvidenceHash
        || report.plan_hash !== key.adapterPlanHash || report.contract_old_hash !== key.oldContractHash
        || report.contract_new_hash !== key.newContractHash || report.gate_evidence_hash !== manifest.gateEvidenceHash
        || report.policy_version !== key.policyVersion) throw new Error('Artifact binding mismatch');
      candidate = compileCandidate(plan, oldContract, newContract);
      sourceTool = oldContract.name;
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      throw new AdapterError('PROMOTION_INVALIDATED', 'Promotion is missing, revoked or fails artifact integrity checks');
    }
    let output: JsonValue;
    try { output = await candidate.executeForVerification(input.input, input.invoke); }
    catch (error) {
      if (error instanceof AdapterError) throw error;
      throw new AdapterError('TARGET_EXECUTION_FAILED', 'Target tool execution failed');
    }
    if (input.onTrace) {
      try { await input.onTrace(redactTrace({ traceId: randomUUID(), tool: sourceTool,
        input: input.input as JsonValue, output, contractHash: key.oldContractHash })); }
      catch { throw new AdapterError('TRACE_DELIVERY_FAILED', 'Execution completed but trace delivery failed'); }
    }
    return output;
  }
}
