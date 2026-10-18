export const snapshotOptions=(entry,version)=>({namespace:`realworld-v1/${entry.id}`,source:`${entry.repository}/tree/${entry[version]}`,version:entry[version],
  metadata:{[version==='old'?entry.oldTool:entry.newTool]:{sideEffect:version==='old'?'READ_ONLY':entry.sideEffect,idempotency:version==='old'?'IDEMPOTENT':entry.idempotency}}});
export const cases = [
  {id:'mindwtr',repository:'https://github.com/dongdongbh/Mindwtr',old:'943b8a32f2b54b02cbddfb56c4054438362bb5ed',new:'20742629b960c322ba4035af9cc53b87fca0db8a',
    oldTool:'mindwtr.list_tasks',newTool:'mindwtr_list_tasks',policy:'read-only-v1',sideEffect:'READ_ONLY',idempotency:'IDEMPOTENT',
    change:'Historical tool names changed from dotted to underscore notation. The selected task-listing inputs, results and implementation are otherwise unchanged.',
    evidence:'apps/mcp-server/README.md',sourceFiles:['apps/mcp-server/src/index.ts','apps/mcp-server/src/queries.ts'],
    gate:[{status:'inbox'}],sealed:[{status:'next'},{status:'inbox',limit:1,offset:1,sortBy:'title',sortOrder:'asc'},{status:'all',limit:2,offset:1,sortBy:'title',sortOrder:'asc'}],
    limitations:['Read-only task listing only; write tools are not evaluated.','The upstream contentless-FTS search returns no rows for the seeded example on both revisions; search is outside the selected status/pagination workflow and is not patched.']},
  {id:'nexus',repository:'https://github.com/jaggernaut007/Nexus-MCP',old:'cfa9fdccb77e622edbb966437de0524606bf34cc',new:'5d0ba7a535bcc3998023f249ee1300d73e01f6c2',
    oldTool:'find_symbol',newTool:'find_symbol',policy:'read-only-v1',sideEffect:'READ_ONLY',idempotency:'IDEMPOTENT',
    change:'The required find_symbol parameter name became symbol_name, without a compatibility alias. Graph lookup semantics and results are otherwise unchanged.',
    evidence:'src/nexus_mcp/server.py',sourceFiles:['src/nexus_mcp/server.py','src/nexus_mcp/core_api.py'],
    gate:[{name:'alpha',exact:true}],sealed:[{name:'beta',exact:true},{name:'gamma',exact:true},{name:'bet',exact:false}],
    limitations:['The unchanged historical parser and graph engine populate a synthetic graph before server startup. No tool function is replaced.','Only the actual MCP find_symbol path is evaluated; embedding/index/search workflows and their heavy optional runtime stack are not reproduced.']},
  {id:'sqlew',repository:'https://github.com/fastmcp-me/mcp-sqlew',old:'b611a95f3ee902984b546efe1214299fa12005b9',new:'e0ffc4cb77e6d320aae2a3e929fdb4115d424132',
    oldTool:'get_decision',newTool:'decision',policy:'stateful-fixture-v1',sideEffect:'REVERSIBLE_WRITE',idempotency:'CONDITIONAL',
    change:'Twenty tools were consolidated into six action-based tools. get_decision maps to decision with the documented required action="get". SQLite schema and selected read results are unchanged.',
    evidence:'MIGRATION_v2.md',sourceFiles:['src/index.ts','src/tools/context.ts'],
    gate:[{key:'fixture.alpha'}],sealed:[{key:'fixture.beta'},{key:'fixture.gamma'},{key:'fixture.missing'}],
    limitations:['Only decision retrieval is evaluated. The real consolidated decision contract also permits writes; fixture policy and independent SQLite state checks are therefore required.','Both historical getDecision implementations query v_tagged_decisions, whose definition includes only the string decision table. A stored numeric decision therefore returns found=false on both versions; the independent oracle preserves and documents that upstream limitation.','Historical console startup diagnostics are redirected to stderr by an external bootstrap to keep the real MCP stream valid; historical tool logic is unchanged.']}
];
