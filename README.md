# ContractRelay

**Evidence-gated compatibility runtime for evolving agent tools.**

ContractRelay aims to preserve an unchanged agent's logical tool interface when
the backend contract changes. It proposes a bounded declarative `AdapterPlan`,
executes trusted deterministic translation, and independently verifies the
candidate before promotion. Insufficient evidence must result in rejection.

**Status: repository foundation and deterministic primitive core.** This is not
yet the MVP. MCP serving, verification/promotion, Gemini synthesis, quota/resume
handling, composed workflows, and the comparative benchmark are planned.
No recovery or compatibility results have been measured.

## Quick start

Requires Node.js 22.12+ and pnpm 10.20.0. All commands below run without an API key.

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm demo
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

## Repository

```text
packages/
  contracts/      ToolContract schema, canonical JSON and SHA-256 hashing
  dsl/            bounded AdapterPlan schema and static validation
  compiler/       deterministic candidate interpreter
  synthesizer/    provider-neutral interface; provider/scheduler planned
  verifier/       initial report types; gate engine planned
  runtime/        promotion identity types; registry/serving planned
  mcp/            reserved for contract ingestion and compatibility proxy
  traces/         initial trace types; validation/redaction/replay planned
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

Structural validation cannot establish semantic compatibility. An evidence
reference is an audit pointer, not proof that the referenced statement is true.
The future verifier must independently check behavioral and state evidence.
Single-call translation uses object schemas and top-level input fields; response
projection supports nested object paths. Composition and other DSL operators
remain unsupported and are rejected by the schema.

## Budget and evidence policy

The source of truth is [prd.md](prd.md), version 1.3. Required external spend for
v1 is **$0**. Local infrastructure and account-approved Gemini free-tier usage
are the intended execution path; paid fallback is forbidden.

[.env.example](.env.example) reserves the later provider/scheduler settings.
[config/models.json](config/models.json) records the PRD's model IDs and quota
snapshot. These are user-supplied requirements, not verified current model
availability or account quotas. No provider is called or configured by the core.
Confirm availability and free-tier limits before the model integration milestone.
Never commit `.env`, credentials, private traces or generated model run artifacts.

Each future benchmark case must separate synthesis evidence, gate evidence, and
sealed final evaluation. The evaluator may open sealed evidence only after the
candidate and gate decision are recorded. The template directories document the
layout; an enforced loader/process boundary is still to be implemented.

## Scope and next step

The system contribution to evaluate is bounded synthesis plus deterministic
reuse plus independent evidence-gated promotion. Proxies, stable facades,
schema diffs and trace replay are existing techniques; this repository makes
no claim of proving semantic equivalence or being the first adapter system.

There is no planned v1 UI, hosted SaaS, protocol-version migrator or arbitrary
generated-code runtime. Unconstrained B2 baseline code will require a separate
sandbox before it can execute.

See [onboarding](docs/onboarding.md), [build milestones](docs/roadmap.md), and
[architecture decisions](docs/adr/README.md). The next smallest implementation
step is the evidence-partition loader with tests preventing synthesis/gate access
to sealed evidence, followed by verification and exact-hash promotion.
