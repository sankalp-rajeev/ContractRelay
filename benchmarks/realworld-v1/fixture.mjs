import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {openHistorical,unwrap} from './transport.mjs';
const exec=promisify(execFile);
export async function observeHistorical(project,server) {
  let args;
  if(project==='mindwtr') args=['bun','-e',`import {Database} from 'bun:sqlite'; const db=new Database('/data/mindwtr.db',{readonly:true}); console.log(JSON.stringify({tasks:db.query('SELECT id,title,status FROM tasks ORDER BY id').all()}));`];
  else if(project==='sqlew') args=['node','--experimental-sqlite','--input-type=module','-e',`import {DatabaseSync} from 'node:sqlite'; const db=new DatabaseSync('/data/sqlew.db',{readOnly:true}); console.log(JSON.stringify({decisions:db.prepare('SELECT k.key,d.value FROM t_decisions d JOIN m_context_keys k ON k.id=d.key_id ORDER BY key').all(),numeric_decisions:db.prepare('SELECT k.key,d.value FROM t_decisions_numeric d JOIN m_context_keys k ON k.id=d.key_id ORDER BY key').all(),side_effects:{decision:db.prepare('SELECT COUNT(*) AS n FROM _contractrelay_audit').get().n}}));`];
  else args=['python','-c',`import ast,json,sqlite3; p='/data/sample.py'; tree=ast.parse(open(p).read()); db=sqlite3.connect('file:/data/.nexus/graph.db?mode=ro',uri=True); print(json.dumps({'functions':[{'name':n.name,'start_line':n.lineno,'end_line':n.end_lineno} for n in tree.body if isinstance(n,ast.FunctionDef)],'stored_nodes':[json.loads(row[0]) for row in db.execute('SELECT data FROM nodes ORDER BY id')]}))`];
  const {stdout}=await exec('docker',['exec',server.name,...args],{windowsHide:true,maxBuffer:1000000});return JSON.parse(stdout);
}
export async function makeFixture(entry,version='new') {
  let server;
  const reset=async()=>{await server?.close();server=await openHistorical(entry.id,version);};
  await reset();
  return {environment:'isolated-fixture',reset,observe:()=>observeHistorical(entry.id,server),
    invoke:async(tool,args)=>{if(tool!==(version==='old'?entry.oldTool:entry.newTool))throw new Error('UNALLOWLISTED_REALWORLD_TOOL');return unwrap(await server.client.callTool({name:tool,arguments:args}));},
    client:()=>server.client,close:()=>server.close()};
}
/** Independent SQL/AST facts, separate from historical return-value replay. */
export function mechanicalOracle(entry,input,output,state) {
  if(entry.id==='mindwtr') {
    let rows=state.tasks.filter(row=>!input.status||input.status==='all'||row.status===input.status);
    if(input.sortBy==='title')rows.sort((a,b)=>a.title.localeCompare(b.title)*(input.sortOrder==='asc'?1:-1));
    rows=rows.slice(input.offset??0,(input.offset??0)+(input.limit??200));
    return JSON.stringify(output.tasks?.map(({id,title,status})=>({id,title,status})))===JSON.stringify(rows);
  }
  if(entry.id==='sqlew') {
    const row=state.decisions.find(row=>row.key===input.key);
    return output.found===Boolean(row)&&(!row||(output.decision?.key===row.key&&output.decision?.value===row.value));
  }
  const expected=state.functions.filter(fn=>input.exact===false?fn.name.includes(input.name):fn.name===input.name);
  return output.total===expected.length&&output.symbols?.length===expected.length&&expected.every(fn=>output.symbols.some(symbol=>symbol.name===fn.name&&symbol.location.start_line===fn.start_line&&symbol.location.end_line===fn.end_line));
}
