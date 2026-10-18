import assert from 'node:assert/strict';
import {readFile,readdir,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import console from 'node:console';
import process from 'node:process';
import {base,cases} from './cases.mjs';
import {assertProtected,harnessFingerprint,sha} from './evaluation-integrity.mjs';
import {readJson,writeOnceJson,atomicWriteJson} from '../../packages/contracts/src/artifacts.ts';
const sourceHash=await harnessFingerprint(),summaryCases=[],all=[];
const protocol=await readJson(`${base}/protocol.json`);
const offline=process.argv.includes('--offline');
for(const entry of cases) {
  const runs=[];
  for(let trial=1;trial<=3;trial++) {
    const id=`trial-${String(trial).padStart(3,'0')}`;
    const result=await readJson(`${base}/${entry.id}/results/${id}.json`);
    assert.equal(result.identity.source_hash,sourceHash,'FROZEN_HARNESS_DRIFT');runs.push(result);all.push(result);
    const source=join('runs/realworld-v3/models/realworld-v3',entry.id,'b3',id);
    const target=join(base,entry.id,'model-interactions',id);
    const copy=async(folder,sub='')=>{for(const item of await readdir(join(folder,sub),{withFileTypes:true})) {
      const path=join(sub,item.name);
      if(item.isDirectory())await copy(folder,path);
      else if(['request.json','response.json','run.json','artifact.json','error.json'].includes(item.name))await writeOnceJson(join(target,path),await readJson(join(folder,path)));
    }};
    if(!offline) {
      try {await copy(source);}
      catch(error){if(error.code!=='ENOENT')throw error;}
    }
    // Fresh checkouts retain every interaction in Git. They do not need the
    // original ignored scheduler directory to regenerate measured aggregates.
    for(const name of ['request.json','run.json'])await readJson(join(target,name));
    if(!result.generation_failed)await readJson(join(target,'response.json'));
  }
  summaryCases.push({project:entry.id,upstream_project:entry.project,name:entry.name,evaluation_kind:entry.evaluationKind,repository:entry.repository,old_commit:entry.old,new_commit:entry.new,old_tag:entry.oldTag,new_tag:entry.newTag,
    old_server_old_client:'PASS',new_server_old_client_direct:'BREAKS',trials:runs.length,successful:runs.filter(r=>r.hidden_passed).length,promoted:runs.filter(r=>r.accepted).length,
    safe_rejections:runs.filter(r=>r.safe_rejection).length,hidden_false_compatible:runs.filter(r=>r.hidden_false_compatible).length,generation_failures:runs.filter(r=>r.generation_failed).length,verification_inconclusive:runs.filter(r=>r.verification_inconclusive).length,limitations:entry.runtimeKind==='session-collab'?[...entry.limitations,protocol.known_pre_evaluation_limitation,protocol.preserved_unseen_oracle_limitation]:entry.limitations});
}
let budget;
if(offline)budget=await readJson(join(base,'results/budget.json'));
else {
  try {budget=await readJson('runs/realworld-v3/models/external-budget.json');}
  catch(error){if(error.code!=='ENOENT')throw error;budget=await readJson(join(base,'results/budget.json'));}
}
const charged=budget.requests.reduce((sum,r)=>sum+(r.actual_nano_usd??r.reserved_nano_usd),0);assert(charged<=1e9);
const totals={calls:budget.requests.length,input_tokens:0,output_tokens:0,thinking_tokens:0,known_cost_usd:0,unknown_usage_requests:0,charged_or_reserved_usd:charged/1e9};
for(const request of budget.requests) {
  if(request.usage)for(const key of ['input_tokens','output_tokens','thinking_tokens'])totals[key]+=request.usage[key];
  else totals.unknown_usage_requests++;
  totals.known_cost_usd+=(request.actual_nano_usd??0)/1e9;
}
const summary={version:3,pre_capability_freeze_commit:protocol.freeze_commit,evaluation_order:protocol.order,kind:'public-historical-mcp-external-validity',source_hash:sourceHash,cases:summaryCases,budget:totals};
await mkdir(join(base,'results'),{recursive:true});
await atomicWriteJson(join(base,'results/summary.json'),summary);
await writeOnceJson(join(base,'results/budget.json'),budget);
await atomicWriteJson(join(base,'results/protected-audit.json'),await assertProtected());
const files={};
const walk=async path=>{for(const item of await readdir(path,{withFileTypes:true})) {
  const target=join(path,item.name);
  if(item.isDirectory())await walk(target);
  else if(!['frozen-files.json','supplemental-files.json','results-frozen.json'].includes(item.name)&&!target.endsWith('protected-audit.json')&&!/\.(md)$/.test(target)&&item.name!=='report.mjs'&&item.name!=='acquire.mjs')
    files[target.replaceAll('\\','/')]=sha((await readFile(target,'utf8')).replaceAll('\r\n','\n'));
}};
await walk(base);
try {
  const frozen=await readJson(join(base,'results-frozen.json'));
  for(const [path,expected] of Object.entries(frozen.files))assert.equal(files[path],expected,`NEW_EXTENSION_ARTIFACT_DRIFT: ${path}`);
  const added=Object.fromEntries(Object.entries(files).filter(([path])=>!Object.hasOwn(frozen.files,path)));
  try {const supplemental=await readJson(join(base,'supplemental-files.json'));for(const [path,expected] of Object.entries(supplemental.files))assert.equal(files[path],expected,`SUPPLEMENTAL_VALIDATION_DRIFT: ${path}`);}
  catch(error){if(error.code!=='ENOENT')throw error;if(Object.keys(added).length)await writeOnceJson(join(base,'supplemental-files.json'),{version:1,scope:'Additive post-evaluation validation; all original results and pre-change evidence remain unchanged',files:added});}
}
catch(error){if(error.code!=='ENOENT')throw error;await writeOnceJson(join(base,'results-frozen.json'),{version:1,algorithm:'sha256-utf8-lf',files});}
console.log(JSON.stringify({cases:summaryCases.map(c=>({id:c.project,recovered:c.successful,safe_rejections:c.safe_rejections,generation_failures:c.generation_failures,false_compatible:c.hidden_false_compatible})),budget:totals}));
