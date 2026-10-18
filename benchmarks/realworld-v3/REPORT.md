# Historical migration report: v3 and combined index

The new bounded DSL recovered **Mapbox in 2/3 fresh post-fix trials** and **Fabric in 3/3**. The remaining Mapbox trial produced malformed JSON and remains a generation failure. All three trials on the separately frozen, previously unseen **session-collab** migration explicitly rejected it. There were **zero hidden false-compatible outcomes among five new promotions**.

These are finite fixture results, not proof of semantic equivalence or superiority to model wrappers. No baseline comparison was run for this extension. Earlier v1/v2 evidence remains unchanged.

## Combined historical evidence

There are **six distinct historical migration pairs**, **eight versioned case evaluations**, and **24 retained historical trial records**. Re-evaluating Mapbox and Fabric does not add two new historical migrations.

- [v1](../realworld-v1/REPORT.md): Mindwtr recovered 3/3; Nexus-MCP recovered 3/3; sqlew safely rejected 3/3 because of the preserved union-schema compiler limitation.
- [v2](../realworld-v2/REPORT.md), pre-extension: Mapbox safely rejected 3/3 because the old DSL lacked the structural operations; Fabric failed generation 3/3 because its real hyphenated names were rejected. These original failures are retained, not replaced or reinterpreted.
- v3, post-fix regression: Mapbox recovered 2/3, with one generation failure; Fabric recovered 3/3.
- v3, separately frozen unseen migration: session-collab explicitly rejected 3/3. No adapter was promoted or executed on its sealed workflows.

Original v1/v2 native replay was performed in an isolated checkout of the original implementation at `4d307b21c8a964bd7f59c28e807afe6b5956b922`. It reproduced all original outcomes without API calls. The extended parser was not used to reinterpret Fabric's old invalid generations.

## Exact historical pins and workflow

**Mapbox MCP — post-fix regression**

- Repository: https://github.com/mapbox/mcp-server
- Old v0.11.0: `7d2c0f323915ebd4aeb3ff6721cae51c81300941`
- New v0.12.3: `aae9e2fa777aab88809950032841675a844691df`
- Real change: removed `point_in_polygon_tool(point, polygon)`; replacement `points_within_polygon_tool(points, polygon)` requires a singleton point array and returns `points_within/count/total` instead of `inside/point`.
- Fresh trials: **1 recovered; 2 recovered; 3 generation failure** (`INVALID_MODEL_OUTPUT`, malformed JSON). The third raw provider response and its parse diagnostic are retained. It is not a safe rejection.
- Both promoted adapters passed all three sealed workflows, each replayed twice through the unchanged old MCP invocation against the actual new server. Outside, hole-exclusion and negative-coordinate cases were checked by the independent ray-casting oracle and exact old-output comparison.

**Microsoft Fabric MCP — post-fix regression**

- Repository: https://github.com/microsoft/mcp
- Old Fabric.Mcp.Server-1.3.0: `4828227fcf11fcae80794ff4620897160d32d583`
- New Fabric.Mcp.Server-1.4.0: `d638fefa0c98b91916da81a694035f5fe4625f5b`
- Real change: `docs_workload-api-spec(workload-type)` becomes `docs_item-api-spec(item-type)`. Native hyphenated names were preserved. Account-free bundled documentation was used.
- Fresh trials: **1 recovered; 2 recovered; 3 recovered**.
- Each promoted adapter passed both sealed documentation workflows, each replayed twice through the unchanged old invocation. The independent oracle compared version-pinned bundled Swagger content; no Fabric account or network access was required. The separate workloads/itemTypes response migration is not claimed as evaluated here.

**Session Collaboration MCP — separately frozen unseen migration, evaluated last**

- Repository: https://github.com/leaf76/session-collab-mcp
- Old package 0.9.0: `09faa20ad831ebb570490a785003a1c020f6fbfa`
- New package 2.0.0: `5b486324b5836cef4f5d547b4f1fb616c4c9a4ed`
- Native tools/list contained 41 old tools and 9 new tools. Both unmodified historical servers ran from their committed npm locks, with a synthetic SQLite fixture around the native entry points.
- Frozen old workflow: `collab_check` succeeds natively on old; the unchanged invocation fails with `Unknown tool: collab_check` on new. The native `collab_claim(action="check", ...)` control succeeds.
- The migration combines action-based consolidation with a real response change: nested `file_status.safe/blocked` becomes flattened fields, `proceed_all` becomes `proceed`, and rich grouped conflict metadata is dropped. The new required session_id also conflicts with the old optional argument. Native outputSchema is absent; none was invented.
- Two gate inputs and three sealed workflows were frozen before implementation at commit `d1658407df25d6ac728e3936652e7c1925395b3f`. The sealed cases cover mixed safe/blocked files, wholly blocked files, and own/inactive-owner claims. The workflow, fixture and oracle were not redesigned after observing regression results.
- Fresh trials: **1 explicit Reject; 2 explicit Reject; 3 explicit Reject**. Each cited unrecoverable response structure/information or the newly required session ID. All three remained unpromoted with no target writes. This is a refusal result, not evidence of successful adaptation.

The immutable unseen freeze has two additional limitations, disclosed in the protocol before model evaluation. Its gate lacks mandatory V3 state predicates and side-effect assertions for the write-capable consolidated target, so an adapting candidate would be inconclusive under the unchanged verifier. Its oracle uses JSON.stringify for nested file_status equality and therefore depends on native property insertion order. Both are preserved. Neither caused these measured outcomes: all three candidates explicitly rejected before behavioral verification, and no sealed unseen adaptation was executed. This case cannot establish positive recovery generalization.

## Generic implementation

[Bounded structural construction](../../docs/bounded-structural-v1.md) describes literal safe property names, explicit WrapArray, and flat ConstructResponse bindings to original inputs, current responses, prior call results and bounded constants. Integer comparisons allow only `eq` and `gt`, refuse coercion, and require safe integers. There is no arbitrary expression language, nested computed-object construction, array mapping/grouping, generated runtime code or repository-specific branch in the DSL/compiler.

Existing V1–V3 checks, independent promotion reruns, contract binding and runtime integrity checks remain in place. Verifier predicate paths were extended to address safe hyphenated properties; verdict and scoring logic were not weakened. The frozen v6 synthesis source, prompt and provider schema remain unchanged. New migrations use the separately versioned v7 single-target profile, wrapping the existing synthesis/scheduler/parser stack. No implementation, prompt, evidence, workflow, gate, oracle or scoring edits were made after paid evaluation began.

## Gemini accounting

Shared hard cap: **$1.00**. Actual measured usage:

- Calls: **9**, with nine independent job IDs, no cache hits and no result replacement.
- Input tokens: **18,285**.
- Visible output tokens: **1,975**.
- Thinking tokens: **16,973**.
- Estimated known spend: **$0.08476875**; unknown-usage requests: **0**.

The ledger reserves a conservative request bound before each call, retains unknown reservations across restart, and refuses overspend. SDK HTTP attempts were fixed to one; the scheduler retains and pauses on 503/504, with explicit resume of the same trial. The provider concurrency ceiling is three; this ordered run executed calls sequentially. Prices and the raw per-request usage are retained in [budget.json](results/budget.json). Historical known API spend including the original controlled run and all three historical extensions is **$0.83864775**; earlier unknown outage usage and development runs remain excluded.

## Integrity and reproduction

- `protected-before.json`: 363 original scientific/configuration/fixture files remain byte-for-byte unchanged, including the 195 controlled records and all v1/v2 files.
- `pre-capability-freeze.json`: all 89 captured pre-change files retain their hashes, including the unseen native evidence, case definitions, partitions, oracle and original setup harness.
- `core-extension.json`: explicitly binds six authorized existing-file changes and the new structural synthesis module. Original core hash baselines were preserved; replay uses the original implementation where required.
- `pre-evaluation-files.json`: binds 13 implementation/protocol/evaluator files before the first model call. They remain unchanged.
- `results-frozen.json`: binds measured results and raw interactions, including the malformed generation. Supplemental receipts retain later validation artifacts.

From the repository root, with dependencies installed:

```powershell
# Regenerate measured summaries from versioned artifacts; no model or Docker.
node --import=tsx benchmarks/realworld-v3/report.mjs --offline

# Verify the immutable evidence and measured result receipts.
node --import=tsx --test benchmarks/realworld-v3/test/*.test.mjs

# Repeat all nine new outcomes against real new historical servers; no API key.
node --import=tsx benchmarks/realworld-v3/replay.mjs

# Preserve old parsers/gates in an isolated original-code checkout, then replay.
# First setup needs Git download access and pnpm; native replay requires Docker.
node benchmarks/realworld-v3/legacy-check.mjs --native
```

Native replay expects the pinned historical images used by the v1/v2 acquisition scripts and the session-collab fixture Dockerfiles in this directory. It does not trigger synthesis or rewrite main-checkout historical evidence. The additive evaluator is `evaluate.mjs`; the original pre-change `run.mjs` remains frozen and is not the v3 evaluation entry point.
