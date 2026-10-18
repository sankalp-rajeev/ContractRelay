import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {cases,base} from '../cases.mjs';
import {sha} from '../evaluation-integrity.mjs';
const read=async path=>JSON.parse(await readFile(`${base}/${path}`,'utf8'));
test('all nine fresh trials are retained in the predeclared order under the shared hard cap',async()=>{
 const budget=await read('results/budget.json');assert.equal(budget.limit_nano_usd,1e9);assert.equal(budget.requests.length,9);
 assert.equal(new Set(budget.requests.map(request=>request.job_id)).size,9);
 assert(budget.requests.reduce((sum,r)=>sum+(r.actual_nano_usd??r.reserved_nano_usd),0)<=1e9);
 assert.deepEqual(budget.requests.map(r=>r.job_id.split('/')[1]),['mapbox-v3','mapbox-v3','mapbox-v3','fabric-v3','fabric-v3','fabric-v3','session-collab-v3','session-collab-v3','session-collab-v3']);
 const summary=await read('results/summary.json');assert.equal(summary.budget.calls,9);assert.equal(summary.budget.input_tokens,18285);assert.equal(summary.budget.output_tokens,1975);assert.equal(summary.budget.thinking_tokens,16973);
 assert.equal(summary.budget.known_cost_usd,0.08476875);
 for(const entry of cases)for(let trial=1;trial<=3;trial++) {
  const result=await read(`${entry.id}/results/trial-${String(trial).padStart(3,'0')}.json`);
  assert.equal(result.identity.prompt_version,'bounded-plan-v7');assert.equal(result.hidden_false_compatible,false);
 }
});
test('malformed Mapbox generation remains a failure and all unseen decisions remain explicit rejections',async()=>{
 const failed=await read('mapbox-v3/results/trial-003.json');assert.equal(failed.generation_failed,true);assert.equal(failed.safe_rejection,false);assert.equal(failed.gate_report.verdict,'INCONCLUSIVE');
 const response=await read('mapbox-v3/model-interactions/trial-003/response.json');assert.throws(()=>JSON.parse(response.text));
 for(let trial=1;trial<=3;trial++) {const result=await read(`session-collab-v3/results/trial-${String(trial).padStart(3,'0')}.json`);assert.equal(result.candidate.op,'Reject');assert.equal(result.accepted,false);assert.equal(result.safe_rejection,true);assert.equal(result.observations.length,0);}
});
test('all evaluated receipts retain their recorded hashes, including the raw failed generation',async()=>{
 const frozen=await read('results-frozen.json');
 for(const [path,expected] of Object.entries(frozen.files))assert.equal(sha((await readFile(path,'utf8')).replaceAll('\r\n','\n')),expected,path);
});
