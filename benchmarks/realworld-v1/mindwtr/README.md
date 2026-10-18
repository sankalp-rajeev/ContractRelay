# mindwtr: historical MCP migration

Historical tool names changed from dotted to underscore notation. The selected task-listing inputs, results and implementation are otherwise unchanged.

See [provenance](provenance.json), real tools/list snapshots, old successful trace and direct break evidence. Three independent ContractRelay trials will use the existing synthesis, verifier and promotion code.

Reproduce after acquisition: `node --import=tsx benchmarks/realworld-v1/run.mjs --case mindwtr --replay`.

## Scope and limits

- Read-only task listing only; write tools are not evaluated.
- The upstream contentless-FTS search returns no rows for the seeded example on both revisions; search is outside the selected status/pagination workflow and is not patched.

Synthesis receives only synthesis-evidence. Gate and sealed evidence are separate and hashed. The trusted coordinator stages the existing core layout in ignored runs and permits sealed access only after durable decision commit.
