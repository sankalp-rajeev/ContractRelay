import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {base,cases} from '../cases.mjs';
import {sha,stageEvidence} from '../integrity.mjs';
import {translationPlanSchema} from '../../../packages/dsl/src/index.ts';
import {readJson} from '../../../packages/contracts/src/artifacts.ts';
test('six independent requests include invalid generations and remain under the hard budget',async()=>{
  const state=await readJson(`${base}/results/budget.json`),summary=await readJson(`${base}/results/summary.json`);
  assert.equal(state.limit_nano_usd,1e9);assert.equal(state.requests.length,6);
  assert.equal(new Set(state.requests.map(r=>r.job_id)).size,6);
  assert(state.requests.reduce((s,r)=>s+(r.actual_nano_usd??r.reserved_nano_usd),0)<=1e9);
  assert.equal(summary.budget.input_tokens,10794);assert.equal(summary.budget.output_tokens,806);assert.equal(summary.budget.thinking_tokens,6641);
  assert.equal(summary.budget.known_cost_usd,0.03602175);
});
test('invalid Fabric outputs really fail the unchanged hyphenated-field grammar',async()=>{
  for(let trial=1;trial<=3;trial++) {
    const id=`trial-${String(trial).padStart(3,'0')}`;
    const response=await readJson(`${base}/fabric/model-interactions/${id}/response.json`);
    const parsed=translationPlanSchema.safeParse(JSON.parse(response.text).candidate);
    assert.equal(parsed.success,false);
    assert.deepEqual(parsed.error.issues.map(i=>i.path),[['steps',1,'from'],['steps',1,'to']]);
    const result=await readJson(`${base}/fabric/results/${id}.json`);
    assert.equal(result.generation_failed,true);assert.equal(result.safe_rejection,false);
    assert.equal(result.gate_report.verdict,'INCONCLUSIVE');assert.equal(result.hidden_false_compatible,false);
  }
});
test('frozen evaluated files cannot drift, including the raw provider failures',async()=>{
  const frozen=await readJson(`${base}/frozen-files.json`);
  for(const [path,expected] of Object.entries(frozen.files))assert.equal(sha((await readFile(path,'utf8')).replaceAll('\r\n','\n')),expected,path);
});
test('every new case retains separate hashed synthesis and gate evidence',async()=>{
  for(const entry of cases) {
    const coordinator=await stageEvidence(entry,`runs/realworld-v2/test-partitions/${entry.id}`);
    await coordinator.synthesis.read();await coordinator.gate.read();
    await assert.rejects(coordinator.openSealedEvaluation(),/durable candidate|Frozen decision/);
  }
});
