# Validated implementation checkpoints

## Phase 1 — complete

ToolContract, canonical hashing, primitive DSL/interpreter, MCP tools/list
ingestion and unit/property tests are implemented. Lint, strict typechecking
and 53 tests pass without any API key. The monetary property test includes 500
seeded values. No model or benchmark result is implied.

## Phase 2 — local implementation validated; live acceptance pending

Implemented evidence partitions, permission-restricted synthesis/verifier workers,
canonical trace replay/redaction, independent predicates/metamorphic checks,
deterministic V0/V1/V2 reports, exact-hash promotion/revocation, structured Gemini
generation, persistent quota accounting, per-attempt artifacts and crash/resume.

The local lifecycle accepts a compatible weather adapter, rejects schema-valid
wrong units, freezes the decision and only then opens and scores a separate input.
This is a controlled fixture demonstration, not a model or benchmark result.

Live Phase 2 acceptance remains pending because no Gemini API key is configured.
Configure a free-tier key locally in `.env` and run
`pnpm synthesize:weather --resume`. Phase 3 has not started; the PRD's live
structured-generation exit criterion has not been waived.

`pnpm check` is the sequential API-free phase gate. Subsequent phase exits will
be recorded only after required local tests and external acceptance checks pass.

Latest local validation: lint and strict typechecking pass; all **101 tests in
17 files** pass. This includes seeded conversion properties, real worker access
denials, semantic rejection, promotion drift/tampering, tiny-quota resume,
bounded rate-limit recovery, final cache isolation and crash-safe publication.
