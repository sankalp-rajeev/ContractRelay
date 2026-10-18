# nexus: historical MCP migration

The required find_symbol parameter name became symbol_name, without a compatibility alias. Graph lookup semantics and results are otherwise unchanged.

See [provenance](provenance.json), real tools/list snapshots, old successful trace and direct break evidence. Three independent ContractRelay trials will use the existing synthesis, verifier and promotion code.

Reproduce after acquisition: `node --import=tsx benchmarks/realworld-v1/run.mjs --case nexus --replay`.

## Scope and limits

- The unchanged historical parser and graph engine populate a synthetic graph before server startup. No tool function is replaced.
- Only the actual MCP find_symbol path is evaluated; embedding/index/search workflows and their heavy optional runtime stack are not reproduced.

Synthesis receives only synthesis-evidence. Gate and sealed evidence are separate and hashed. The trusted coordinator stages the existing core layout in ignored runs and permits sealed access only after durable decision commit.
