import { mkdir } from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import { atomicWriteJson } from '../../packages/contracts/src/artifacts.ts';
import { openHistorical,unwrap } from './transport.mjs';
const [project,version]=process.argv.slice(2);
const server=await openHistorical(project,version);
try {
  const listing=await server.client.listTools();
  const call=project==='mindwtr'?{name:version==='old'?'mindwtr.list_tasks':'mindwtr_list_tasks',arguments:{status:'inbox'}}
    :project==='nexus'?{name:'find_symbol',arguments:{[version==='old'?'name':'symbol_name']:'alpha'}}
    :{name:version==='old'?'get_decision':'decision',arguments:{key:'fixture.alpha',...(version==='new'?{action:'get'}:{})}};
  const response=await server.client.callTool(call);
  const path=`runs/realworld-v1/probes/${project}-${version}`; await mkdir(path,{recursive:true});
  await atomicWriteJson(`${path}/tools-list.json`,listing); await atomicWriteJson(`${path}/workflow.json`,{call,response,output:unwrap(response)});
  console.log(JSON.stringify({project,version,tools:listing.tools.length,output:unwrap(response)}));
} finally {await server.close();}
