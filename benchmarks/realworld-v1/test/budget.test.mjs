import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BudgetedProvider} from '../budget.mjs';
const request={model:'gemini-3.8-flash',prompt:'public fixture',schema:{},maxOutputTokens:4096,temperature:0.2};
test('unknown request reserves its full cost across restart and prevents overspend',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'contractrelay-external-budget-'));
 try {
  let calls=0;const inner={generate:async()=>{calls++;throw Object.assign(new Error('offline'),{code:'HTTP_503'});}};
  const meter={reset(){},get:()=>null};
  const first=new BudgetedProvider(dir,inner,meter,0.02);
  await assert.rejects(first.generate(request),{code:'HTTP_503'});
  const restarted=new BudgetedProvider(dir,inner,meter,0.02);
  await assert.rejects(restarted.generate(request),{code:'EXTERNAL_BUDGET_EXCEEDED'});
  assert.equal(calls,1);assert.equal((await restarted.state()).requests[0].status,'unknown');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('counts thinking separately and never charges a reused response again',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'contractrelay-external-tokens-'));
 try {
  const usage={input_tokens:10,output_tokens:20,thinking_tokens:30};
  const provider=new BudgetedProvider(dir,{generate:async()=>({text:'{}',inputTokens:10,outputTokens:50})},{reset(){},get:()=>usage});
  await provider.generate(request);const state=await provider.state();
  assert.equal(state.requests[0].actual_nano_usd,195000);assert.deepEqual(state.requests[0].usage,usage);
  assert.deepEqual(await new BudgetedProvider(dir,{},{}).state(),state);
  assert.throws(()=>new BudgetedProvider(dir,{}, {},1.01),/INVALID_EXTERNAL_BUDGET/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
