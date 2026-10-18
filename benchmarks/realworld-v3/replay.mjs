import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {cases,base} from './cases.mjs';
import {assertProtected} from './evaluation-integrity.mjs';
import {hashJson} from '../../packages/contracts/src/index.ts';
import {atomicWriteJson} from '../../packages/contracts/src/artifacts.ts';
await assertProtected();
execFileSync(process.execPath,['--import=tsx',`${base}/evaluate.mjs`,'--replay'],{stdio:'inherit',windowsHide:true});
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const results=[];
for(const entry of cases)for(let trial=1;trial<=3;trial++) {
 const id=`trial-${String(trial).padStart(3,'0')}`;
 const original=await read(`${base}/${entry.id}/results/${id}.json`);
 const replay=await read(`runs/realworld-v3/replay/${entry.id}/${id}/result.json`);
 for(const name of ['accepted','generation_failed','hidden_passed','safe_rejection','hidden_false_compatible','verification_inconclusive'])assert.equal(replay[name],original[name],`${entry.id}/${id}/${name}`);
 assert.equal(hashJson(replay.candidate),hashJson(original.candidate));
 assert.equal(hashJson(replay.gate_report),hashJson(original.gate_report));
 results.push({case:entry.id,trial,matched:true,accepted:replay.accepted,generation_failed:replay.generation_failed,hidden_passed:replay.hidden_passed,safe_rejection:replay.safe_rejection,hidden_false_compatible:replay.hidden_false_compatible});
}
const receipt={version:1,api_calls:0,matched:true,results,audit:await assertProtected()};
await atomicWriteJson(`${base}/results/replay-validation.json`,receipt);
console.log(JSON.stringify({replayed:results.length,api_calls:0,matched:true}));
