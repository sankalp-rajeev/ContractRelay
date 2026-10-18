# Historical change

Fabric MCP 1.4.0 renamed docs_workload-api-spec to docs_item-api-spec and the required workload-type argument to item-type. Unknown parameters are now explicitly rejected. These real hyphenated property names must be preserved; underscore aliases are not accepted. The selected workflow retrieves bundled public API documentation without authentication. The separate docs_workloads -> docs_list-item-types response rename workloads -> itemTypes is recorded as public provenance, not claimed as covered by this API-spec trial.

Old: Fabric.Mcp.Server-1.3.0, `4828227fcf11fcae80794ff4620897160d32d583`
New: Fabric.Mcp.Server-1.4.0, `d638fefa0c98b91916da81a694035f5fe4625f5b`

- https://github.com/microsoft/mcp/blob/d638fefa0c98b91916da81a694035f5fe4625f5b/servers/Fabric.Mcp.Server/CHANGELOG.md

Native source excerpts and hashes are retained in source-evidence. Both servers were executed before acceptance.
