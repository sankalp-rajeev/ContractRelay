# Validated implementation checkpoints

## Phase 1 — complete

ToolContract, canonical hashing, primitive DSL/interpreter, MCP tools/list
ingestion and unit/property tests are implemented. Lint, strict typechecking
and 53 tests pass without any API key. The monetary property test includes 500
seeded values. No model or benchmark result is implied.

## Phase 2 — complete

Implemented evidence partitions, permission-restricted synthesis/verifier workers,
canonical trace replay/redaction, independent predicates/metamorphic checks,
deterministic V0/V1/V2 reports, exact-hash promotion/revocation, structured Gemini
generation, persistent quota accounting, per-attempt artifacts and crash/resume.

The local lifecycle accepts a compatible weather adapter, rejects schema-valid
wrong units, freezes the decision and only then opens and scores a separate input.
This is a controlled fixture demonstration, not a model or benchmark result.

Live acceptance passed on 2026-10-17 using `gemini-3.5-flash-lite`: structured
generation produced a valid candidate, independent verification promoted it,
the registry accepted it and separate sealed fixture scoring passed. Resume
reused the persisted response. Plan SHA-256:
`15cd35d89873922e476a04c96f2f0d81803c5a0fdd77cc3c7d9cdab00d922094`.
This is a development acceptance result, not a comparative benchmark result.

The live test exposed an SDK retry-wrapper error-body bug and an API schema
rejection. The provider now uses the SDK's single-fetch path, preserves sanitized
error codes across workers and builds a bounded schema from actual contract fields.
Prompt/schema version `single-call-v2` retains prior failed attempts separately.

`pnpm check` is the sequential API-free phase gate. Subsequent phase exits will
be recorded only after required local tests and external acceptance checks pass.

Phase 2 validation: lint and strict typechecking pass; all **103 tests in
17 files** pass. This includes seeded conversion properties, real worker access
denials, semantic rejection, promotion drift/tampering, tiny-quota resume,
bounded rate-limit recovery, final cache isolation and crash-safe publication.

## Phase 3 — complete

The usable MVP now includes a real MCP compatibility proxy, a separate-process
stdio server, bounded ComposeCalls with intermediate bindings, exact conversions,
response enum mapping, and a resettable SQLite refund workflow. V3 independently
checks amounts, state and side-effect counts, including retries and duplicate
effects. Stateful execution requires an explicit isolated fixture/simulator policy;
these permissions do not authorize real external writes.

Send-vs-draft and delete-vs-deactivate are rejected despite schema-valid success
responses. A separate bad-provenance fixture passes the gate and fails sealed
evaluation, demonstrating that hidden scoring can falsify a promotion.

Live composed synthesis passed on 2026-10-17 with `gemini-3.5-flash-lite`, followed
by independent promotion, the unchanged MCP client, sealed SQL assertions and
idempotent replay. Plan SHA-256:
`57e55bf8464315463df62400001c8db9e448a1fca11cdba2761a5c9584a7d0dc`.
Resume reused the persisted response with no new generation. Prompt version
`bounded-plan-v5` uses a flat typed wire format to avoid provider schema complexity;
the decoder and canonical DSL enforce all bounds and reject ambiguous records.

Latest validation: lint, strict typechecking and **123 tests in 23 files** pass.
Both API-free refund and retained live-response demos pass. No final-model quota
or comparative benchmark has been used. Phase 4 is next: freeze cases, sandbox
arbitrary baseline code and execute matched development regressions.

## Phase 4 — complete

The matched B0/B1/B2/B2-V/B3 runner, evidence parity manifests, repeated-trial
orchestration and count-first scoring are implemented. Real Docker acceptance
passes with a pinned official Node image, no host mounts/environment/network,
bounded RPC, nonroot execution and process/memory/CPU/time/output limits.
GitHub CI now includes the real sandbox checks.

Fifteen cases are frozen, three held out from tuning. A pre-scoring correction
to the limit case is recorded in suite version 2: opaque records and an independent
SQLite read observation replace a count-only oracle that could reward fabrication.
Version 1 remains intact; the frozen prompts and heuristics are unchanged.

The pilot completed all five methods, retaining invalid artifacts and hidden
monetary/semantic errors. Three B3 provider HTTP 400 errors prevent that pilot
from satisfying the phase exit. A generic serving-schema correction removes
provider array bounds while retaining canonical DSL bounds; live schema
acceptance now passes for the affected development families. Protocol version 2
freezes this correction before suite version 3's three fresh held-out cases are
authored. The revised regression completed all **75 case/method records** with
**zero infrastructure failures**, retained request/token accounting and verified
resume. Earlier pilots remain intact and are excluded from final claims.

The versioned development snapshot includes three invalid B3 model artifacts and
one B3 promotion falsified by the sealed stream-retrieval oracle. B0 has two hidden
false successes; B2 has three, and its same-artifact gated variant rejects them.
These are one-trial development observations, not final comparative conclusions.
The gate's finite evidence does not establish full old-domain compatibility.

Latest local gate: **133 tests in 28 files**, lint and typechecking pass. The real
Docker sandbox acceptance passes, and the previous checkpoint's core and sandbox
CI are green. Final evaluation requires three trials per stochastic case, retains
failed trials, caps requests at 18 per Pacific day and fingerprints executable
source/dependencies to prevent silently mixing implementations on resume.

## Phase 5 — provider outage; resumable continuation

The initial final-model commissioning received HTTP 503 on five reserved
requests, before any valid model response. The batch was stopped and its
diagnostics retained; no model-quality conclusion is drawn from those errors.
Outage handling now pauses before freezing a trial result and resumes the
pending request after an hourly backoff. The 18-request daily cap still counts
every attempt. Permanent infrastructure failures stop for review. An independent
test covers outage interruption, preserved attempts, recovery and completed-trial
resume. Final three-trial results remain pending.

### Phase 5 Tier 1 operational upgrade

The user authorized `gemini-3.8-flash` Tier 1 limits of 1,000 RPM, 2M TPM and
10,000 RPD, replacing the historical 18-request soft cap. Final execution uses
four concurrent independent cases and four model slots, with atomic durable
quota reservations and a shared process lease. Development defaults remain
unchanged. HTTP 503/504 still pauses admission and retries after hourly backoff;
inflight work drains and checkpoints. Completed and invalid model artifacts,
prior attempts, quota ledgers and original run manifests remain intact.

An explicit execution-epoch receipt audits operational changes against the
previous checkpoint and binds resume to the current executable fingerprint.
Frozen prompts, cases, heuristics, gates, scoring and protocol are unchanged.
Retained token accounting now includes published standard Tier 1 cost estimates
for known final-model usage; unknown responses are reported separately. Final
three-trial evaluation remains pending until all 195 result records complete.

Tier 1 validation: lint and strict typechecking pass; all **146 tests in 31
files** pass. The five real Docker sandbox acceptance checks pass, as does a
four-container parallel smoke check. A Git audit confirms no changes to frozen
benchmark data, prompts, heuristics, gates, scoring, protocol or dependencies.

### Phase 5 final evaluation - complete

All **195 records** completed on the frozen final model with zero infrastructure,
model-generation or execution failures. B0/B2/B2-V/B3 each recover **33/33
compatible trials**, safely reject **12/12 must-reject trials** and record zero
hidden false successes. B1 recovers **9/11 compatible cases** and safely rejects
**4/4 must-reject cases**. All 45 B2-V wrappers match their paired B2 hashes.
These ceiling results provide no measured quality advantage for B3 or B2-V;
development-model failures are not substituted for the final comparison.

The corrected run reserves 229 HTTP attempts (228 responses plus the retained
504); commissioning retains five earlier 503 attempts. The shared ledger has
234 requests. Known usage is 211,447 input and 137,573 output/thinking tokens,
with a standard-rate estimate of $0.674484; six outage attempts remain unknown.
Completed-run resume changes neither result hashes nor the quota ledger and
issues **zero new model calls**. The versioned final snapshot preserves counts,
records, accounting, the original manifest and the operational epoch receipt.
`pnpm bench:report` regenerates the summary without a key. Runtime source and
all frozen scientific artifacts remain unchanged after the measured run.


## Separate real-world external-validity evaluation - complete

The extension under `benchmarks/realworld-v1/` reproduces exact old/new public
Mindwtr, Nexus-MCP and mcp-sqlew revisions with synthetic fixtures. All old
workflows pass and unchanged old calls directly on new versions genuinely break.
The selected SHAs and preauthored evidence were presented and committed before
paid synthesis. Core source and all frozen flagship artifacts remain unchanged.

Nine independent trials produce Mindwtr 3/3 recovery, Nexus-MCP 3/3 recovery
and sqlew 0/3 recovery with 3/3 fail-closed rejections. The existing compiler
refuses sqlew's valid union-type schema; no core fix, schema narrowing, retuning
or replacement generation was performed. The separate report documents this
limitation, the genuinely parsed preseeded Nexus graph, and upstream quirks.

External usage: 9 calls, 12,726 input tokens, 985 visible output tokens and
8,036 thinking tokens; estimated spend $0.04337325 against a $1 hard cap,
with no unknown usage. Budget/partition checks and the 146-test core gate pass.
The original 195-record final benchmark is preserved and has not been rerun.


Validation: lint/typechecking, 146 unchanged core tests and two budget tests pass.
The final local test run serialized file workers to avoid Windows I/O timeouts;
no test timeouts or core sources were changed. All nine API-free replay outcomes
match the measured records, with zero additional Gemini calls. The 221 protected
files remain byte-for-byte unchanged. Separate CI checks cover the budget guard
and evidence-partition denial behavior without paid calls.

## Read-only frontend and evidence inspector — complete

The isolated `apps/inspector/` application adds Next.js, React, strict TypeScript,
Node.js and a read-only GraphQL artifact API. The overview explains the runtime;
URL-addressable migration pages inspect all 15 controlled cases and all three
public historical migrations. Historical trials are selectable. Adapter plans,
V0–V3 gates, provenance, sealed observations, benchmark counts and failure cases
come from completed artifacts. sqlew's 0/3 recovery and 3/3 safe rejection remain
prominent. Controlled and historical results stay separate.

Trial-1 controlled files were exported byte-for-byte for clone-ready inspection,
with source paths and SHA-256 receipts. A separately labeled, API-free local MCP
capture uses the existing verifier, promotion registry, proxy and SQLite fixture
unchanged. It records six actual backend calls across an unchanged invocation and
retry, with one ledger entry. It creates no new frozen benchmark result and uses
no model. The web app exposes no execution mutations and needs no API key.

Validation: **146 unchanged core tests**, **two historical budget tests**, **10
UI/API tests**, and **six desktop/mobile browser checks** pass. Strict TypeScript,
lint and production build pass. The root `pnpm dev` command launches the complete
interface. Screenshots were reviewed on desktop and mobile. A separate UI CI
workflow repeats checks, code generation, build and browser tests without keys.

The before/after audit covers **317 protected files**, including the original
221-file guard, all existing benchmark artifacts and synthetic fixtures. Raw
aggregate SHA-256 remains
`25aab4e3d73a68b58dee605aa827f9f5d4abbbafa83e38ee302e6789e3061ec9`.
The benchmark execution fingerprint remains
`ad4a35c05d8c2aba38e303fec9bdf12ee0e7c20c00bf0d278c43787e2546c299`.
All 195 final records, suite/protocol hashes, frozen prompts, gates, scoring,
heuristics, model/quota settings, core sources and the root lockfile are unchanged.

Run `pnpm ui:install` once, then `pnpm dev`. The [UI guide](inspector.md) documents
architecture, schema, routes, artifact provenance, validation and portable hashes.

## README editorial pass and public demo

I rewrote the README around the breaking-tool problem, the refund example and the
measured results. The opening defines the comparison without baseline acronyms,
states the ceiling result and schema-compiler failure, and reports known API cost
with its unknown-usage caveat. CI badges and a 90-second walkthrough replace the
phase-status opening. The earlier README is archived under `docs/history/`.

The original PRD moved to `docs/prd.md` without a byte change; the root design-tool
configuration was removed. I repaired the three lost-punctuation occurrences found
in prose and checked tracked text for valid UTF-8. The three scoped protected-file
changes have explicit before/after receipts in `docs/editorial-changes.json`.
Original integrity baselines, all trial records, prompts, gates and scoring remain
preserved; the audit accounts for the move rather than accepting a new baseline.

The public deployment uses the existing inspector and GraphQL service through a
Sites/Vinext hosting adapter. An allowlisted bundle of public versioned artifacts
replaces local filesystem reads; credentials, ignored runs and model/runtime
execution are excluded. All six desktop/mobile browser checks pass on the Worker.
Public version 1 deployed successfully at
https://contractrelay-inspector.fondsky12.chatgpt.site. [Hosting notes](hosting.md)
retain the exact source commit, saved version and archive hash.
The same six checks also pass against the public URL in fresh anonymous browser
contexts, confirming that a recruiter can open and navigate it without sign-in.

## Minimal product CLI

I added `contractrelay migrate --old ... --new ... --out ...`,
`contractrelay verify --plan ...`, and `contractrelay serve --plan ...` through a
local executable and `pnpm contractrelay` alias. The implementation wraps existing
snapshot ingestion, isolated synthesis, gates, registry and MCP proxy. It adds no
DSL, verifier, scoring or generated-code execution. The first product path is
read-only; the original isolated weather/refund fixture commands are unchanged.

Operator evidence and target settings travel in a companion context. Synthesis
cannot see the gate or target-launch data. Verification and serving require no
key; serving refuses unverified or changed artifacts and target drift. A failed
explicit re-verification revokes a prior CLI promotion through the registry.

Twelve focused CLI tests pass, including isolated synthesis with a controlled
provider, a real stdio MCP round trip, rejection, overwrites, drift, tampering and
revocation and disagreement during independently repeated promotion checks.
The checked-in weather example works without a model call. No paid
synthesis or benchmark evaluation was run. The original core sources and benchmark
execution fingerprint remain unchanged; new CLI entry points are outside the
frozen `src` directories. [Commands and examples](cli.md) document the workflow.

Final validation: all **158 tests across 32 files**, root lint and strict
TypeScript pass. The inspector's ten tests, protected-file audit and six browser
checks on the hosting Worker also pass. Historical evidence partition validation
passes for all three projects. No benchmark trial or paid API call was run.

## Harder historical migrations — realworld-v2

I evaluated Mapbox v0.11.0 → v0.12.3 and Microsoft Fabric 1.3.0 → 1.4.0 against
their actual historical servers. Both old workflows succeed and genuinely break
when sent unchanged to the new server. Source SHAs, native tools/list snapshots,
old success/direct break/native-new controls and separated evidence are versioned
under `benchmarks/realworld-v2/`.

Mapbox safely rejected all three independent trials because singleton-array
construction and the changed response are outside the DSL. Fabric produced three
invalid generations: its genuine hyphenated argument names violate the unchanged
identifier grammar. Fabric's verifier never ran, so these are generation failures,
not safe rejections. No core or CLI source, prompt, gate or scoring change was made.
Optional arXiv was deferred after the first two required setup repairs.

The extension used six Gemini calls, 10,794 input tokens, 806 output tokens and
6,641 thinking tokens, costing $0.03602175 under a durable $1 hard cap. All six
outcomes replay API-free, including parser failures from retained raw responses.
The API-free replay wrapper preserves the original evaluated harness and fixes
failure reconstruction without replacing a candidate or result.

The 321-file before/after audit, original 317-file inspector audit, all 195
controlled records and every v1 file remain unchanged. Core/CLI tests: 158 pass;
new extension tests: seven pass; inspector tests: twelve pass; desktop/mobile
browser checks: eight pass. The catalog now loads versioned historical summaries
without modifying earlier evidence and displays INCONCLUSIVE failures honestly.
README outcomes now count five migrations: two recovered, two safely rejected,
and one with generation failures. See the [v2 report](../benchmarks/realworld-v2/REPORT.md)
for exact SHAs, trial results, cost ledger, hashes and replay commands.

The public inspector's version 2 is deployed at
https://contractrelay-inspector.fondsky12.chatgpt.site using 127 allowlisted public
artifacts. [Hosting notes](hosting.md) retain the new source and archive receipts.

Offline report generation uses the committed interactions and budget ledger;
`report.mjs --offline` requires no ignored scheduler files or model credentials.
