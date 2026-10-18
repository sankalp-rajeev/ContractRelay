# Historical change

The required find_symbol parameter name became symbol_name, without a compatibility alias. Graph lookup semantics and results are otherwise unchanged.

Old: `cfa9fdccb77e622edbb966437de0524606bf34cc`
New: `5d0ba7a535bcc3998023f249ee1300d73e01f6c2`

[Public commit](https://github.com/jaggernaut007/Nexus-MCP/commit/5d0ba7a535bcc3998023f249ee1300d73e01f6c2)
[Versioned evidence](https://github.com/jaggernaut007/Nexus-MCP/blob/5d0ba7a535bcc3998023f249ee1300d73e01f6c2/src/nexus_mcp/server.py)

Both historical servers were executed; the original old call succeeds on old and fails directly on new. No failure was manufactured.
