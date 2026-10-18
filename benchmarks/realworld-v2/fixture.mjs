import {openHistorical,unwrap} from './transport.mjs';
export {mechanicalOracle} from './oracle.mjs';
export async function makeFixture(entry,version='new') {
  let server;let calls=0;
  const reset=async()=>{await server?.close();server=await openHistorical(entry,version);};await reset();
  return {environment:'isolated-fixture',reset,observe:()=>server.observe(),client:()=>server.client,image:()=>server.image,
    callCount:()=>calls,invoke:async(tool,args)=>{if(tool!==(version==='old'?entry.oldTool:entry.newTool))throw new Error('UNALLOWLISTED_HISTORICAL_TOOL');calls++;return unwrap(await server.client.callTool({name:tool,arguments:args}));},close:()=>server.close()};
}
