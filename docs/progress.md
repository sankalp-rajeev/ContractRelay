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
