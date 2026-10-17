import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { atomicWriteJson, readJson } from '../src/artifacts.js';
import { freezeEvidenceCase, openEvidenceCase, permissionedJsonRead } from '../src/evidence.js';
import { hashJson } from '../src/index.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'contractrelay-evidence-'));
  directories.push(root);
  const caseDir = join(root, 'case');
  for (const partition of ['synthesis', 'gate', 'sealed-eval']) {
    await atomicWriteJson(join(caseDir, partition, 'evidence.json'), { partition, sentinel: `${partition}-private` });
  }
  const manifest = await freezeEvidenceCase(caseDir, 'test-case', false);
  const run = join(root, 'run');
  const session = await openEvidenceCase(caseDir, run);
  const candidate = { version: 1, value: 'candidate' };
  const report = { plan_hash: hashJson(candidate), gate_evidence_hash: manifest.partitions.gate, verdict: 'PROMOTED' };
  return { root, caseDir, run, session, candidate, report };
}

describe('evidence partition and durable decision boundaries (TC-019)', () => {
  it('reads only the role partition and blocks sealed evidence before decision commit', async () => {
    const { session, run } = await fixture();
    expect(await session.synthesis.read()).toEqual({ partition: 'synthesis', sentinel: 'synthesis-private' });
    expect(await session.gate.read()).toEqual({ partition: 'gate', sentinel: 'gate-private' });
    await expect(session.openSealedEvaluation()).rejects.toMatchObject({ code: 'EVIDENCE_ACCESS_DENIED' });
    await expect(session.synthesis.readJsonFile('../sealed-eval/evidence.json')).rejects.toThrow('traversal');
    expect(await readFile(join(run, 'evidence-violations.jsonl'), 'utf8')).toContain('Partition traversal denied');
  });

  it('uses process permissions to deny a direct filesystem read outside the allowed partition', async () => {
    const { caseDir } = await fixture();
    await expect(permissionedJsonRead(join(caseDir, 'synthesis'), join(caseDir, 'sealed-eval', 'evidence.json')))
      .rejects.toThrow('ERR_ACCESS_DENIED');
  });

  it('rejects junction/symlink escapes', async () => {
    const { root, caseDir, session } = await fixture();
    const outside = join(root, 'outside');
    await mkdir(outside);
    await atomicWriteJson(join(outside, 'private.json'), { private: true });
    await symlink(outside, join(caseDir, 'synthesis', 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(session.synthesis.readJsonFile('escape/private.json')).rejects.toThrow('symlink escape');
  });

  it('unseals only after durable artifacts, including after process restart', async () => {
    const { caseDir, run, session, candidate, report } = await fixture();
    await session.commitDecision(candidate, report, 'PROMOTED');
    const resumed = await openEvidenceCase(caseDir, run);
    expect(await (await resumed.openSealedEvaluation()).read()).toEqual({ partition: 'sealed-eval', sentinel: 'sealed-eval-private' });
    expect(await readJson(join(run, 'candidate.json'))).toEqual(candidate);
    // Synthesis stays restricted even after the evaluator is authorized.
    await expect(resumed.synthesis.readJsonFile('../sealed-eval/evidence.json')).rejects.toThrow();
  });

  it('rejects modified evidence and candidate/report tampering', async () => {
    const { caseDir, run, session, candidate, report } = await fixture();
    await session.commitDecision(candidate, report, 'PROMOTED');
    await atomicWriteJson(join(run, 'candidate.json'), { changed: true });
    await expect(session.openSealedEvaluation()).rejects.toThrow();
    await atomicWriteJson(join(caseDir, 'gate', 'evidence.json'), { changed: true });
    await expect(session.gate.read()).rejects.toThrow('hash mismatch');
  });

  it('cannot replace an already frozen decision or commit a mismatched report', async () => {
    const { session, candidate, report } = await fixture();
    await expect(session.commitDecision(candidate, { ...report, plan_hash: '0'.repeat(64) }, 'PROMOTED')).rejects.toThrow('does not match');
    await session.commitDecision(candidate, report, 'PROMOTED');
    await expect(session.commitDecision(candidate, { ...report, verdict: 'REJECTED' }, 'REJECTED')).rejects.toThrow();
  });
});
