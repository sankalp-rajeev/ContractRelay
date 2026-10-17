# ContractRelay

**Evidence-gated compatibility runtime for evolving agent tools.**

ContractRelay aims to preserve an unchanged agent's logical tool interface when
the backend contract changes. It proposes a bounded declarative `AdapterPlan`,
executes trusted deterministic translation, and independently verifies the
candidate before promotion. Insufficient evidence must result in rejection.

**Status: Phases 1 and 2 complete; Phase 3 is next.** Live Gemini generation,
read-only verification/promotion, enforced evidence isolation,
structured synthesis, and persisted quota/resume handling are implemented.
MCP serving, composed/stateful workflows and the comparative benchmark remain
planned. This is not yet the MVP, and no benchmark results have been measured.

## Quick start

Requires Node.js 22.12+ and pnpm 10.20.0. All commands below run without an API key.

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm check
pnpm demo
pnpm demo:verified
pnpm cli status
```

If pnpm is unavailable or an older Corepack fails signature verification, use
the pinned release through npm, without disabling integrity verification:

```sh
npm exec --yes --package=pnpm@10.20.0 -- pnpm install
npm exec --yes --package=pnpm@10.20.0 -- pnpm test
```

The same prefix works for the other commands. CI installs the pinned pnpm version
directly using `pnpm/action-setup`.

`pnpm demo` runs a hand-authored, local weather fixture:

```text
get_weather(city) -> fetch_forecast(location, units="imperial")
                 <- {temperature, conditions} projected from current.*
```

The output includes the old/new contract hashes, plan hash and translated result.
It is explicitly a **candidate fixture execution**, not an approved migration or
live MCP proxy. Candidates currently support read-only contracts only.

`pnpm check` runs lint, typecheck and every deterministic test sequentially with
`GEMINI_API_KEY` removed from child environments. It stops on the first failed gate.

`pnpm demo:verified` runs the complete controlled local lifecycle: load isolated
evidence, replay traces and independent predicates, reject a schema-valid semantic
mismatch, promote the good candidate, freeze its decision, then score a separate
input from sealed evidence. This uses no model and is not a benchmark result.

## Repository

```text
packages/
  contracts/      schemas/hashes, atomic artifacts, evidence and worker boundaries
  dsl/            bounded AdapterPlan schema and static validation
  compiler/       deterministic candidate interpreter
  synthesizer/    structured Gemini provider and persistent quota/resume scheduler
  verifier/       read-only V0/V1/V2 gate, predicates and metamorphic checks
  runtime/        exact-hash promotion registry and read-only execution
  mcp/            paginated contract ingestion; compatibility proxy planned
  traces/         canonical JSONL validation and recursive credential redaction
  benchmark/      baseline/run identifiers; harness/sandbox/scoring planned
  cli/            development status/help commands
fixtures/
  synthetic/     controlled, API-free development fixtures
  real/          reserved for optional post-v1 historical examples
benchmarks/
  manifests/     frozen benchmark definitions (not yet populated)
  traces/        benchmark replay evidence (not yet populated)
  oracles/       independent oracle implementations (planned)
  templates/     synthesis/gate/sealed-eval authoring layout
config/          zero-cost model/quota snapshot
docs/            onboarding, build order and architecture decisions
reports/         generated reports; output files ignored
scripts/         deterministic local demo
.github/         API-free lint/typecheck/test/smoke CI
```

Workspace packages export TypeScript source for local development with `tsx` and
Vitest. They are private and do not yet provide distributable builds or a globally
installed `contractrelay` executable.

## Implemented boundaries

- Strict Zod contract/plan schemas, explicit provenance and side-effect metadata.
- Stable contract and plan hashes with recursively sorted JSON object keys.
- `RenameTool`, `RenameArg`, `AddConstantDefault`, `ConvertType`, `MapEnum`,
  `ProjectResponse`, and explicit `Reject` artifacts.
- Source/target field checks, required-input checks, enum coverage, duplicate
  assignment rejection, safe response paths and read-only policy.
- JSON Schema checks at old-input, translated-input, backend-output and
  old-output boundaries. The interpreter never generates or evaluates code.
- Candidate execution restricted by API naming to verification fixtures.
- Paginated MCP tools/list snapshots; server safety hints remain untrusted.
- Exact decimal scaling to safe integers, including dollars-to-cents conversion.
- Hash-checked evidence partitions and immutable candidate/decision artifacts.
- Permission-restricted synthesis/verifier processes with no host environment or
  filesystem access beyond their trusted bundled code; tools/model calls use
  narrow host capabilities. Direct sealed-file reads fail in both worker types.
- Read-only replay and independent behavioral/metamorphic predicates; missing
  evidence and unsupported defaults fail closed. Promotion repeats verification.
- Promotion artifact integrity checks, explicit revocation and contract drift refusal.
- Persisted request reservations, retained per-attempt responses, bounded 429
  retries, quota-day stops, crash recovery and final-trial cache bypass.

Structural validation cannot establish semantic compatibility. An evidence
reference is an audit pointer, not proof that the referenced statement is true.
The verifier checks declared behavioral evidence; V3 state/side-effect support
remains future work. Gate success does not imply success on unseen inputs.
Single-call translation uses object schemas and top-level input fields; response
projection supports nested object paths. Composition and other DSL operators
remain unsupported and are rejected by the schema.

## Budget and evidence policy

The source of truth is [prd.md](prd.md), version 1.3. Required external spend for
v1 is **$0**. Local infrastructure and account-approved Gemini free-tier usage
are the intended execution path; paid fallback is forbidden.

[.env.example](.env.example) documents provider/scheduler configuration.
[config/models.json](config/models.json) records the PRD's model IDs and account
quota snapshot. Official [model documentation](https://ai.google.dev/gemini-api/docs/models)
and [pricing](https://ai.google.dev/gemini-api/docs/pricing) were checked on
2026-10-17; actual project quotas must still be checked in AI Studio.
Never commit `.env`, credentials, private traces or generated model run artifacts.

To reproduce the passing Phase 2 live acceptance check, copy `.env.example` to `.env`
and set `GEMINI_API_KEY` to a key from your free-tier Gemini project. Keep the
development model selected, then run:

```sh
pnpm synthesize:weather --resume
```

This generates one controlled synthetic weather plan through the quota scheduler,
independently verifies it, retains artifacts under `runs/development/`, and writes
`reports/weather-live-verification.json`. Completed trials are skipped on resume.
Final-model use is blocked in this command until later benchmark prerequisites
are implemented. The live development-model check passed on 2026-10-17, including
promotion, separate sealed-fixture scoring and retained-response resume. This is
not a comparative benchmark result. Ordinary tests still use controlled transports.

Budgets and model IDs can be overridden with the documented environment names.
Scheduling is sequential; the current implementation requires concurrency 1.
`CONTRACTRELAY_CACHE_MODE=dev` enables development-only caching; final trials
always bypass it. Daily exhaustion stops cleanly; there is no paid fallback.
The scheduler uses a cross-process lock; after a crash a stale lease can take
up to 30 seconds to expire before resume succeeds.

Each future benchmark case must separate synthesis evidence, gate evidence, and
sealed final evaluation. The evaluator may open sealed evidence only after the
candidate and gate decision are recorded. The template directories document the
layout. The loader and process boundaries now enforce these roles; trusted
coordinator code alone freezes decisions and opens sealed evaluation.

## Scope and next step

The system contribution to evaluate is bounded synthesis plus deterministic
reuse plus independent evidence-gated promotion. Proxies, stable facades,
schema diffs and trace replay are existing techniques; this repository makes
no claim of proving semantic equivalence or being the first adapter system.

There is no planned v1 UI, hosted SaaS, protocol-version migrator or arbitrary
generated-code runtime. Unconstrained B2 baseline code will require a separate
sandbox before it can execute.

See [onboarding](docs/onboarding.md), [build milestones](docs/roadmap.md), and
[architecture decisions](docs/adr/README.md). Phase 2's local and live acceptance
checks pass. Phase 3's next work is the real MCP proxy and stateful composition.
