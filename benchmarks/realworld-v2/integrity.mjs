import assert from 'node:assert/strict';
import process from 'node:process';
import {readFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {base} from './cases.mjs';
import {readJson,writeOnceJson} from '../../packages/contracts/src/artifacts.ts';
import {hashJson} from '../../packages/contracts/src/index.ts';
import {openEvidenceCase} from '../../packages/contracts/src/evidence.ts';
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function assertProtected() {
  const receipt=await readJson(join(base,'protected-before.json'));
  for(const [path,expected] of Object.entries(receipt.files)) {
    const bytes=await readFile(path);
    assert.equal(sha(bytes.toString('utf8').replaceAll('\r\n','\n')),receipt.lf_files[path],`PROTECTED_CONTENT_CHANGED: ${path}`);
    if(process.platform==='win32')assert.equal(sha(bytes),expected,`PROTECTED_BYTES_CHANGED: ${path}`);
  }
  assert.equal((await readJson('benchmarks/results/final-v3.json')).results.length,195);
  return {protected_files:Object.keys(receipt.files).length,raw_aggregate:receipt.raw_aggregate,lf_aggregate:receipt.lf_aggregate,unchanged:true};
}
export async function harnessFingerprint() {
  const files={};
  for(const name of ['run.mjs','integrity.mjs','transport.mjs','fixture.mjs','oracle.mjs'])files[name]=sha((await readFile(join(base,name),'utf8')).replaceAll('\r\n','\n'));
  // Entry definitions are bound individually in each case manifest. Adding an
  // unevaluated repository later must not rewrite an earlier trial identity.
  return hashJson(files);
}
export async function stageEvidence(entry,runRoot) {
  const source=join(base,entry.id),staged=join('runs/realworld-v2/staged-evidence',entry.id);
  const manifest=await readJson(join(source,'case.json'));await mkdir(staged,{recursive:true});
  assert.equal(hashJson(entry),manifest.entry_hash,'CASE_DEFINITION_DRIFT');
  assert.equal(sha((await readFile(join(source,'oracle.mjs'),'utf8')).replaceAll('\r\n','\n')),manifest.oracle_sha256,'ORACLE_DRIFT');
  for(const [folder,target,role] of [['synthesis-evidence','synthesis','synthesis'],['gate-evidence','gate','gate'],['sealed','sealed-eval','sealed_eval']]) {
    const data=await readJson(join(source,folder,'evidence.json'));assert.equal(hashJson(data),manifest.partitions[role]);
    await writeOnceJson(join(staged,target,'evidence.json'),data);
  }
  await writeOnceJson(join(staged,'case.json'),{version:manifest.version,case_id:manifest.case_id,held_out:manifest.held_out,partitions:manifest.partitions});return openEvidenceCase(staged,runRoot);
}
