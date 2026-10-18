import assert from 'node:assert/strict';
import {readFile,mkdir,readdir} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {readJson,writeOnceJson} from '../../packages/contracts/src/artifacts.ts';
import {hashJson} from '../../packages/contracts/src/index.ts';
import {openEvidenceCase} from '../../packages/contracts/src/evidence.ts';
const base='benchmarks/realworld-v1';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function assertFlagshipUnchanged() {
  const guard=await readJson(join(base,'flagship-integrity.json'));
  for(const [path,expected] of Object.entries(guard.files))assert.equal(digest((await readFile(path,'utf8')).replaceAll('\r\n','\n')),expected,`FLAGSHIP_CHANGED: ${path}`);
  assert.equal((await readJson('benchmarks/results/final-v3.json')).results.length,195);
  return hashJson(guard);
}
export async function extensionFingerprint() {
  const files={};
  const walk=async path=>{for(const entry of await readdir(path,{withFileTypes:true})){
    if(['results','node_modules'].includes(entry.name))continue;
    const target=join(path,entry.name);
    if(entry.isDirectory())await walk(target);
    else if(/\.(mjs|ts|py|lock|json)$/.test(entry.name)||entry.name==='Dockerfile')files[relative(base,target).replaceAll('\\','/')]=digest((await readFile(target,'utf8')).replaceAll('\r\n','\n'));
  }};
  await walk(base);return hashJson(files);
}
export async function stageEvidence(entry,runRoot) {
  const source=join(base,entry.id);const staged=join('runs/realworld-v1/staged-evidence',entry.id);
  const manifest=await readJson(join(source,'case.json'));
  await mkdir(staged,{recursive:true});
  for(const [folder,target,role] of [['synthesis-evidence','synthesis','synthesis'],['gate-evidence','gate','gate'],['sealed','sealed-eval','sealed_eval']]) {
    const data=await readJson(join(source,folder,'evidence.json'));assert.equal(hashJson(data),manifest.partitions[role]);
    await writeOnceJson(join(staged,target,'evidence.json'),data);
  }
  await writeOnceJson(join(staged,'case.json'),manifest);
  return openEvidenceCase(staged,runRoot);
}
