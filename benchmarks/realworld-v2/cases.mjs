import process from 'node:process';
export const base = 'benchmarks/realworld-v2';
export const cases = [{
  id:'mapbox', name:'Mapbox MCP', repository:'https://github.com/mapbox/mcp-server',
  oldTag:'v0.11.0',newTag:'v0.12.3',
  old:'7d2c0f323915ebd4aeb3ff6721cae51c81300941',new:'aae9e2fa777aab88809950032841675a844691df',
  oldTool:'point_in_polygon_tool',newTool:'points_within_polygon_tool',
  policy:'read-only-v1',
  gate:[{point:{longitude:1,latitude:1},polygon:[[[0,0],[8,0],[8,8],[0,8],[0,0]]]}],
  sealed:[{point:{longitude:9,latitude:9},polygon:[[[0,0],[8,0],[8,8],[0,8],[0,0]]]},{point:{longitude:3,latitude:3},polygon:[[[0,0],[8,0],[8,8],[0,8],[0,0]],[[2,2],[4,2],[4,4],[2,4],[2,2]]]},{point:{longitude:-3,latitude:-3},polygon:[[[-8,-8],[-1,-8],[-1,-1],[-8,-1],[-8,-8]]]}],
  change:'The old point_in_polygon_tool(point, polygon) was removed. The real replacement points_within_polygon_tool requires points=[point] and polygon; its response is points_within/count/total instead of inside/point. Preserving the old contract requires dynamic singleton-array construction and a count-to-boolean conversion, while retaining the original input point.',
  evidence:'CHANGELOG.md',changeCommit:'85eb71d9b2283a42c5d6de2e33c93f748feeff82',
  sourceFiles:['src/index.ts','src/config/toolConfig.ts','src/tools/toolRegistry.ts','src/tools/points-within-polygon-tool/PointsWithinPolygonTool.ts','src/tools/points-within-polygon-tool/PointsWithinPolygonTool.input.schema.ts','src/tools/points-within-polygon-tool/PointsWithinPolygonTool.output.schema.ts'],
  oldOnlyFiles:['src/tools/point-in-polygon-tool/PointInPolygonTool.ts','src/tools/point-in-polygon-tool/PointInPolygonTool.input.schema.ts','src/tools/point-in-polygon-tool/PointInPolygonTool.output.schema.ts'],
  limitations:['Offline local geometry only; no Mapbox API, token, network, geocoding or routing is evaluated.','Native schemas and outputs are retained. No array wrapper or response adapter is supplied to ContractRelay.','The selected released tags bracket the documented removal; other upstream changes between releases are outside the selected workflow.']
}, {
  id:'fabric', name:'Microsoft Fabric MCP', repository:'https://github.com/microsoft/mcp',
  oldTag:'Fabric.Mcp.Server-1.3.0',newTag:'Fabric.Mcp.Server-1.4.0',
  old:'4828227fcf11fcae80794ff4620897160d32d583',new:'d638fefa0c98b91916da81a694035f5fe4625f5b',
  oldTool:'docs_workload-api-spec',newTool:'docs_item-api-spec',policy:'read-only-v1',runtimeKind:'fabric',binaryPath:'/mcp-server/server-binary',
  releaseImages:{old:'mcr.microsoft.com/fabric/fabric-mcp@sha256:a651fb06ae7ef98ff73c5c6d0d929c5cf331a389995bc4c419265ed81a32c685',new:'mcr.microsoft.com/fabric/fabric-mcp@sha256:44eb803820aee1538e22e28f5f6eb8e8ad6e2801445eeb989a5ecb918a3bba2e'},
  serverArgs:{old:['--mode','all'],new:['--mode','all']},
  gate:[{'workload-type':'notebook'}],sealed:[{'workload-type':'report'},{'workload-type':'lakehouse'}],nativeNewInput:{'item-type':'notebook'},
  referenceRoot:'tools/Fabric.Mcp.Tools.Docs/src/Resources/fabric-rest-api-specs/contents',referenceArg:'workload-type',
  change:'Fabric MCP 1.4.0 renamed docs_workload-api-spec to docs_item-api-spec and the required workload-type argument to item-type. Unknown parameters are now explicitly rejected. These real hyphenated property names must be preserved; underscore aliases are not accepted. The selected workflow retrieves bundled public API documentation without authentication. The separate docs_workloads -> docs_list-item-types response rename workloads -> itemTypes is recorded as public provenance, not claimed as covered by this API-spec trial.',
  evidence:'servers/Fabric.Mcp.Server/CHANGELOG.md',
  sourceFiles:['servers/Fabric.Mcp.Server/CHANGELOG.md','tools/Fabric.Mcp.Tools.Docs/src/FabricDocsSetup.cs','tools/Fabric.Mcp.Tools.Docs/src/Services/FabricPublicApiService.cs','tools/Fabric.Mcp.Tools.Docs/src/Models/FabricModels.cs'],
  oldOnlyFiles:['tools/Fabric.Mcp.Tools.Docs/src/Commands/PublicApis/GetWorkloadApisCommand.cs','tools/Fabric.Mcp.Tools.Docs/src/Options/PublicApis/WorkloadCommandOptions.cs'],
  limitations:['Bundled, public, account-free API documentation only. No live Fabric resources, authentication or write operations are evaluated.','The measured workflow combines a tool rename and a required hyphenated argument rename; the separate workloads/itemTypes response change is provenance, not a scored workflow.','Official Microsoft release images are pinned by digest and their vendor sourceversion labels are checked against the exact Git release SHAs.','Native tool schemas and responses are retained; no underscore aliases, schema narrowing or migration-specific adapter is supplied.']
}];
export function selectedCase(args=process.argv.slice(2)) {
  const id=args.includes('--case')?args[args.indexOf('--case')+1]:null;
  if(id&&!cases.some(entry=>entry.id===id))throw new Error('UNKNOWN_REALWORLD_V2_CASE');
  return cases.filter(entry=>!id||entry.id===id);
}
export const snapshotOptions=(entry,version)=>({namespace:`realworld-v2/${entry.id}/${version}`,source:`${entry.repository}/commit/${entry[version]}`,version:entry[version],
  metadata:{[version==='old'?entry.oldTool:entry.newTool]:{sideEffect:'READ_ONLY',idempotency:'IDEMPOTENT'}}});
