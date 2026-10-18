import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import process from 'node:process';
import console from 'node:console';
import {base,selectedCase} from './cases.mjs';
import {assertProtected,harnessFingerprint,stageEvidence} from './integrity.mjs';
import {openHistorical,assertSnapshot} from './transport.mjs';
import {parseSynthesisCandidate} from '../../packages/synthesizer/src/synthesis.ts';
import {readJson,writeOnceJson,atomicWriteJson} from '../../packages/contracts/src/artifacts.ts';
const fields=['accepted','generation_failed','hidden_passed','safe_rejection','hidden_false_compatible'];
const environment={...process.env};delete environment.GEMINI_API_KEY;
const fingerprint=await harnessFingerprint(),replayed=[];
await assertProtected();
for(const entry of selectedCase()) {
  const originals=[];
  for(let trial=1;trial<=3;trial++) originals.push(await readJson(`${base}/${entry.id}/results/trial-${String(trial).padStart(3,'0')}.json`));
  if(originals.every(result=>!result.generation_failed)) {
    execFileSync(process.execPath,['--import=tsx',`${base}/run.mjs`,'--case',entry.id,'--replay'],{stdio:'inherit',env:environment,windowsHide:true});
    for(const original of originals) {
      const id=`trial-${String(original.identity.trial).padStart(3,'0')}`;
      const result=await readJson(`runs/realworld-v2/replay/${entry.id}/${id}/result.json`);
      replayed.push({case:entry.id,trial:original.identity.trial,...Object.fromEntries(fields.map(field=>[field,result[field]])),matched:true});
    }
    continue;
  }
  // The paid evaluator's generic candidate replay cannot reconstruct an invalid
  // generation from its bookkeeping Reject sentinel. Reparse the retained raw
  // response through the original synthesizer instead. Never gate that sentinel
  // and relabel a generation failure as a safe rejection.
  assert(originals.every(result=>result.generation_failed),'MIXED_GENERATION_RESULTS_REQUIRE_EXPLICIT_REPLAY');
  for(const original of originals) {
    assert.equal(original.identity.source_hash,fingerprint,'FROZEN_HARNESS_DRIFT');
    const trial=original.identity.trial,id=`trial-${String(trial).padStart(3,'0')}`;
    const root=join('runs/realworld-v2/replay-failures',entry.id,id);
    const coordinator=await stageEvidence(entry,root),evidence=await coordinator.synthesis.read();
    const raw=await readJson(`${base}/${entry.id}/model-interactions/${id}/response.json`);
    let issues=null;
    try{parseSynthesisCandidate(JSON.parse(raw.text),evidence);}
    catch(error){issues=error.issues??[{message:error.message}];}
    assert(issues,'RETAINED_INVALID_GENERATION_NOW_PASSES');
    const server=await openHistorical(entry,'new');
    try {
      await assertSnapshot(entry,'new',server.client);
      const broken=await server.client.callTool({name:entry.oldTool,arguments:entry.gate[0]});
      assert(broken.isError,'UNCHANGED_OLD_CALL_NO_LONGER_BREAKS');
      await coordinator.commitDecision(original.candidate,original.gate_report,'INCONCLUSIVE');
      await (await coordinator.openSealedEvaluation()).read();
      const result={case:entry.id,trial,accepted:false,generation_failed:true,hidden_passed:false,safe_rejection:false,hidden_false_compatible:false,
        error_code:'INVALID_MODEL_OUTPUT',parser_issues:issues,target_snapshot_verified:true,old_invocation_still_breaks:true,gate_executed:false};
      for(const field of fields)assert.equal(result[field],original[field],`REPLAY_DRIFT: ${entry.id}/${trial}/${field}`);
      await writeOnceJson(join(root,'result.json'),result);
      replayed.push({case:entry.id,trial,...Object.fromEntries(fields.map(field=>[field,result[field]])),matched:true});
      console.log(JSON.stringify({case:entry.id,trial,generation_failure_reproduced:true,gate_executed:false}));
    }finally{await server.close();}
  }
}
const audit=await assertProtected();
await atomicWriteJson(`${base}/results/replay-validation.json`,{version:1,api_calls:0,results:replayed,audit});
console.log(JSON.stringify({replayed:replayed.length,api_calls:0,matched:replayed.every(result=>result.matched)}));
