import {cases,base} from './cases.mjs';
import {translationPlanSchema} from '../../packages/dsl/src/index.ts';
import {readJson,writeOnceJson} from '../../packages/contracts/src/artifacts.ts';
import console from 'node:console';
const diagnostics=[];
for(const entry of cases)for(let trial=1;trial<=3;trial++) {
  const id=`trial-${String(trial).padStart(3,'0')}`;
  const result=await readJson(`${base}/${entry.id}/results/${id}.json`);
  if(!result.generation_failed)continue;
  const response=await readJson(`${base}/${entry.id}/model-interactions/${id}/response.json`);
  const candidate=JSON.parse(response.text).candidate;
  const parsed=translationPlanSchema.safeParse(candidate);
  diagnostics.push({case:entry.id,trial,recorded_error:result.error_code,raw_candidate:candidate,issues:parsed.success?[]:parsed.error.issues});
}
await writeOnceJson(`${base}/results/generation-diagnostics.json`,{version:1,api_calls:0,method:'Unchanged translationPlanSchema.safeParse on retained provider responses; no candidate or result replacement',diagnostics});
console.log(JSON.stringify(diagnostics.map(d=>({case:d.case,trial:d.trial,issues:d.issues.map(i=>({path:i.path,message:i.message}))}))));
