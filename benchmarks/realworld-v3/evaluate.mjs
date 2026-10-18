import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL,URL} from 'node:url';
import {join} from 'node:path';
import process from 'node:process';
import console from 'node:console';
import {cases,snapshotOptions} from './cases.mjs';
import {makeFixture,mechanicalOracle} from './fixture.mjs';
import {Client,InMemoryTransport,unwrap,assertSnapshot} from './transport.mjs';
import {assertProtected,harnessFingerprint,stageEvidence} from './evaluation-integrity.mjs';
import {BudgetedProvider} from '../realworld-v1/budget.mjs';
import {readJson,writeOnceJson,atomicWriteJson} from '../../packages/contracts/src/artifacts.ts';
import {hashJson} from '../../packages/contracts/src/index.ts';
import {GeminiProvider,QuotaScheduler,isTransientModelFailure} from '../../packages/synthesizer/src/index.ts';
import {synthesizeIsolated} from '../../packages/synthesizer/src/isolated.ts';
import {verifyIsolated} from '../../packages/verifier/src/isolated.ts';
import {PromotionRegistry} from '../../packages/runtime/src/index.ts';
import {createCompatibilityServer} from '../../packages/mcp/src/proxy.ts';
import {parseStructuralCandidate,structuralSynthesisPromptVersion} from '../../packages/synthesizer/src/structural.ts';

const args=process.argv.slice(2);const selected=args.includes('--case')?args[args.indexOf('--case')+1]:null;
if(selected&&!cases.some(entry=>entry.id===selected))throw new Error('UNKNOWN_REALWORLD_CASE');
const replay=args.includes('--replay'),evaluate=args.includes('--evaluate'),validate=args.includes('--validate');
if(Number(replay)+Number(evaluate)+Number(validate)!==1)throw new Error('Choose exactly one of --validate, --evaluate or --replay');
await assertProtected();
const fingerprint=await harnessFingerprint();const modelRoot='runs/realworld-v3/models';
let scheduler,budget;
if(evaluate){
  const require=createRequire(new URL('../../packages/synthesizer/package.json',import.meta.url));
  const {GoogleGenAI}=await import(pathToFileURL(require.resolve('@google/genai')).href);
  const client=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY??'',vertexai:false,httpOptions:{timeout:60000}});
  let usage=null;
  const inner=new GeminiProvider(process.env.GEMINI_API_KEY??'',async request=>{
    const response=await client.models.generateContent(request);
    const raw=response.usageMetadata;
    usage=raw?{input_tokens:raw.promptTokenCount,output_tokens:raw.candidatesTokenCount??0,thinking_tokens:raw.thoughtsTokenCount??0,model_version:response.modelVersion??null}:null;
    return response;
  });
  budget=new BudgetedProvider(modelRoot,inner,{reset:()=>{usage=null;},get:()=>usage});
  scheduler=new QuotaScheduler(modelRoot,budget,{model:'gemini-3.8-flash',rpm:1000,tpm:2000000,rpdHard:10,rpdSoft:10},
    {cache:false,maxRetries:0,maxConcurrency:3,retainFailed:true,retryTransient:true,pauseOnTransient:true});
}
const results=[];
for(const entry of cases.filter(entry=>!selected||entry.id===selected)) {
  if(evaluate)for(const earlier of cases.slice(0,cases.indexOf(entry)))for(let trial=1;trial<=3;trial++)await readJson(`benchmarks/realworld-v3/${earlier.id}/results/trial-${String(trial).padStart(3,'0')}.json`);
  const provenance=await readJson(`benchmarks/realworld-v3/${entry.id}/provenance.json`);
  const manifest=await readJson(`benchmarks/realworld-v3/${entry.id}/case.json`);
  if(validate){
    const coordinator=await stageEvidence(entry,`runs/realworld-v3/validation/${entry.id}`);
    await coordinator.synthesis.read();await coordinator.gate.read();
    await assert.rejects(coordinator.openSealedEvaluation(),/durable candidate|Frozen decision/);
    await assert.rejects(coordinator.synthesis.readJsonFile('../sealed-eval/evidence.json'),/traversal/);
    console.log(JSON.stringify({case:entry.id,evidence_partitions:'PASS',sealed_before_decision:'DENIED'}));continue;
  }
  const kind=replay?'replay':'evaluation';
  for(let trial=1;trial<=3;trial++) {
    const id=`trial-${String(trial).padStart(3,'0')}`;const root=join('runs/realworld-v3',kind,entry.id,id);
    const published=join('benchmarks/realworld-v3',entry.id,'results',`${id}.json`);
    const identity={version:3,case_id:entry.id,evaluation_kind:entry.evaluationKind,prompt_version:structuralSynthesisPromptVersion,case_hash:hashJson(manifest),source_hash:fingerprint,provenance_hash:hashJson(provenance),model:'gemini-3.8-flash',trial};
    if(evaluate)await writeOnceJson(join(root,'run-manifest.json'),identity);
    else {const original=await readJson(published);assert.equal(original.identity.source_hash,fingerprint,'FROZEN_HARNESS_DRIFT');assert.equal(original.identity.case_hash,identity.case_hash);}
    if(evaluate){
      try{const saved=await readJson(published);assert.equal(saved.identity.source_hash,fingerprint);assert.equal(saved.identity.case_hash,identity.case_hash);results.push(saved);console.log(JSON.stringify({case:entry.id,trial,resumed:true}));continue;}
      catch(error){if(error.code!=='ENOENT')throw error;}
    }
    const coordinator=await stageEvidence(entry,root);const evidence=await coordinator.synthesis.read();const gate=await coordinator.gate.read();
    let candidate,generationFailed=false,errorCode=null;
    if(replay) {
      const original=await readJson(published);candidate=original.candidate;generationFailed=original.generation_failed;errorCode=original.error_code;
      if(generationFailed) {
        let response;
        try{response=await readJson(`benchmarks/realworld-v3/${entry.id}/model-interactions/${id}/response.json`);}catch(error){if(error.code!=='ENOENT')throw error;}
        if(response)assert.throws(()=>parseStructuralCandidate(JSON.parse(response.text),evidence),'RETAINED_INVALID_GENERATION_NOW_PASSES');
        else assert.equal((await readJson(`benchmarks/realworld-v3/${entry.id}/model-interactions/${id}/run.json`)).error_code,errorCode);
      }
    }
    else {
      budget.jobId=`realworld-v3/${entry.id}/b3/${id}`;
      try{candidate=await synthesizeIsolated(scheduler,evidence,{jobId:budget.jobId,mode:'final',model:'gemini-3.8-flash',resume:true,capabilities:'structural-v1'});}
      catch(error){
        const code=error.code??'SYNTHESIS_FAILED';
        if(isTransientModelFailure(code)||/BUDGET|QUOTA|TOKEN_BOUND|ISOLATED_WORKER/.test(code))throw error;
        generationFailed=true;errorCode=code;
        candidate={version:1,op:'Reject',reason:'No valid generated candidate; retained model response is a failed trial',missing_evidence:[],risk:'Generation failure is not a safe rejection'};
      }
    }
    const fixture=await makeFixture(entry);let report,key;
    await assertSnapshot(entry,'new',fixture.client());
    try {
      const verification={plan:candidate,oldContract:evidence.oldContract,newContract:evidence.newContracts,gateEvidence:gate,invoke:fixture.invoke,policyVersion:entry.policy,fixture};
      report=generationFailed?{plan_hash:hashJson(candidate),gate_evidence_hash:manifest.partitions.gate,verdict:'INCONCLUSIVE',error_code:errorCode}:await verifyIsolated(verification);
      await coordinator.commitDecision(candidate,report,report.verdict);
      const registry=new PromotionRegistry(join(root,'registry'));
      if(report.verdict==='PROMOTED')key=await registry.promote({...verification,report});
      const gateState=await fixture.observe();
      const sealed=await (await coordinator.openSealedEvaluation()).read();const observations=[];
      if(key)for(const task of sealed.outcomes){
        await fixture.reset();const before=await fixture.observe();
        const proxy=createCompatibilityServer({oldContract:evidence.oldContract,registry,key,target:fixture.client(),snapshot:snapshotOptions(entry,'new'),
          targetTools:[entry.newTool],executionEnvironment:'isolated-fixture'});
        const client=new Client({name:'unchanged-historical-client',version:'1.0.0'});
        const [serverTransport,clientTransport]=InMemoryTransport.createLinkedPair();
        let output=null,callFailed=false;const workflow=[],replayOutputs=[];
        try {
          await proxy.connect(serverTransport);await client.connect(clientTransport);
          for(let replayIndex=0;replayIndex<task.replays;replayIndex++){
            const call={name:entry.oldTool,arguments:task.input};
            const response=await client.callTool(call);workflow.push({call,response});output=unwrap(response);replayOutputs.push(output);
          }
        }catch(error){callFailed=true;workflow.push({error:error.message});}
        finally{await client.close();await proxy.close();}
        const state=await fixture.observe();
        const replayPassed=await Promise.all(replayOutputs.map(async value=>hashJson(value)===hashJson(task.expected_output)&&await mechanicalOracle(entry,task.input,value,task.independent)));
        const passed=!callFailed&&replayOutputs.length===task.replays&&replayPassed.every(Boolean)&&hashJson(state)===hashJson(task.expected_state)&&hashJson(before)===hashJson(state);
        observations.push({id:task.id,input:task.input,output,state,workflow,replay_outputs:replayOutputs,passed});
      }
      const result={version:1,identity,candidate,gate_report:report,accepted:Boolean(key),generation_failed:generationFailed,error_code:errorCode,
        hidden_passed:Boolean(key)&&observations.length===sealed.outcomes.length&&observations.every(item=>item.passed),
        safe_rejection:!key&&!generationFailed&&report.verdict==='REJECTED'&&gateState.writable_layer_changes.length===0&&(gateState.side_effect_count??0)===0,
        verification_inconclusive:!generationFailed&&report.verdict==='INCONCLUSIVE',
        hidden_false_compatible:Boolean(key)&&observations.some(item=>!item.passed),gate_new_tool_calls:fixture.callCount(),observations};
      if(replay){const original=await readJson(published);for(const key of ['accepted','generation_failed','hidden_passed','safe_rejection','hidden_false_compatible'])assert.equal(result[key],original[key],`REPLAY_DRIFT: ${entry.id}/${trial}/${key}`);}
      else await writeOnceJson(published,result);
      await writeOnceJson(join(root,'result.json'),result);results.push(result);
      console.log(JSON.stringify({case:entry.id,trial,promoted:result.accepted,hidden_passed:result.hidden_passed,safe_rejection:result.safe_rejection}));
    }finally{await fixture.close();}
  }
}
await assertProtected();
if(!validate){
  const summary={version:1,kind:'public-historical-mcp-external-validity',source_hash:fingerprint,
    cases:cases.filter(entry=>!selected||entry.id===selected).map(entry=>{const runs=results.filter(result=>result.identity.case_id===entry.id);return {project:entry.id,repository:entry.repository,old_commit:entry.old,new_commit:entry.new,
      old_server_old_client:'PASS',new_server_old_client_direct:'BREAKS',trials:runs.length,successful:runs.filter(run=>run.hidden_passed).length,
      promoted:runs.filter(run=>run.accepted).length,safe_rejections:runs.filter(run=>run.safe_rejection).length,hidden_false_compatible:runs.filter(run=>run.hidden_false_compatible).length,
      generation_failures:runs.filter(run=>run.generation_failed).length,limitations:entry.limitations};})};
  if(evaluate)summary.budget=await budget.state();
  await atomicWriteJson(`runs/realworld-v3/${replay?'replay':'evaluation'}/summary${selected?`-${selected}`:''}.json`,summary);
}
