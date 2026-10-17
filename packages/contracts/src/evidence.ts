import { realpath, appendFile, mkdir } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import { hashJson, jsonValueSchema } from './index.js';
import { readJson, writeOnceJson } from './artifacts.js';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const evidenceManifestSchema = z.object({
  version: z.literal(1),
  case_id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  held_out: z.boolean(),
  partitions: z.object({
    synthesis: digest, gate: digest, sealed_eval: digest
  }).strict()
}).strict();
export type EvidenceManifest = z.infer<typeof evidenceManifestSchema>;
export type EvidenceRole = 'synthesis' | 'gate' | 'sealed_eval';

export const decisionSchema = z.object({
  version: z.literal(1), case_id: z.string(), candidate_hash: digest,
  gate_evidence_hash: digest, verdict: z.enum(['PROMOTED', 'REJECTED', 'INCONCLUSIVE']),
  report_hash: digest
}).strict();
export type FrozenDecision = z.infer<typeof decisionSchema>;

export class EvidenceAccessError extends Error {
  readonly code = 'EVIDENCE_ACCESS_DENIED';
}

function contained(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

/** Node enforces filesystem grants in the reader process, even for direct fs reads. */
export async function permissionedJsonRead(allowedDirectory: string, requestedFile: string): Promise<unknown> {
  const worker = fileURLToPath(new URL('./partition-worker.mjs', import.meta.url));
  const allowed = await realpath(allowedDirectory);
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [
      '--experimental-permission', `--allow-fs-read=${worker}`, `--allow-fs-read=${allowed}`,
      worker, requestedFile
    ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: {} });
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new EvidenceAccessError('Evidence reader timed out')); }, 10_000);
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      if (output.length > 8_000_000) { child.kill(); reject(new EvidenceAccessError('Evidence exceeds size limit')); }
    });
    child.stderr.resume();
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        const result = JSON.parse(output) as { ok: boolean; value?: unknown; code?: string };
        if (code !== 0 || !result.ok) reject(new EvidenceAccessError(`Permissioned evidence read failed: ${result.code ?? 'UNKNOWN'}`));
        else resolveResult(result.value);
      } catch { reject(new EvidenceAccessError('Invalid evidence reader response')); }
    });
  });
}

export interface EvidenceView {
  readonly role: EvidenceRole;
  readonly hash: string;
  read(): Promise<unknown>;
  /** Only files inside this partition may be requested; traversal and symlinks fail. */
  readJsonFile(relativePath: string): Promise<unknown>;
}

/** Trusted coordinator only. Pass a role view or loaded data to each consumer. */
export async function openEvidenceCase(caseDirectory: string, runDirectory: string) {
  const root = await realpath(caseDirectory);
  const manifest = evidenceManifestSchema.parse(await permissionedJsonRead(root, join(root, 'case.json')));
  const runRoot = resolve(runDirectory);
  const folders = { synthesis: 'synthesis', gate: 'gate', sealed_eval: 'sealed-eval' } as const;
  const deny = async (role: EvidenceRole, reason: string): Promise<never> => {
    await mkdir(runRoot, { recursive: true });
    await appendFile(join(runRoot, 'evidence-violations.jsonl'), `${JSON.stringify({ role, reason })}\n`, 'utf8');
    throw new EvidenceAccessError(reason);
  };
  const view = (role: EvidenceRole): EvidenceView => Object.freeze({
    role, hash: manifest.partitions[role],
    async readJsonFile(name: string): Promise<unknown> {
      const partition = resolve(root, folders[role]);
      const requested = resolve(partition, name);
      if (isAbsolute(name) || !contained(partition, requested)) return deny(role, 'Partition traversal denied');
      const actualPartition = await realpath(partition);
      const actualFile = await realpath(requested);
      if (!contained(root, actualPartition) || !contained(actualPartition, actualFile)) return deny(role, 'Partition symlink escape denied');
      return permissionedJsonRead(actualPartition, actualFile);
    },
    async read(): Promise<unknown> {
      const data = await this.readJsonFile('evidence.json');
      if (hashJson(data) !== manifest.partitions[role]) return deny(role, 'Evidence hash mismatch');
      return data;
    }
  });
  const synthesis = view('synthesis');
  const gate = view('gate');
  return Object.freeze({
    manifest, synthesis, gate,
    async commitDecision(candidate: unknown, report: unknown, verdict: FrozenDecision['verdict']): Promise<FrozenDecision> {
      const parsedCandidate = jsonValueSchema.parse(candidate);
      const parsedReport = jsonValueSchema.parse(report);
      if (parsedReport === null || typeof parsedReport !== 'object' || Array.isArray(parsedReport)
        || parsedReport.plan_hash !== hashJson(parsedCandidate) || parsedReport.gate_evidence_hash !== manifest.partitions.gate
        || parsedReport.verdict !== verdict) throw new EvidenceAccessError('Decision does not match candidate, evidence and report');
      const decision = decisionSchema.parse({ version: 1, case_id: manifest.case_id,
        candidate_hash: hashJson(parsedCandidate), gate_evidence_hash: manifest.partitions.gate,
        report_hash: hashJson(parsedReport), verdict });
      await writeOnceJson(join(runRoot, 'candidate.json'), parsedCandidate);
      await writeOnceJson(join(runRoot, 'gate-report.json'), parsedReport);
      await writeOnceJson(join(runRoot, 'decision.json'), decision);
      return decision;
    },
    async openSealedEvaluation(): Promise<EvidenceView> {
      try {
        const decision = decisionSchema.parse(await readJson(join(runRoot, 'decision.json')));
        const candidate = await readJson(join(runRoot, 'candidate.json'));
        const report = await readJson(join(runRoot, 'gate-report.json'));
        if (decision.case_id !== manifest.case_id || decision.gate_evidence_hash !== manifest.partitions.gate
          || decision.candidate_hash !== hashJson(candidate) || decision.report_hash !== hashJson(report)) {
          return deny('sealed_eval', 'Frozen decision integrity failure');
        }
      } catch { return deny('sealed_eval', 'Sealed evidence requires a durable candidate and decision'); }
      return view('sealed_eval');
    }
  });
}

/** Authoring/freeze utility. Never expose this to synthesis or promotion workers. */
export async function freezeEvidenceCase(caseDirectory: string, caseId: string, heldOut: boolean): Promise<EvidenceManifest> {
  const synthesis = await readJson(join(caseDirectory, 'synthesis', 'evidence.json'));
  const gate = await readJson(join(caseDirectory, 'gate', 'evidence.json'));
  const sealed = await readJson(join(caseDirectory, 'sealed-eval', 'evidence.json'));
  const manifest = evidenceManifestSchema.parse({ version: 1, case_id: caseId, held_out: heldOut,
    partitions: { synthesis: hashJson(synthesis), gate: hashJson(gate), sealed_eval: hashJson(sealed) } });
  await writeOnceJson(join(caseDirectory, 'case.json'), manifest);
  return manifest;
}
