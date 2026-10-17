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

Latest local validation: lint and strict typechecking pass; all **103 tests in
17 files** pass. This includes seeded conversion properties, real worker access
denials, semantic rejection, promotion drift/tampering, tiny-quota resume,
bounded rate-limit recovery, final cache isolation and crash-safe publication.

## Phase 3 — next

Real MCP proxy, bounded composed calls, isolated SQLite state oracles and
idempotency/side-effect checks follow the now-green Phase 2 exit gate.
