# Real-World External Validity — Public Historical MCP Migrations

This separate evaluation does not replace, rerun or retune the controlled flagship benchmark. The frozen 15-case, 195-record results remain unchanged.

| Project | Historical change | Old commit | New commit | Direct old client on new | ContractRelay | Trials | False-compatible |
|---|---|---|---|---|---|---|---|
| mindwtr | Historical tool names changed from dotted to underscore notation. The selected task-listing inputs, results and implementation are otherwise unchanged. | `943b8a32f2b54b02cbddfb56c4054438362bb5ed` | `20742629b960c322ba4035af9cc53b87fca0db8a` | BREAKS | 3/3 | 3 | 0/3 promoted |
| nexus | The required find_symbol parameter name became symbol_name, without a compatibility alias. Graph lookup semantics and results are otherwise unchanged. | `cfa9fdccb77e622edbb966437de0524606bf34cc` | `5d0ba7a535bcc3998023f249ee1300d73e01f6c2` | BREAKS | 3/3 | 3 | 0/3 promoted |
| sqlew | Twenty tools were consolidated into six action-based tools. get_decision maps to decision with the documented required action="get". SQLite schema and selected read results are unchanged. | `b611a95f3ee902984b546efe1214299fa12005b9` | `e0ffc4cb77e6d320aae2a3e929fdb4115d424132` | BREAKS | 0/3 | 3 | 0/0 promoted |

Old server plus old client passed for every selected case before synthesis. Success requires exact historical output, independent SQLite/AST observations, unchanged state and the unchanged invocation through the real compatibility proxy. Gate promotion alone is not success.

## Cost and retained failures

9 Gemini calls; 12726 input, 985 visible output and 8036 thinking tokens. Estimated known cost: $0.043373; unknown reservations: $0.000000; hard extension cap: $1.00. Rates: [Google pricing](https://ai.google.dev/gemini-api/docs/pricing). Every request is reserved before sending and missing usage retains its full reservation. Invalid model artifacts and rejections remain in the trial counts.

- mindwtr: 0/3 safe rejections; 0/3 generation failures. Read-only task listing only; write tools are not evaluated. The upstream contentless-FTS search returns no rows for the seeded example on both revisions; search is outside the selected status/pagination workflow and is not patched.
- nexus: 0/3 safe rejections; 0/3 generation failures. The unchanged historical parser and graph engine populate a synthetic graph before server startup. No tool function is replaced. Only the actual MCP find_symbol path is evaluated; embedding/index/search workflows and their heavy optional runtime stack are not reproduced.
- sqlew: 3/3 safe rejections; 0/3 generation failures. Only decision retrieval is evaluated. The real consolidated decision contract also permits writes; fixture policy and independent SQLite state checks are therefore required. Both historical getDecision implementations query v_tagged_decisions, whose definition includes only the string decision table. A stored numeric decision therefore returns found=false on both versions; the independent oracle preserves and documents that upstream limitation. Historical console startup diagnostics are redirected to stderr by an external bootstrap to keep the real MCP stream valid; historical tool logic is unchanged.

## Limits and reproducibility

Only three selected public migrations and synthetic local data are evaluated; this is not production validation or a new comparative benchmark. Read-only workflows dominate. Nexus uses a genuinely parsed, preseeded graph and does not reproduce embeddings or full indexing. sqlew preserves the historical numeric-lookup limitation and uses independent SQLite write auditing. No core ContractRelay source changes were required.

ContractRelay was evaluated on a frozen 15-case controlled benchmark and separately evaluated against three historical tool-contract migrations from public MCP projects.

Acquire/build: `node --import=tsx benchmarks/realworld-v1/acquire.mjs --case <project>`. After acquisition, reproduce each case without model calls: `node --import=tsx benchmarks/realworld-v1/run.mjs --case <project> --replay`. Paid synthesis is an explicit separate command using `--evaluate`; completed trials are reused and never regenerated to improve scores. See each case's provenance, dependency locks, tools/list snapshots, evidence partitions and results.

## Existing compiler limitation: sqlew

All three sqlew candidates were rejected at V0 because the unchanged compiler refuses the native union type on the consolidated tool?s `value` property. Recovery is **0/3**, with **3/3 fail-closed rejections** and **0 promoted candidates**. The core was not patched, the real schema was not narrowed, and no candidate was replaced. See [the documented defect](DEFECTS.md). Mindwtr and Nexus each recover **3/3**; thus **2 of 3 migrations** are recovered.


Validation: lint/typechecking, 146 unchanged core tests and two budget tests pass.
The final local test run serialized file workers to avoid Windows I/O timeouts;
no test timeouts or core sources were changed. All nine API-free replay outcomes
match the measured records, with zero additional Gemini calls. The 221 protected
files remain byte-for-byte unchanged. Separate CI checks cover the budget guard
and evidence-partition denial behavior without paid calls.
