# Historical change

Twenty tools were consolidated into six action-based tools. get_decision maps to decision with the documented required action="get". SQLite schema and selected read results are unchanged.

Old: `b611a95f3ee902984b546efe1214299fa12005b9`
New: `e0ffc4cb77e6d320aae2a3e929fdb4115d424132`

[Public commit](https://github.com/fastmcp-me/mcp-sqlew/commit/e0ffc4cb77e6d320aae2a3e929fdb4115d424132)
[Versioned evidence](https://github.com/fastmcp-me/mcp-sqlew/blob/e0ffc4cb77e6d320aae2a3e929fdb4115d424132/MIGRATION_v2.md)

Both historical servers were executed; the original old call succeeds on old and fails directly on new. No failure was manufactured.
