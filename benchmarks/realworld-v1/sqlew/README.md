# sqlew: historical MCP migration

Twenty tools were consolidated into six action-based tools. get_decision maps to decision with the documented required action="get". SQLite schema and selected read results are unchanged.

See [provenance](provenance.json), real tools/list snapshots, old successful trace and direct break evidence. Three independent ContractRelay trials will use the existing synthesis, verifier and promotion code.

Reproduce after acquisition: `node --import=tsx benchmarks/realworld-v1/run.mjs --case sqlew --replay`.

## Scope and limits

- Only decision retrieval is evaluated. The real consolidated decision contract also permits writes; fixture policy and independent SQLite state checks are therefore required.
- Both historical getDecision implementations query v_tagged_decisions, whose definition includes only the string decision table. A stored numeric decision therefore returns found=false on both versions; the independent oracle preserves and documents that upstream limitation.
- Historical console startup diagnostics are redirected to stderr by an external bootstrap to keep the real MCP stream valid; historical tool logic is unchanged.

Synthesis receives only synthesis-evidence. Gate and sealed evidence are separate and hashed. The trusted coordinator stages the existing core layout in ignored runs and permits sealed access only after durable decision commit.

## Measured outcome

Old server with old client: PASS. Direct unchanged old client on new: BREAKS. ContractRelay recovery: **0/3**; safe rejection: **3/3**; hidden false compatibility: **0/0 promoted**. See [the separate report](../REPORT.md) and [the unmodified core limitation](../DEFECTS.md).
