import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {cases} from '../cases.mjs';
import {assertProtected,sha,stageEvidence} from '../evaluation-integrity.mjs';
import {sessionOracle} from '../session-collab-v3/oracle.mjs';
const read=async path=>JSON.parse(await readFile(`benchmarks/realworld-v3/${path}`,'utf8'));
test('pre-change session-collab native evidence and all frozen partitions remain unchanged',async()=>{
 await assertProtected();const prefix='session-collab-v3/';
 const provenance=await read(`${prefix}provenance.json`);
 assert.equal(provenance.old_commit,'09faa20ad831ebb570490a785003a1c020f6fbfa');assert.equal(provenance.new_commit,'5b486324b5836cef4f5d547b4f1fb616c4c9a4ed');
 assert.equal((await read(`${prefix}traces/old-success.json`)).response.isError,false);
 const broken=await read(`${prefix}traces/direct-old-client-on-new.json`);assert.equal(broken.response.isError,true);assert.match(broken.response.content[0].text,/Unknown tool/);
 const control=await read(`${prefix}traces/native-new-control.json`);assert.equal(control.response.isError,false);assert.equal(control.call.arguments.action,'check');
 assert.equal((await read(`${prefix}gate-evidence/evidence.json`)).traces.length,2);assert.equal((await read(`${prefix}sealed/evidence.json`)).outcomes.length,3);
 for(const entry of cases){const coordinator=await stageEvidence(entry,`runs/realworld-v3/partition-test/${entry.id}`);await coordinator.synthesis.read();await coordinator.gate.read();await assert.rejects(coordinator.openSealedEvaluation());}
});
test('frozen unseen oracle accepts native wire captures and rejects changed membership or SQL writes',async()=>{
 const sealed=await read('session-collab-v3/sealed/evidence.json');
 for(const task of sealed.outcomes) {
  const native=JSON.parse(task.old_response.content[0].text);
  assert.equal(sessionOracle(task.input,native,task.independent),true);
  assert.equal(sessionOracle(task.input,{...native,file_status:{safe:[],blocked:[]}},task.independent),false);
  assert.equal(sessionOracle(task.input,native,{...task.independent,side_effect_count:1}),false);
 }
});
test('the exact authorized core extension is bound without resetting historical baselines',async()=>{
 const receipt=await read('core-extension.json');
 for(const change of receipt.files)assert.equal(sha((await readFile(change.current_path,'utf8')).replaceAll('\r\n','\n')),change.after_lf_sha256,change.current_path);
 for(const [path,hash] of Object.entries(receipt.new_core_source))assert.equal(sha((await readFile(path,'utf8')).replaceAll('\r\n','\n')),hash,path);
});
