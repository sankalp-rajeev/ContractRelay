import process from 'node:process';
import {cases as historical} from '../realworld-v2/cases.mjs';
export const base='benchmarks/realworld-v3';
export const cases=[...historical.map(entry=>({...entry,project:entry.id,id:entry.id+'-v3',evaluationKind:'post-fix regression'})),{
 id:'session-collab-v3',project:'session-collab',name:'Session Collaboration MCP',evaluationKind:'previously unseen historical migration',
 repository:'https://github.com/leaf76/session-collab-mcp',oldTag:'package 0.9.0',newTag:'package 2.0.0',
 old:'09faa20ad831ebb570490a785003a1c020f6fbfa',new:'5b486324b5836cef4f5d547b4f1fb616c4c9a4ed',
 oldTool:'collab_check',newTool:'collab_claim',policy:'stateful-fixture-v1',runtimeKind:'session-collab',
 gate:[{session_id:'fixture-reader',files:['/project/free.ts']},{session_id:'fixture-reader',files:['/project/blocked.ts']}],
 sealed:[{session_id:'fixture-reader',files:['/project/free.ts','/project/blocked.ts']},{session_id:'fixture-reader',files:['/project/blocked.ts','/project/locked.ts']},{session_id:'fixture-reader',files:['/project/own.ts','/project/ended.ts']}],
 nativeNewInput:{action:'check',session_id:'fixture-reader',files:['/project/free.ts']},
 change:'The real collab_check tool was removed and consolidated into collab_claim with required action="check". The old response includes safe, nested file_status.safe/blocked, recommendation="proceed_all" and todo status; the new response flattens safe_files/blocked_files, uses recommendation="proceed", and omits old fields. Conflicting responses also change grouped rich conflicts into flat session_name/file/intent entries, dropping session IDs, scope and started_at. Native tools/list has no outputSchema; source excerpts describe these real response changes. This case tests whole-file checks against a synthetic fixture with no todos or symbols; other old features are not claimed as reproduced.',
 evidence:'MIGRATION.md',sourceFiles:['src/cli.ts','src/mcp/server.ts','src/mcp/tools/claim.ts','src/db/queries.ts','src/utils/response.ts','src/mcp/schemas.ts'],oldOnlyFiles:[],
 limitations:['Only whole-file conflict checking is evaluated, not claim writes, symbol checks or todo tracking.','The consolidated new tool permits writes; stateful-fixture-v1 and independent SQLite mutation audit triggers are required.','No output schema is invented. Full native schemas, full native JSON responses, and missing response information are retained.','The fixture applies upstream migrations and seeds synthetic sessions/claims before importing the unchanged native CLI. Its existing repeated-migration warning is preserved.','This workflow and all evidence partitions were frozen before any DSL/compiler changes and will be evaluated last.']
}];
export function selectedCase(args=process.argv.slice(2)) {
 const id=args.includes('--case')?args[args.indexOf('--case')+1]:null;
 if(id&&!cases.some(entry=>entry.id===id))throw new Error('UNKNOWN_REALWORLD_V3_CASE');
 return cases.filter(entry=>!id||entry.id===id);
}
export const snapshotOptions=(entry,version)=>({namespace:`realworld-v3/${entry.id}/${version}`,source:`${entry.repository}/commit/${entry[version]}`,version:entry[version],metadata:{[version==='old'?entry.oldTool:entry.newTool]:{sideEffect:entry.runtimeKind==='session-collab'&&version==='new'?'REVERSIBLE_WRITE':'READ_ONLY',idempotency:entry.runtimeKind==='session-collab'&&version==='new'?'CONDITIONAL':'IDEMPOTENT'}}});
