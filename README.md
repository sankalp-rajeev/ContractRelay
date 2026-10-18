# ContractRelay

**Evidence-gated compatibility runtime for evolving agent tools.**

ContractRelay aims to preserve an unchanged agent's logical tool interface when
the backend contract changes. It proposes a bounded declarative `AdapterPlan`,
executes trusted deterministic translation, and independently verifies the
candidate before promotion. Insufficient evidence must result in rejection.

**Status: final three-trial evaluation complete.** Live Gemini
generation, evidence-gated promotion, MCP stdio compatibility, bounded composed
workflows and isolated SQLite state/side-effect checks pass acceptance tests.
The 15-case benchmark, matched baseline runner and hostile-code sandbox are
implemented. All **195 final records** are saved: 15 cases, three trials per
stochastic method, B1 once per case, and three held-out cases. All **146 tests**,
lint, typechecking, real Docker acceptance and GitHub CI pass.

The [final snapshot](benchmarks/results/final-v3.json) records B0, B2, B2-V and
B3 each recovering **33/33 compatible trials**, safely rejecting **12/12
must-reject trials**, and producing **0 hidden false successes**. B1 recovers
**9/11 compatible cases** and safely rejects **4/4 must-reject cases**. This
controlled suite reaches a ceiling for the final model: it provides no measured
quality advantage for B3 over the stochastic baselines. Development-model
failures remain separate observations. Run `pnpm bench:report` to regenerate
the measured summary from versioned records without an API key.

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
pnpm demo:refund
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
live MCP proxy. Stateful candidates require an explicit isolated fixture policy.

`pnpm check` runs lint, typecheck and every deterministic test sequentially with
`GEMINI_API_KEY` removed from child environments. It stops on the first failed gate.

`pnpm demo:verified` runs the complete controlled local lifecycle: load isolated
evidence, replay traces and independent predicates, reject a schema-valid semantic
mismatch, promote the good candidate, freeze its decision, then score a separate
input from sealed evidence. This uses no model and is not a benchmark result.

`pnpm demo:refund` exercises the real MCP client/proxy and a three-call SQLite
refund, then scores independent sealed state and idempotency assertions. To serve
the unchanged logical interface to an MCP stdio client, launch:

```sh
pnpm cli serve --fixture refund
```

This server uses controlled local data only. Node 22 requires the experimental
SQLite flag, which the scripts supply. Protocol messages use stdout; diagnostics
use stderr. `--plan path` can load a generated plan, which must pass the gate
before the server begins accepting calls.

## Repository

```text
packages/
  contracts/      schemas/hashes, atomic artifacts, evidence and worker boundaries
  dsl/            bounded AdapterPlan schema and static validation
  compiler/       deterministic candidate interpreter
  synthesizer/    structured Gemini provider and persistent quota/resume scheduler
  verifier/       V0–V3 gates, predicates, state and side-effect assertions
  runtime/        exact-hash promotion registry and policy-bound execution
  mcp/            paginated ingestion and old-interface compatibility proxy
  traces/         canonical JSONL validation and recursive credential redaction
  benchmark/      frozen-case loader, matched baselines, Docker sandbox and scoring
  cli/            development status/help and fixture MCP stdio server
fixtures/
  synthetic/     controlled, API-free development fixtures
  real/          reserved for optional post-v1 historical examples
benchmarks/
  manifests/     frozen protocol and 15-case suite hashes
  cases/         synthesis/gate/sealed partitions and executable task definitions
  traces/        benchmark replay evidence (not yet populated)
  oracles/       reserved for additional external oracle implementations
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
  `ProjectResponse`, bounded `ComposeCalls`, and explicit `Reject` artifacts.
- Source/target field checks, required-input checks, enum coverage, duplicate
  assignment rejection, safe response paths and explicit effect policies.
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
- Resettable SQLite state/side-effect gates, idempotent write replay and two
  schema-valid semantic rejection cases. Unknown effects fail closed.
- Real SDK MCP integration and a separate-process stdio client test. Runtime
  traces record plan/policy hashes, call order and translation operations.
- Persisted request reservations, retained per-attempt responses, bounded 429
  retries, quota-day stops, crash recovery and final-trial cache bypass.

Structural validation cannot establish semantic compatibility. An evidence
reference is an audit pointer, not proof that the referenced statement is true.
The verifier checks declared behavioral and isolated state/side-effect evidence.
Gate success does not imply success on unseen inputs.
Single-call translation uses object schemas and top-level input fields; response
projection supports nested object paths. Composition is sequential and limited
to eight allowlisted calls; only earlier results may be referenced. Unsupported
operators are rejected by the schema.

## Budget and evidence policy

The source of truth is [prd.md](prd.md), version 1.3. Its original required spend
is **$0**. The user subsequently authorized Tier 1 billing for Phase 5's selected
`gemini-3.8-flash` model and project limits of 1,000 RPM, 2M TPM and 10,000 RPD.
Paid fallback to another model remains forbidden. Development retains its earlier
configuration; frozen benchmark prompts, cases, heuristics, scoring and protocol
remain unchanged.

[.env.example](.env.example) documents provider/scheduler configuration.
[config/models.json](config/models.json) records model IDs, the development quota
snapshot and the user-authorized final quotas. Official [model documentation](https://ai.google.dev/gemini-api/docs/models)
and [pricing](https://ai.google.dev/gemini-api/docs/pricing) were checked on
2026-10-17; actual project quotas must still be checked in AI Studio.
Never commit `.env`, credentials, private traces or generated model run artifacts.

To reproduce the passing Phase 2 live acceptance check, copy `.env.example` to `.env`
and set `GEMINI_API_KEY` to a key from your free-tier Gemini project. Keep the
development model selected, then run:

```sh
pnpm synthesize:weather --resume
pnpm synthesize:refund --resume
```

This generates one controlled synthetic weather plan through the quota scheduler,
independently verifies it, retains artifacts under `runs/development/`, and writes
`reports/weather-live-verification.json`. Completed trials are skipped on resume.
The refund command generates and verifies a composed plan with real MCP and
SQLite fixtures. Final-model evaluation requires the frozen development
acceptance manifest. The live development-model check passed on 2026-10-17, including
promotion, separate sealed-fixture scoring and retained-response resume. This is
not a comparative benchmark result. Ordinary tests still use controlled transports.

Budgets and model IDs can be overridden with the documented environment names.
Final evaluation defaults to four concurrent independent cases and at most four
model calls; development defaults to one. Overrides allow 1–5 slots and cannot
exceed the authorized final quotas. Daily reservations and rolling RPM/TPM windows
are atomic, and a process lease excludes competing schedulers.
`CONTRACTRELAY_CACHE_MODE=dev` enables development-only caching; final trials
always bypass it. Daily exhaustion stops cleanly; there is no paid fallback.
The scheduler uses a cross-process lock; after a crash a stale lease can take
up to 30 seconds to expire before resume succeeds.
HTTP 503/504 pauses new work while inflight work checkpoints; continuation retries
after an hour. Token accounting includes invalid responses and thinking tokens.
Final usage reports estimate known token costs from the published standard rates;
missing responses remain explicit unknown usage. An audited execution epoch
preserves the original Phase 5 manifest and retained attempts during this upgrade.

Every frozen benchmark case separates synthesis evidence, gate evidence, and
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
generated-code production runtime. Unconstrained B2 baseline code executes only
inside the separate disposable Docker sandbox.

See [the benchmark protocol](docs/benchmark.md) for `pnpm bench --api-free`, the
development comparison, exact B2/B2-V pairing, evidence hashes and quota resume.
The [development snapshot](benchmarks/results/development-v3.json) is a single
Flash-Lite trial per stochastic case, including invalid artifacts and hidden
failures. It is not the final comparison. See [the demo](docs/demo.md) and
[related systems check](docs/related-work.md) for reproduction and claim boundaries.
The final snapshot includes retained request/token/cost accounting and verified
completed-run resume with **zero new model calls**. Known final usage is estimated
at **$0.674484** using the published standard rates; six retained outage attempts
have unknown usage and are excluded from that estimate.

See [onboarding](docs/onboarding.md), [build milestones](docs/roadmap.md), and
[architecture decisions](docs/adr/README.md). Phase 2's local and live acceptance
checks pass, as do Phase 3's composed MCP/SQLite checks, Phase 4's matched
development regression and Phase 5's frozen repeated-trial evaluation.


## Separate real-world external validity

A separate [historical MCP evaluation](benchmarks/realworld-v1/REPORT.md) reproduces
three public old/new migrations without changing the controlled flagship suite.
Mindwtr and Nexus-MCP each recover 3/3 trials; mcp-sqlew is rejected in all three
because of an [existing compiler schema limitation](benchmarks/realworld-v1/DEFECTS.md).
The nine synthesis calls cost an estimated $0.04337325 under a separate $1 cap.
These are selected, primarily read-only workflows with synthetic data; the Nexus
case uses a preseeded real parsed graph and does not validate full embedding/indexing.
Exact SHAs, provenance, sealed scoring and API-free replay commands are included.
