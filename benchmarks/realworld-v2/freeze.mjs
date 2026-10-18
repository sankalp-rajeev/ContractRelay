import assert from 'node:assert/strict';
import console from 'node:console';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {base,selectedCase,snapshotOptions} from './cases.mjs';
import {openHistorical,unwrap} from './transport.mjs';
import {mechanicalOracle} from './oracle.mjs';
import {sha,assertProtected} from './integrity.mjs';
import {snapshotTools} from '../../packages/mcp/src/index.ts';
import {hashContract,hashJson} from '../../packages/contracts/src/index.ts';
import {readJson,writeOnceJson} from '../../packages/contracts/src/artifacts.ts';
await assertProtected();
for(const entry of selectedCase()) {
  const directory=join(base,entry.id);
  try {await readJson(join(directory,'case.json'));console.log(JSON.stringify({case:entry.id,already_frozen:true}));continue;}
  catch(error){if(error.code!=='ENOENT')throw error;}
  for(const folder of ['traces','synthesis-evidence','gate-evidence','sealed','results','source-evidence'])await mkdir(join(directory,folder),{recursive:true});
  const git=(...args)=>execFileSync('git',['-C',`runs/realworld-v2/sources/${entry.id}`,...args],{encoding:'utf8',windowsHide:true});
  const sourceHashes={};
  const independentFor=input=>entry.referenceRoot?{spec:git('show',`${entry.old}:${entry.referenceRoot}/${input[entry.referenceArg]}/swagger.json`)}:undefined;
  for(const version of ['old','new'])for(const path of [...entry.sourceFiles,...(version==='old'?entry.oldOnlyFiles??[]:[])]) {
    const text=git('show',`${entry[version]}:${path}`);sourceHashes[`${version}:${path}`]=sha(text.replaceAll('\r\n','\n'));
    await writeOnceJson(join(directory,'source-evidence',`${version}-${path.replaceAll('/','__')}.json`),{path,commit:entry[version],text});
  }
  let oldContract,newContract,gateOutput,initialState;const outcomes=[],images={},runtimeAudit={};
  const old=await openHistorical(entry,'old');images.old=old.image;
  runtimeAudit.old=await old.audit();
  try {
    const listing=await old.client.listTools();await writeOnceJson(join(directory,'old-tools-list.json'),listing);
    oldContract=(await snapshotTools(old.client,snapshotOptions(entry,'old'))).tools.find(tool=>tool.name===entry.oldTool);assert(oldContract);
    initialState=await old.observe();
    const response=await old.client.callTool({name:entry.oldTool,arguments:entry.gate[0]});gateOutput=unwrap(response);
    assert(await mechanicalOracle(entry,entry.gate[0],gateOutput,independentFor(entry.gate[0])));
    await writeOnceJson(join(directory,'traces/old-success.json'),{call:{name:entry.oldTool,arguments:entry.gate[0]},response,output:gateOutput,mechanical_observation:initialState});
    for(const [index,input] of entry.sealed.entries()) {
      const response=await old.client.callTool({name:entry.oldTool,arguments:input});const output=unwrap(response),state=await old.observe();
      const independent=independentFor(input);
      assert(await mechanicalOracle(entry,input,output,independent));assert.deepEqual(state,initialState);
      outcomes.push({id:`sealed-${index+1}`,input,expected_output:output,expected_state:state,replays:2,old_response:response,...(independent?{independent}:{} )});
    }
  }finally{await old.close();}
  const next=await openHistorical(entry,'new');images.new=next.image;
  runtimeAudit.new=await next.audit();
  try {
    const listing=await next.client.listTools();await writeOnceJson(join(directory,'new-tools-list.json'),listing);
    newContract=(await snapshotTools(next.client,snapshotOptions(entry,'new'))).tools.find(tool=>tool.name===entry.newTool);assert(newContract);
    let response,thrown=null;try{response=await next.client.callTool({name:entry.oldTool,arguments:entry.gate[0]});}catch(error){thrown=error.message;}
    assert(response?.isError||thrown,'CANDIDATE_NOT_BREAKING');
    await writeOnceJson(join(directory,'traces/direct-old-client-on-new.json'),{call:{name:entry.oldTool,arguments:entry.gate[0]},response:response??null,error:thrown});
    // This is a native-new control, not an adapter: it establishes that the
    // replacement really works. It is never given to synthesis or the gate.
    const input=entry.id==='mapbox'?{points:[entry.gate[0].point],polygon:entry.gate[0].polygon}:entry.nativeNewInput;
    const control=await next.client.callTool({name:entry.newTool,arguments:input});unwrap(control);
    await writeOnceJson(join(directory,'traces/native-new-control.json'),{call:{name:entry.newTool,arguments:input},response:control});
  }finally{await next.close();}
  await writeOnceJson(join(directory,'old-contract.json'),oldContract);await writeOnceJson(join(directory,'new-contract.json'),newContract);
  const reference='change-evidence.md#historical-change';
  const synthesis={dataClass:'public',oldContract,newContracts:[newContract],documents:[{id:reference,text:`${entry.change}\nPublic repository: ${entry.repository}\nOld release: ${entry.oldTag} (${entry.old})\nNew release: ${entry.newTag} (${entry.new})\n${entry.repository}/blob/${entry.new}/${entry.evidence}\nNo gate, native control or sealed observations are included.`}]};
  const gate={version:1,traces:[{traceId:'gate-1',tool:entry.oldTool,input:entry.gate[0],output:gateOutput,contractHash:hashContract(oldContract),replays:2}],predicates:[{id:'old-contract-output',trace_id:'gate-1',kind:'equals',path:'',expected:gateOutput}],metamorphic:[],evidence_refs:[reference],supported_defaults:[]};
  const sealed={version:1,outcomes,oracle:entry.id==='mapbox'?'Exact old output and independent ray casting with hole exclusion; read-only container writable-layer audit.':'Exact historical output and independent version-pinned bundled specification; read-only container audit.'};
  for(const [folder,value] of [['synthesis-evidence',synthesis],['gate-evidence',gate],['sealed',sealed]])await writeOnceJson(join(directory,folder,'evidence.json'),value);
  const manifest={version:1,case_id:`realworld-v2-${entry.id}`,held_out:true,entry_hash:hashJson(entry),oracle_sha256:sha((await readFile(join(directory,'oracle.mjs'),'utf8')).replaceAll('\r\n','\n')),partitions:{synthesis:hashJson(synthesis),gate:hashJson(gate),sealed_eval:hashJson(sealed)}};
  await writeOnceJson(join(directory,'case.json'),manifest);
  const provenance={version:2,repository:entry.repository,old_tag:entry.oldTag,new_tag:entry.newTag,old_commit:entry.old,new_commit:entry.new,change:entry.change,source_sha256:sourceHashes,images,runtime_audit:runtimeAudit,
    evidence_urls:[`${entry.repository}/blob/${entry.new}/${entry.evidence}`,...(entry.changeCommit?[`${entry.repository}/commit/${entry.changeCommit}`]:[])],limitations:entry.limitations,setup:'Unmodified real historical server entry point. Read-only, network-disabled container, no host mounts or credentials.'};
  await writeOnceJson(join(directory,'provenance.json'),provenance);
  await writeFile(join(directory,'change-evidence.md'),`# Historical change\n\n${entry.change}\n\nOld: ${entry.oldTag}, \`${entry.old}\`\nNew: ${entry.newTag}, \`${entry.new}\`\n\n${provenance.evidence_urls.map(url=>`- ${url}`).join('\n')}\n\nNative source excerpts and hashes are retained in source-evidence. Both servers were executed before acceptance.\n`);
  console.log(JSON.stringify({case:entry.id,old:'PASS',direct_new:'BREAKS',native_new:'PASS',sealed_workflows:outcomes.length,frozen:true}));
}
await assertProtected();
