import { Buffer } from 'node:buffer';
import { join } from 'node:path';
import { canonicalJson,hashJson } from '../../packages/contracts/src/index.ts';
import { atomicWriteJson,readJson } from '../../packages/contracts/src/artifacts.ts';
import { ModelRequestError } from '../../packages/synthesizer/src/model.ts';

export const pricing = { source:'https://ai.google.dev/gemini-api/docs/pricing', verified_at:'2026-10-18',
  input_usd_per_million:0.75,output_and_thinking_usd_per_million:3.75,
  output_cap_source:'https://discuss.ai.google.dev/t/gemini-3-8-flash-high-does-maxoutputtokens-include-thinking-tokens/181077' };

/** Called inside the unchanged scheduler's exclusive lease; no hidden retries.
 * Unknown or interrupted requests retain their entire conservative reservation. */
export class BudgetedProvider {
  constructor(directory,inner,usage,hardLimitUsd=1) {
    if(!Number.isFinite(hardLimitUsd)||hardLimitUsd<=0||hardLimitUsd>1) throw new Error('INVALID_EXTERNAL_BUDGET');
    this.path=join(directory,'external-budget.json');this.inner=inner;this.usage=usage;this.limit=Math.round(hardLimitUsd*1e9);this.jobId=null;
  }
  async state() {
    try {const state=await readJson(this.path);if(state.limit_nano_usd!==this.limit)throw new Error('BUDGET_LIMIT_DRIFT');return state;}
    catch(error){if(error.code!=='ENOENT')throw error;return {version:1,limit_nano_usd:this.limit,pricing,requests:[]};}
  }
  async generate(request) {
    if(request.model!=='gemini-3.8-flash')throw new ModelRequestError('MODEL_BUDGET_DRIFT');
    const multiplier=Date.now()>=Date.parse('2027-01-01T00:00:00Z')?2:1;
    const inputBound=Buffer.byteLength(canonicalJson(request),'utf8')+2048;
    const reservation=(inputBound*750+request.maxOutputTokens*3750)*multiplier;
    const state=await this.state();
    const charged=state.requests.reduce((sum,entry)=>sum+(entry.actual_nano_usd??entry.reserved_nano_usd),0);
    if(charged+reservation>this.limit)throw new ModelRequestError('EXTERNAL_BUDGET_EXCEEDED');
    const entry={index:state.requests.length+1,job_id:this.jobId,request_hash:hashJson(request),at:new Date().toISOString(),
      status:'reserved',input_token_bound:inputBound,output_and_thinking_token_bound:request.maxOutputTokens,
      reserved_nano_usd:reservation,actual_nano_usd:null,usage:null,error_code:null};
    state.requests.push(entry);await atomicWriteJson(this.path,state);
    this.usage.reset();
    const account=async errorCode=>{
      const usage=this.usage.get();
      const valid=usage && ['input_tokens','output_tokens','thinking_tokens'].every(key=>Number.isSafeInteger(usage[key])&&usage[key]>=0)&&usage.input_tokens>0;
      if(valid){
        entry.usage=usage;entry.actual_nano_usd=(usage.input_tokens*750+(usage.output_tokens+usage.thinking_tokens)*3750)*multiplier;
        entry.status='reported';
      }else entry.status='unknown';
      entry.error_code=errorCode;await atomicWriteJson(this.path,state);
      if(entry.actual_nano_usd!==null && entry.actual_nano_usd>reservation)throw new ModelRequestError('PROVIDER_TOKEN_BOUND_VIOLATION');
    };
    let response;
    try {response=await this.inner.generate(request);}
    catch(error){await account(error.code??'PROVIDER_FAILED');throw error;}
    await account(null);return response;
  }
}
