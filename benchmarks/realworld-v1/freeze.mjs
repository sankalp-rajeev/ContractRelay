import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,copyFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import console from 'node:console';
import {cases,snapshotOptions} from './cases.mjs';
import {makeFixture,mechanicalOracle} from './fixture.mjs';
import {openHistorical} from './transport.mjs';
import {snapshotTools} from '../../packages/mcp/src/index.ts';
import {hashContract,hashJson} from '../../packages/contracts/src/index.ts';
import {readJson,writeOnceJson} from '../../packages/contracts/src/artifacts.ts';
import {executionFingerprint} from '../../packages/benchmark/src/fingerprint.ts';
const base='benchmarks/realworld-v1';
const sha=text=>createHash('sha256').update(text).digest('hex');
const git=(entry,...args)=>execFileSync('git',['-C',`runs/realworld-v1/sources/${entry.id}`,...args],{encoding:'utf8',windowsHide:true});

for(const entry of cases) {
  const directory=join(base,entry.id);
  let frozen=false;
  try{await access(join(directory,'case.json'));frozen=true;}catch(error){if(error.code!=='ENOENT')throw error;}
  if(frozen){
    const manifest=await readJson(join(directory,'case.json'));
    for(const [folder,role] of [['synthesis-evidence','synthesis'],['gate-evidence','gate'],['sealed','sealed_eval']]) assert.equal(hashJson(await readJson(join(directory,folder,'evidence.json'))),manifest.partitions[role]);
    console.log(JSON.stringify({case:entry.id,already_frozen:true}));continue;
  }
  for(const folder of ['traces','synthesis-evidence','gate-evidence','sealed','fixtures','results'])await mkdir(join(directory,folder),{recursive:true});
  const old=await makeFixture(entry,'old');
  let oldContract,oldSnapshot,gateOutput,initialState;const outcomes=[];
  try {
    const listing=await old.client().listTools();await writeOnceJson(join(directory,'old-tools-list.json'),listing);
    oldSnapshot=await snapshotTools(old.client(),snapshotOptions(entry,'old'));
    oldContract=oldSnapshot.tools.find(tool=>tool.name===entry.oldTool);assert.ok(oldContract);
    initialState=await old.observe();gateOutput=await old.invoke(entry.oldTool,entry.gate[0]);
    assert.equal(mechanicalOracle(entry,entry.gate[0],gateOutput,initialState),true);
    await writeOnceJson(join(directory,'traces/old-success.json'),{call:{name:entry.oldTool,arguments:entry.gate[0]},output:gateOutput,mechanical_observation:initialState});
    for(const [index,input] of entry.sealed.entries()) {
      const output=await old.invoke(entry.oldTool,input);const state=await old.observe();
      assert.equal(mechanicalOracle(entry,input,output,state),true);assert.equal(hashJson(state),hashJson(initialState));
      outcomes.push({id:`sealed-${index+1}`,input,expected_output:output,expected_state:state,replays:2});
    }
  }finally{await old.close();}
  const newer=await openHistorical(entry.id,'new');let newContract;
  try {
    const listing=await newer.client.listTools();await writeOnceJson(join(directory,'new-tools-list.json'),listing);
    const snapshot=await snapshotTools(newer.client,snapshotOptions(entry,'new'));
    newContract=snapshot.tools.find(tool=>tool.name===entry.newTool);assert.ok(newContract);
    const direct=await newer.client.callTool({name:entry.oldTool,arguments:entry.gate[0]});
    assert.equal(direct.isError,true);await writeOnceJson(join(directory,'traces/direct-old-client-on-new.json'),{call:{name:entry.oldTool,arguments:entry.gate[0]},response:direct});
  }finally{await newer.close();}
  await writeOnceJson(join(directory,'old-contract.json'),oldContract);await writeOnceJson(join(directory,'new-contract.json'),newContract);
  const reference='change-evidence.md#historical-change';
  const synthesis={dataClass:'public',oldContract,newContracts:[newContract],documents:[{id:reference,text:`${entry.change}\nPublic repository: ${entry.repository}\nOld commit: ${entry.old}\nNew commit: ${entry.new}\nEvidence: ${entry.repository}/blob/${entry.new}/${entry.evidence}\nOnly the selected documented operation is a target; no gate or sealed observations are provided.`}]};
  const gate={version:1,traces:[{traceId:'gate-1',tool:entry.oldTool,input:entry.gate[0],output:gateOutput,contractHash:hashContract(oldContract),replays:2}],
    predicates:[{id:'gate-output',trace_id:'gate-1',kind:'equals',path:'',expected:gateOutput}],metamorphic:[],evidence_refs:[reference],
    supported_defaults:entry.id==='sqlew'?[{arg:'action',value:'get',evidence_ref:reference,tool:entry.newTool}]:[],
    ...(entry.id==='sqlew'?{state_predicates:[{id:'sqlite-records',trace_id:'gate-1',kind:'equals',path:'decisions',expected:initialState.decisions}],
      side_effect_assertions:[{id:'zero-sqlite-writes',trace_id:'gate-1',tool:entry.newTool,count:0}]}:{})};
  const sealed={version:1,outcomes,oracle:'Exact historical output plus independent SQLite/AST facts and unchanged persisted state. Never score from exception absence or schemas alone.'};
  for(const [folder,data] of [['synthesis-evidence',synthesis],['gate-evidence',gate],['sealed',sealed]])await writeOnceJson(join(directory,folder,'evidence.json'),data);
  const manifest={version:1,case_id:`realworld-${entry.id}`,held_out:true,partitions:{synthesis:hashJson(synthesis),gate:hashJson(gate),sealed_eval:hashJson(sealed)}};
  await writeOnceJson(join(directory,'case.json'),manifest);
  const sourceHashes={};for(const version of ['old','new'])for(const path of entry.sourceFiles)sourceHashes[`${version}:${path}`]=sha(git(entry,'show',`${entry[version]}:${path}`));
  const images={};for(const version of ['old','new'])images[version]=JSON.parse(execFileSync('docker',['image','inspect',`contractrelay-realworld-${entry.id}-${version}`],{encoding:'utf8'}))[0].Id;
  const provenance={version:1,repository:entry.repository,old_commit:entry.old,new_commit:entry.new,old_version:git(entry,'show',`${entry.old}:${entry.id==='nexus'?'pyproject.toml':entry.id==='mindwtr'?'apps/mcp-server/package.json':'package.json'}`).match(/(?:"version":\s*"|version = ")([^"\n]+)/)?.[1]??null,
    change:entry.change,evidence_urls:[`${entry.repository}/commit/${entry.new}`,`${entry.repository}/blob/${entry.new}/${entry.evidence}`],source_sha256:sourceHashes,
    images,contractrelay_execution_fingerprint:await executionFingerprint(),model:'gemini-3.8-flash',prompt_schema_version:'bounded-plan-v6',
    original_lockfiles:'docker/dependencies/',runtime:entry.id==='mindwtr'?'Bun 1.3.0':entry.id==='nexus'?'Python 3.12.12':execFileSync('docker',['run','--rm','--network=none','--entrypoint','node',images.new,'--version'],{encoding:'utf8'}).trim(),
    setup:'Unmodified historical source plus external synthetic-fixture bootstrap; no host mounts or network at runtime.',limitations:entry.limitations};
  await writeOnceJson(join(directory,'provenance.json'),provenance);
  await writeFile(join(directory,'change-evidence.md'),`# Historical change\n\n${entry.change}\n\nOld: \`${entry.old}\`\nNew: \`${entry.new}\`\n\n[Public commit](${entry.repository}/commit/${entry.new})\n[Versioned evidence](${entry.repository}/blob/${entry.new}/${entry.evidence})\n\nBoth historical servers were executed; the original old call succeeds on old and fails directly on new. No failure was manufactured.\n`);
  await writeFile(join(directory,'README.md'),`# ${entry.id}: historical MCP migration\n\n${entry.change}\n\nSee [provenance](provenance.json), real tools/list snapshots, old successful trace and direct break evidence. Three independent ContractRelay trials will use the existing synthesis, verifier and promotion code.\n\nReproduce after acquisition: \`node --import=tsx benchmarks/realworld-v1/run.mjs --case ${entry.id} --replay\`.\n\n## Scope and limits\n\n${entry.limitations.map(text=>`- ${text}`).join('\n')}\n\nSynthesis receives only synthesis-evidence. Gate and sealed evidence are separate and hashed. The trusted coordinator stages the existing core layout in ignored runs and permits sealed access only after durable decision commit.\n`);
  await copyFile(join(directory,'docker',entry.id==='nexus'?'bootstrap.py':entry.id==='mindwtr'?'bootstrap.ts':'bootstrap.mjs'),join(directory,'fixtures','bootstrap-source.txt'));
  console.log(JSON.stringify({case:entry.id,old:'PASS',direct_new:'BREAKS',gate_traces:1,sealed_workflows:outcomes.length,frozen:true}));
}
const baseline=await readJson('.contractrelay/realworld-v1/flagship-integrity-before.json');
const protectedFiles={};for(const path of Object.keys(baseline.files))protectedFiles[path]=sha((await readFile(path,'utf8')).replaceAll('\r\n','\n'));
await writeOnceJson(join(base,'flagship-integrity.json'),{version:1,algorithm:'sha256-utf8-lf',baseline_commit:baseline.baseline_commit,files:protectedFiles});
