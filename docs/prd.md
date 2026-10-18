# ContractRelay
## Evidence-Gated Compatibility Runtime for Evolving Agent Tools

**Document type:** Product Requirements Document (PRD)  
**Version:** 1.3 — Zero-Cost, Quota-Aware Flagship Scope  
**Status:** Approved to Build — $0 required external spend  
**Date:** 2026-10-17  
**Primary implementation:** TypeScript / Node.js  
**Primary ecosystem:** MCP, with an architecture that can later support OpenAPI/function-tool contracts  
**Target implementation window:** ~4–5 focused engineering weeks, expected to span ~6–8 calendar weeks alongside coursework/research/applications; publish the MVP earlier and complete the benchmark afterward  
**Required external budget:** **$0** — local infrastructure + Gemini Developer API Free Tier only; paid API/cloud usage is out of scope for v1  

---

## 1. Executive Summary

AI agents increasingly depend on external tools exposed through MCP servers, function-calling APIs, OpenAPI endpoints, internal services, and SDK wrappers. Those tool contracts evolve: tools are renamed or removed, required parameters are added, types and enums change, response shapes move, one operation becomes several, or the semantics of an operation change without a simple schema-level signal.

An agent built against the old contract can then fail, replan repeatedly, or—more dangerously—continue running while producing semantically wrong behavior.

**ContractRelay** is a runtime compatibility layer for this problem.

Given:

1. the **old agent-facing tool contract**,
2. the **new tool contract**,
3. available change evidence such as documentation, diffs, examples, and historical traces,
4. **promotion evidence** such as selected traces, invariants, and state/side-effect predicates.

Final benchmark scoring uses a separate **sealed evaluation evidence** partition—unseen inputs, workflow variants, state assertions, and side-effect assertions that are never available to synthesis or the promotion gate.

ContractRelay synthesizes a **constrained `AdapterPlan`**, compiles that plan into deterministic runtime translation logic, independently verifies the candidate adapter, and only promotes it when the configured evidence gates pass.

The agent continues calling the old interface:

```text
unchanged agent
      |
      | old stable logical contract
      v
 ContractRelay
      |
      | verified deterministic translation
      v
 evolved MCP/API tool
```

ContractRelay is intentionally **fail-closed**. If compatibility cannot be established with sufficient evidence, the result is `REJECT`, not an unverified migration.

The project is **not** an MCP protocol-version migration utility, a schema-diff tool, a generic API migration framework, or an arbitrary LLM code generator. Existing work already addresses those pieces. The intended contribution is the combination of:

> **automatic bounded compatibility synthesis + deterministic runtime translation + independent evidence-based verification + stable agent-facing contracts + fail-closed promotion.**

---

## 2. Project Name and Positioning

### 2.1 Name

**ContractRelay**

### 2.2 Full name

**ContractRelay — Evidence-Gated Compatibility Runtime for Evolving Agent Tools**

### 2.3 One-line description

ContractRelay keeps deployed AI agents working across tool-contract changes by synthesizing a constrained compatibility adapter and refusing to activate it until independent verification passes.

### 2.4 Thirty-second explanation

AI agents rely on tools, but those tools change over time. Parameters get renamed, outputs change, tools split, and semantics shift. ContractRelay sits between an unchanged agent and the new tool version. It automatically proposes a small typed adapter from the old contract to the new one, compiles it into deterministic TypeScript, replays historical calls and workflows, checks schema, output, side-effect, and end-state behavior, and only promotes the adapter if those checks pass. Otherwise it rejects the migration instead of guessing.

---

## 3. Background and Motivation

### 3.1 Why this problem exists

Tool-using agents are coupled to more than a tool name. They depend on:

- input parameter names and required fields;
- input types, constraints, and enums;
- output schema and field meaning;
- error behavior;
- side effects;
- idempotency assumptions;
- implicit defaults;
- tool descriptions that influence model planning;
- sequencing assumptions across multi-step workflows.

A schema can remain syntactically valid while the behavior expected by the agent is no longer preserved.

Example:

```text
Old tool:
  send_email(recipient, subject, message)
  -> sends the message

New tool:
  create_message(recipients, title, body, send_immediately)
  -> defaults send_immediately = false
```

A naive adapter may map all fields successfully while accidentally creating a draft instead of sending an email. Structural compatibility would pass; semantic workflow compatibility would fail.

### 3.2 Evidence that tool evolution is a real agent problem

MCPEvol-Bench (2026) studies MCP evolution at meaningful scale. Its empirical study analyzes **515 MCP servers, 9,273 historical versions, and 6,436 distinct tools**. From that study it derives **11 evolution operators** and constructs an executable benchmark over **123 servers, 1,272 tools, and 201 tasks**. Frontier agents still degrade under evolved toolsets; the paper reports performance declines of **13.7% for GPT-5.4** and **14.4% for Claude Sonnet 4.6**.

This is direct evidence that strong agents do not trivially absorb tool evolution.

The paper also exposes an important benchmark-design constraint: **historical MCP versions often become non-functional because of broken dependencies, invalid URLs, and runtime-environment changes.** MCPEvol-Bench therefore learns evolution patterns from real histories but evaluates them through controlled source-level mutations that remain executable.

ContractRelay adopts the same distinction:

- **real histories motivate the change classes**;
- **controlled executable cases provide the primary benchmark**;
- **real historical MCP histories ground the change taxonomy**, but resurrecting historical server versions is not part of flagship v1 acceptance because dependency/runtime breakage can dominate the engineering effort.

### 3.3 MCP protocol compatibility is not the target problem

The MCP `2026-07-28` specification includes protocol-version handling and compatibility mechanisms. ContractRelay does not attempt to replace them.

ContractRelay targets **application-level tool-contract evolution**: parameter changes, response changes, tool replacement, multi-call decomposition, and semantic behavior changes. A protocol can negotiate successfully while the agent-facing tool semantics are still incompatible.

## 4. Product Vision

A production agent should be able to depend on a **logical tool contract** instead of being tightly coupled to every backend tool revision.

When the backend changes, the desired lifecycle is:

```text
old contract + new contract + evidence
                |
                v
       candidate AdapterPlan
                |
                v
      deterministic compiler
                |
                v
        candidate adapter
                |
                v
       independent verifier
          /           \
       PASS           FAIL
        |               |
        v               v
     PROMOTE          REJECT
        |
        v
stable old interface -> new implementation
```

The agent does not receive a silently changing interface. Compatibility becomes a reviewable, reproducible artifact with explicit evidence.

---

## 5. Goals

### G1. Preserve stable agent-facing contracts

Allow an agent written against contract `C_old` to continue invoking that logical contract after the underlying implementation moves to `C_new`.

### G2. Automatically synthesize bounded migrations

Use an LLM or other inference component to propose a migration only through a constrained `AdapterPlan` DSL, not arbitrary source code.

### G3. Compile plans deterministically

Every accepted plan must compile to deterministic, inspectable runtime translation code.

### G4. Verify before promotion

No synthesized adapter is activated solely because the LLM believes it is correct. Independent verification must determine promotion eligibility.

### G5. Fail closed

When evidence is incomplete, behavior is ambiguous, side effects cannot be safely evaluated, or the plan uses unsupported semantics, return `REJECT`.

### G6. Support real evolution classes

The initial system must cover more than toy renames, including type changes, enum mapping, response projection, composition, and at least one multi-call evolution class.

### G7. Evaluate against strong matched-information baselines

The final evaluation must compare ContractRelay with agents or migration systems that receive the same relevant old/new contracts, docs, change information, examples, traces, and tests where applicable.

### G8. Produce portfolio-quality engineering artifacts

The repository must demonstrate systems design, typed interfaces, tests, CI, reproducible evaluation, and a credible technical report—not only a demo script.

---

## 6. Non-Goals

ContractRelay v1 will **not** attempt to:

1. solve MCP protocol-version migration or replace `mcp-migrate`;
2. be a general MCP/OpenAPI schema drift detector;
3. rewrite arbitrary client source code like general API/library migration tools;
4. prove mathematical semantic equivalence for arbitrary programs;
5. execute arbitrary LLM-generated TypeScript/Python code;
6. provide a hosted SaaS control plane;
7. build a graphical UI before the core runtime and evaluation are complete;
8. handle authentication/credential migration beyond passing already-resolved runtime credentials;
9. train or fine-tune a foundation model;
10. guarantee safe automation for irreversible actions without an appropriate oracle;
11. replace ordinary agent replanning where no stable-contract requirement exists;
12. treat MCP protocol revision compatibility and application tool compatibility as the same problem.

---

## 7. Core Research Questions

### RQ1 — Recovery

Can a reusable synthesized adapter recover workflows broken by tool evolution at least competitively with strong agent replanning and generic wrapper generation under matched information?

### RQ2 — Safety under hidden evaluation

After promotion using only declared **gate evidence**, can ContractRelay achieve a lower false-compatible rate on **sealed held-out evaluation evidence** than unconstrained wrapper generation and agent replanning?

### RQ3 — Reuse and amortization

For repeated executions after one tool migration, does a persistent deterministic adapter reduce recurring model inference, variance, and migration effort relative to per-run replanning?

### RQ4 — Change-class coverage

Which evolution classes are reliably automatable, which require stronger evidence, and which should be rejected?

### RQ5 — Verification value

Holding the generated wrapper constant, how much does the verification gate improve safety? Compare an unconstrained wrapper without the gate (`B2`) against the same wrapper passed through the ContractRelay gate (`B2-V`).

### RQ6 — DSL value

Holding the verification policy constant, does constrained `AdapterPlan` synthesis improve reliability, determinism, auditability, or supported coverage compared with an unconstrained generated wrapper passed through the same gate (`B2-V` vs `B3`)?

### RQ7 — Fail-closed behavior

Can the system correctly refuse structurally plausible but semantically unsupported migrations rather than forcing a compatibility mapping?

## 8. Core Hypotheses and Success Logic

**H1.** ContractRelay will outperform deterministic heuristics on non-trivial changes such as response reshaping and bounded call composition.

**H2.** Evidence-gated promotion will reduce false-compatible outcomes on **sealed evaluation evidence**, not merely on the predicates used during promotion.

**H3.** Applying the same ContractRelay gate to an unconstrained wrapper (`B2-V`) will improve safety over the ungated wrapper (`B2`), isolating the value of verification.

**H4.** Under the same gate, constrained `AdapterPlan` synthesis (`B3`) will provide better determinism/auditability and may improve safety or coverage compared with unconstrained wrapper code (`B2-V`).

**H5.** Against strong replanning, ContractRelay may tie or slightly trail raw recovery while still providing a meaningful systems advantage through deterministic repeated execution, lower recurring inference, stable contracts, and auditable migration artifacts.

**H6.** ContractRelay will correctly reject at least some migrations that are structurally plausible but semantically unsafe.

The project is considered successful if all of the following hold:

1. it handles non-trivial changes beyond rename/default cases;
2. its safety claims hold on **hidden evaluation evidence not exposed to synthesis or promotion**;
3. the evaluation can separately show the effect of verification (`B2` vs `B2-V`) and the constrained DSL/runtime (`B2-V` vs `B3`);
4. it exposes a stable old interface through a real MCP runtime;
5. it has at least one objective stateful workflow oracle and at least two unsafe migrations that are correctly rejected;
6. results are reproducible and benchmark information is matched fairly across methods;
7. stochastic model-based methods are evaluated over repeated trials rather than a single lucky run.

A raw-recovery leaderboard win over every baseline is **not** required. A strong result can be comparable recovery with materially lower hidden-evaluation false compatibility and zero recurring migration inference after promotion.

## 9. Terminology

| Term | Definition |
|---|---|
| `C_old` | Old logical contract expected by the existing agent. |
| `C_new` | New tool contract exposed by the evolved implementation. |
| ToolContract | Normalized internal representation of a tool interface and relevant semantics. |
| AdapterPlan | Constrained declarative program that maps old calls/results to the new tool(s). |
| Adapter | Deterministically compiled executable implementation of an AdapterPlan. |
| Synthesis evidence | Contracts, docs, diffs, examples, and other information available to the adapter generator. |
| Gate evidence | Selected traces, invariants, predicates, and sandbox state checks available to the verification gate before promotion. |
| Sealed evaluation evidence | Inputs, workflow variants, state assertions, and side-effect assertions withheld from both synthesis and promotion and used only for final scoring. |
| Verification gate | A check that must pass before promotion using gate evidence only. |
| Promotion | Making a candidate adapter available to the runtime. |
| False compatible | Adapter is promoted but does not preserve required behavior. |
| Safe rejection | System refuses to create/promote an adapter because compatibility is unsupported or insufficiently evidenced. |
| Workflow oracle | Independent method for deciding whether the old and migrated workflows reached an acceptable equivalent result/end state. |

---

## 10. Target Users

### 10.1 Primary persona: Agent platform engineer

Maintains agents that call multiple versioned tools and wants to avoid updating prompts/agents every time a backend interface changes.

### 10.2 Secondary persona: Tool/MCP maintainer

Publishes a new tool version and wants to evaluate whether old agent-facing behavior can be safely maintained.

### 10.3 Research/evaluation persona

Studies agent reliability under tool evolution and needs reproducible migration and verification artifacts.

---

## 11. Primary User Stories

### US-01 — Preserve an old tool interface

As an agent platform engineer, I want to expose the old logical tool contract while using a new backend so existing agents do not require immediate modification.

### US-02 — Generate a migration plan

As a maintainer, I want ContractRelay to propose a bounded mapping from old to new contracts using the available evidence.

### US-03 — Reject unsafe mappings

As a maintainer, I want the system to refuse a migration when it cannot establish sufficient evidence of compatibility.

### US-04 — Inspect why an adapter was accepted

As a reviewer, I want a promotion report listing the exact plan, evidence, tests, verification results, and residual risk.

### US-05 — Replay historical workflows

As an engineer, I want to run previous successful calls/workflows through the candidate adapter and compare the resulting outputs/state with explicit oracles.

### US-06 — Compare against baselines

As a researcher, I want a repeatable evaluation harness that compares ContractRelay with replanning, per-call repair, heuristics, and generic wrapper generation.

---

## 12. System Architecture

### 12.1 Top-level architecture

```text
                 +--------------------------+
                 |  Old Tool Contract       |
                 +--------------------------+
                              |
                              |
                 +--------------------------+
                 |  New Tool Contract       |
                 +--------------------------+
                              |
                              v
                    +------------------+
                    | Contract Normal. |
                    |  ToolContract IR |
                    +------------------+
                              |
                  evidence -->|
                              v
                    +------------------+
                    | Plan Synthesizer |
                    +------------------+
                              |
                       AdapterPlan DSL
                              |
                              v
                    +------------------+
                    | Plan Validator   |
                    +------------------+
                              |
                              v
                    +------------------+
                    | Plan Compiler    |
                    +------------------+
                              |
                     candidate adapter
                              |
                              v
         +-------------------------------------------+
         |             Verification Engine           |
         | schema | trace | behavioral | side effect |
         | metamorphic | workflow/end-state oracles  |
         +-------------------------------------------+
                         |              |
                       PASS            FAIL
                         |              |
                         v              v
                  Promotion Store     REJECT
                         |
                         v
                  +--------------+
 agent old call ->| Runtime Proxy |-> evolved tool(s)
                  +--------------+
```

### 12.2 Major components

1. **Contract Ingestion & Normalization**
2. **Change Evidence Packager**
3. **AdapterPlan Synthesizer**
4. **DSL Validator**
5. **Deterministic Adapter Compiler**
6. **Verification Engine**
7. **Promotion Registry**
8. **Runtime Compatibility Proxy**
9. **Trace Recorder/Replayer**
10. **Evaluation Harness**
11. **CLI**

---

## 13. ToolContract Intermediate Representation

The `ToolContract` is the normalized representation used throughout the system.

### 13.1 Required fields

```ts
interface ToolContract {
  contractId: string;
  version?: string;
  provenance: Provenance;

  name: string;
  description?: string;

  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;

  errorContract?: ErrorContract;
  sideEffect: SideEffectClass;
  idempotency: IdempotencyClass;

  examples?: ToolExample[];
  semanticAnnotations?: SemanticAnnotation[];
}
```

### 13.2 Side-effect classification

```text
READ_ONLY
IDEMPOTENT_WRITE
REVERSIBLE_WRITE
IRREVERSIBLE_WRITE
UNKNOWN
```

Default handling:

- `READ_ONLY`: normal verification policy.
- `IDEMPOTENT_WRITE`: state oracle or replay-safe sandbox required.
- `REVERSIBLE_WRITE`: isolated test environment plus state oracle required.
- `IRREVERSIBLE_WRITE`: do not execute against real systems; use simulator/fixture or require explicit human evidence.
- `UNKNOWN`: fail closed for promotion unless policy explicitly overrides.

### 13.3 Idempotency classification

```text
IDEMPOTENT
NON_IDEMPOTENT
CONDITIONAL
UNKNOWN
```

### 13.4 Provenance

Every contract must record where it came from:

- MCP live snapshot;
- MCP manifest;
- OpenAPI document;
- manually curated fixture;
- repository version/tag;
- benchmark source;
- synthetic mutation.

This enables reproducibility and prevents benchmark cases from becoming untraceable examples.

---

## 14. AdapterPlan DSL

### 14.1 Design principle

The LLM proposes **declarative operations**, never unchecked gateway code.

### 14.2 Initial operation set

```text
RenameTool
RenameArg
AddConstantDefault
DeriveArg
ConvertType
MapEnum
ProjectResponse
RenameResponseField
ComposeCalls
SplitCall
MapError
Reject
```

### 14.3 Example

Old contract:

```text
get_weather(city: string)
```

New contract:

```text
fetch_forecast(location: string, units: "metric" | "imperial")
```

Candidate plan:

```yaml
version: 1
source_tool: get_weather
target:
  kind: single
  tool: fetch_forecast
steps:
  - op: RenameArg
    from: city
    to: location
  - op: AddConstantDefault
    arg: units
    value: imperial
response:
  - op: ProjectResponse
    mapping:
      temperature: current.temperature
      conditions: current.summary
```

### 14.4 DSL restrictions

The DSL MUST NOT allow:

- arbitrary source code;
- arbitrary shell execution;
- arbitrary network destinations;
- dynamic `eval`;
- hidden side effects;
- unbounded loops;
- arbitrary file access.

`DeriveArg` must use a safe expression language or registered pure function set.

`ComposeCalls` and `SplitCall` must reference only explicitly allowed target tools.

### 14.5 Static validation

Before compilation, every plan must pass:

- operation schema validation;
- source field existence checks;
- target field existence checks;
- type compatibility checks where decidable;
- no duplicate target assignments unless explicitly allowed;
- call graph acyclicity;
- maximum composition depth;
- side-effect compatibility policy;
- no unsupported operation/version.

---

## 15. Synthesis Engine

### 15.1 Inputs

The synthesizer receives a structured **synthesis evidence** package:

```text
C_old
C_new
contract diff
change documentation
examples
historical calls/workflows explicitly designated for synthesis
known semantic annotations available in deployment
side-effect metadata
```

The synthesizer MUST NOT receive sealed final-evaluation inputs, hidden state assertions, hidden side-effect assertions, or hidden expected labels.

Gate-only evidence may also be withheld from synthesis when an experiment is intended to measure whether independent verification catches a bad candidate.

### 15.2 Output

Exactly one of:

```text
AdapterPlan(candidate)
Reject(reason, missing_evidence, risk)
```

### 15.3 LLM role

The LLM is useful for:

- inferring likely semantic correspondence;
- proposing enum mappings;
- selecting likely derived values;
- identifying one-to-many or many-to-one tool relations;
- interpreting natural-language change documentation.

The LLM is **not** trusted to determine promotion.

### 15.4 Evidence isolation

Every benchmark case must store three logically separate partitions:

```text
synthesis_evidence/
gate_evidence/
sealed_eval/
```

The benchmark runner must make it impossible for the synthesis or promotion code path to load `sealed_eval/` before a promotion/rejection decision is recorded.

### 15.5 Confidence is advisory only

Model self-reported confidence must never substitute for independent verification.

## 16. Deterministic Compiler

The compiler converts a validated `AdapterPlan` into executable TypeScript runtime logic.

### 16.1 Compiler requirements

- deterministic output for the same plan/version;
- no network calls during compilation;
- no model calls during runtime execution;
- generated code or executable IR must be inspectable;
- source maps/logical operation tracing for debugging;
- plan hash embedded in compiled artifact;
- strict input/output validation boundaries;
- stable error mapping.

### 16.2 Compilation modes

**MVP mode:** execute a validated AST/IR directly through a deterministic interpreter.

**Optional later mode:** emit generated TypeScript source for inspection/distribution.

The interpreter-first approach is preferred initially because it avoids generating and loading arbitrary code while preserving deterministic execution.

---

## 17. Verification Engine

Verification is the defining feature of ContractRelay, but its value must be evaluated without reusing the same evidence for both promotion and scoring.

### 17.1 Verification evidence boundary

The verifier may use **gate evidence** only. It must not access sealed final-evaluation artifacts.

For each case:

```text
Synthesis evidence -> candidate adapter
Gate evidence      -> PROMOTE / REJECT / INCONCLUSIVE
Sealed evaluation  -> final compatibility score after decision is frozen
```

The runner must record the candidate artifact and promotion verdict before opening the sealed evaluation partition.

### 17.2 Verification levels

#### V0 — Structural

- old-call validation against `C_old`;
- translated-call validation against `C_new`;
- translated response validation;
- error-shape checks.

V0 alone is not sufficient for semantic promotion.

#### V1 — Trace compatibility

Replay **gate-designated** historical successful old calls and confirm that candidate translation executes and returns structurally acceptable results.

#### V2 — Behavioral compatibility

Use gate-visible tests, output predicates, metamorphic relations, and semantic invariants to confirm the new behavior satisfies old expectations.

#### V3 — State/side-effect compatibility

For stateful workflows, compare gate-visible independently observable end state and side effects in an isolated fixture.

Examples:

- database row changed as expected;
- exactly one email is sent;
- refund amount and status match;
- no duplicate write occurs during retries.

A hidden final assertion may still test a related but unseen property after promotion. For example, the gate may check refund amount and duplicate count while sealed evaluation additionally checks ledger provenance or an unseen partial-refund input.

### 17.3 Default promotion policy

| Tool class | Minimum default level |
|---|---:|
| READ_ONLY | V2 |
| IDEMPOTENT_WRITE | V3 |
| REVERSIBLE_WRITE | V3 in isolated environment |
| IRREVERSIBLE_WRITE | simulator/fixture evidence + explicit policy; otherwise reject |
| UNKNOWN | reject |

### 17.4 Evidence-gated outcome

A candidate has three states:

```text
PROMOTED
REJECTED
INCONCLUSIVE
```

`INCONCLUSIVE` must behave like rejection at runtime unless an explicit human override policy is introduced later.

### 17.5 Verification report

Every verification run produces:

```json
{
  "plan_hash": "...",
  "contract_old_hash": "...",
  "contract_new_hash": "...",
  "gate_evidence_hash": "...",
  "checks": [],
  "traces_total": 0,
  "traces_passed": 0,
  "oracle_results": [],
  "side_effect_results": [],
  "verdict": "PROMOTED | REJECTED | INCONCLUSIVE",
  "residual_risks": []
}
```

The report intentionally contains no sealed-evaluation result. That result is generated only after the promotion verdict is frozen.

## 18. Runtime Compatibility Proxy

### 18.1 Runtime responsibility

Once an adapter is promoted, the runtime exposes `C_old` and translates calls to `C_new`.

### 18.2 Runtime requirements

- no LLM call in the hot path for promoted adapters;
- validate old input before translation;
- execute only the promoted plan hash;
- validate translated input;
- invoke target tool(s);
- validate/map result back to old contract;
- preserve deterministic error semantics where supported;
- capture structured telemetry;
- include idempotency handling for supported side-effecting workflows;
- refuse calls when promoted artifact and contract hashes do not match.

### 18.3 MCP integration

MVP should support:

1. loading/snapshotting tools from an MCP server;
2. exposing a compatibility MCP server/proxy to an agent;
3. forwarding calls to the evolved MCP server after translation.

The core compiler and verifier should remain protocol-neutral enough to later support OpenAPI/function tools.

---

## 19. Promotion Registry

Promoted adapters need explicit versioned identity.

### 19.1 Promotion key

```text
(old_contract_hash, new_contract_hash, adapter_plan_hash, policy_version)
```

### 19.2 Stored artifacts

```text
old.contract.json
new.contract.json
change.evidence.json
adapter.plan.json
verification.report.json
promotion.manifest.json
```

### 19.3 Invalidation

A promoted adapter is invalidated if:

- target contract hash changes;
- policy version requires stronger verification;
- an associated regression test fails;
- a new known semantic incompatibility is recorded.

---

## 20. CLI Requirements

Proposed CLI name: `contractrelay`.

### 20.1 Snapshot

```bash
contractrelay snapshot mcp \
  --server "node ./server.js" \
  --out snapshots/v1.json
```

### 20.2 Compare/prepare evidence

```bash
contractrelay prepare \
  --old snapshots/v1.json \
  --new snapshots/v2.json \
  --traces traces.jsonl \
  --docs migration.md \
  --out evidence/
```

### 20.3 Synthesize

```bash
contractrelay synthesize \
  --evidence evidence/ \
  --out candidates/adapter.plan.json
```

### 20.4 Verify

```bash
contractrelay verify \
  --plan candidates/adapter.plan.json \
  --suite suites/orders.yaml \
  --out reports/verification.json
```

### 20.5 Promote

```bash
contractrelay promote \
  --report reports/verification.json
```

Promotion must refuse a failing or inconclusive report.

### 20.6 Serve

```bash
contractrelay serve \
  --old-contract snapshots/v1.json \
  --target http://localhost:9000/mcp
```

### 20.7 Evaluate

```bash
contractrelay eval \
  --suite benchmarks/flagship-v1 \
  --baselines b0,b1,b2,b2v,b3 \
  --out results/
```

---

## 21. Functional Requirements

### Contract ingestion

**FR-001** The system shall ingest MCP tool definitions into `ToolContract` IR.  
**FR-002** The system shall preserve provenance and version identifiers when available.  
**FR-003** The system shall preserve input schema, output schema when available, descriptions, and error metadata when available.  
**FR-004** The system shall allow manually supplied side-effect and idempotency metadata.  
**FR-005** The system shall compute stable contract hashes.

### Evidence packaging

**FR-010** The system shall bundle old/new contracts, docs, examples, traces, and test/oracle metadata into a reproducible evidence package.  
**FR-011** Missing evidence shall be explicit rather than silently inferred.  
**FR-012** The same evidence package shall be reusable by matched-information baselines.

### Synthesis

**FR-020** The synthesizer shall emit only schema-valid `AdapterPlan` or `Reject`.  
**FR-021** The synthesizer shall never emit executable arbitrary code as the trusted migration artifact.  
**FR-022** The system shall support the v1 DSL operation set.  
**FR-023** Every inferred mapping shall include rationale/evidence references for auditability.  
**FR-024** The synthesizer shall be able to reject when no safe plan is supported.

### Compilation

**FR-030** Plans shall be statically validated before execution.  
**FR-031** Invalid plans shall fail compilation with machine-readable diagnostics.  
**FR-032** Valid plans shall execute deterministically.  
**FR-033** Compiled/interpreted adapters shall not call an LLM in the request path.  
**FR-034** Runtime logs shall identify which DSL operations transformed a call.

### Verification

**FR-040** The verifier shall run structural schema checks.  
**FR-041** The verifier shall replay recorded successful old calls/workflows where fixtures permit.  
**FR-042** The verifier shall support output predicate/oracle checks.  
**FR-043** The verifier shall support state/end-state oracles.  
**FR-044** The verifier shall support side-effect assertions.  
**FR-045** The verifier shall support metamorphic tests for suitable read-only operations.  
**FR-046** The verifier shall produce a deterministic report given deterministic fixtures.  
**FR-047** Promotion shall fail when mandatory verification gates fail.  
**FR-048** Promotion shall fail when mandatory evidence is absent.  
**FR-049** The verifier shall be unable to access sealed final-evaluation artifacts before the promotion verdict is committed.

### Runtime

**FR-050** The runtime shall expose the stable old logical tool contract.  
**FR-051** The runtime shall forward translated calls to the current backend.  
**FR-052** The runtime shall map responses back to the expected old representation when specified.  
**FR-053** The runtime shall reject calls if the adapter is not promoted for the exact old/new contract pair.  
**FR-054** The runtime shall emit trace records suitable for later replay.  
**FR-055** The runtime shall preserve idempotency controls when configured.

### Evaluation

**FR-060** The harness shall run all defined baselines over the same eligible case set.  
**FR-061** The harness shall record workflow recovery, false compatibility, safe rejection, model use/cost, runtime overhead, and per-class results.  
**FR-062** Evaluation artifacts shall be reproducible from versioned fixtures/configuration.  
**FR-063** Failed/unsupported cases shall remain in denominator accounting where methodologically appropriate and shall not be silently discarded.  
**FR-064** The harness shall record synthesis evidence, gate evidence, and sealed evaluation evidence as separate hashes/paths.  
**FR-065** Model-based methods shall support repeated independent trials per case and retain every run artifact.  
**FR-066** The generic-wrapper baseline shall execute only inside an isolated sandbox with resource and network restrictions.
**FR-067** All Gemini requests shall pass through a quota-aware scheduler with persisted run state.  
**FR-068** Final benchmark execution shall support clean interruption and `--resume` without rerunning completed trials.  
**FR-069** Development and final model IDs/quotas shall be configuration-driven, not hard-coded into benchmark logic.  
**FR-070** Deterministic unit/integration test suites shall run without a model API key.  
**FR-071** The benchmark shall stop cleanly on sustained daily-quota exhaustion rather than enabling paid fallback or spinning indefinitely.  
**FR-072** Development caching may be used to conserve quota, but final independent stochastic trials shall bypass response caching.

---

## 22. Non-Functional Requirements

**NFR-001 — Determinism:** promoted adapter execution must not depend on stochastic model output.  
**NFR-002 — Auditability:** every promotion must be explainable by stored plan + evidence + verification report.  
**NFR-003 — Fail-closed behavior:** unknown or unsupported semantics must not silently pass.  
**NFR-004 — Isolation:** benchmark execution of side-effecting tools must occur in controlled fixtures/containers/sandboxes.  
**NFR-005 — Type safety:** core code should use strict TypeScript settings and schema validation at trust boundaries.  
**NFR-006 — Testability:** each DSL operation must be independently unit-testable.  
**NFR-007 — Reproducibility:** benchmark versions, prompts, model IDs, seeds where supported, and evidence packs must be recorded.  
**NFR-008 — Performance:** deterministic adapter overhead should remain small relative to the downstream tool call; report p50/p95 overhead rather than choosing an arbitrary target before measurement.  
**NFR-009 — Portability:** core IR/DSL/verifier should not depend on a single LLM provider.  
**NFR-010 — CI readiness:** unit/integration tests, lint, type-check, and benchmark smoke tests shall run in GitHub Actions.  
**NFR-011 — Security:** untrusted tool descriptions/results and model-generated plans must never receive direct code execution privileges.  
**NFR-012 — Observability:** runtime and verification events shall be structured and attributable to contract/plan hashes.
**NFR-013 — Zero required spend:** flagship v1 must not require paid model/API/cloud usage.  
**NFR-014 — Quota resilience:** benchmark progress must survive rate-limit errors, process interruption, machine restart, and multi-day execution.  
**NFR-015 — Secret hygiene:** model API keys must be loaded from environment/secret storage and never logged or committed.  
**NFR-016 — Free-tier data hygiene:** only public or controlled synthetic benchmark content may be sent to free-tier model APIs.

---

## 23. Repository Structure

Proposed monorepo layout:

```text
contractrelay/
├── README.md
├── prd.md
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── packages/
│   ├── contracts/          # ToolContract IR, hashing, normalization
│   ├── dsl/                # AdapterPlan schema + validation
│   ├── compiler/           # Deterministic interpreter/compiler
│   ├── synthesizer/        # LLM provider abstraction + prompts
│   ├── verifier/           # replay, predicates, state/side-effect checks
│   ├── runtime/            # compatibility execution engine
│   ├── mcp/                # MCP ingestion + proxy integration
│   ├── traces/             # canonical trace schema + replay
│   ├── benchmark/          # cases, baselines, metrics
│   └── cli/                # contractrelay CLI
├── fixtures/
│   ├── synthetic/
│   └── real/
├── benchmarks/
│   ├── manifests/
│   ├── traces/
│   └── oracles/
├── reports/
├── scripts/
└── .github/workflows/
```

---

## 24. Suggested Technology Stack

### 24.1 Required/primary

- TypeScript
- Node.js
- MCP TypeScript SDK
- Zod
- JSON Schema / AJV where needed
- Vitest
- pnpm
- Docker
- GitHub Actions
- Google GenAI JavaScript SDK: `@google/genai`

Gemini structured output should use JSON Schema/Zod so `AdapterPlan` generation is machine-validated at the model boundary before the ordinary ContractRelay DSL validator runs.

### 24.2 Evaluation/support

- JSONL for traces and per-call model artifacts
- CSV/JSON for benchmark results
- SQLite for the flagship state oracle and, if useful, local run/promotion metadata
- Python only if useful for statistical analysis/plots

### 24.3 Zero-cost model strategy — mandatory for v1

ContractRelay v1 must be buildable and evaluable with **$0 of additional paid API or cloud spend**. The implementation must therefore treat the user's current Gemini Developer API Free Tier quotas as a first-class execution constraint.

**Quota snapshot supplied from Google AI Studio on 2026-10-17:**

| Role | Model | Model ID | RPM | TPM | RPD | v1 use |
|---|---|---|---:|---:|---:|---|
| Development / smoke evaluation | Gemini 3.5 Flash-Lite | `gemini-3.5-flash-lite` | 15 | 250K | 500 | prompt development, structured-output debugging, agent-loop debugging, cheap regression runs |
| Primary final model | Gemini 3.8 Flash | `gemini-3.8-flash` | 5 | 250K | 20 | final B0/B2/B3 stochastic evaluation |

These are **account/project-specific quota snapshots, not timeless constants**. Google documents that Gemini quotas are per project, can change with account/tier status, and daily RPD resets at midnight Pacific time. Therefore:

- defaults may be stored in repo config, but all quota values MUST be overridable without code changes;
- benchmark logic MUST remain correct if quotas become smaller or larger;
- no result may rely on circumventing quotas with extra API keys/projects;
- v1 uses the **standard Gemini API only**; do not make Batch API availability a dependency.

Google currently lists both models as free-of-charge for input/output on the Gemini Developer API Free Tier. Free-tier prompts/results may be used by Google to improve its products, so only **public or controlled synthetic benchmark material** may be sent to Gemini. Never send private employer data, credentials, personal records, or confidential research data.

### 24.4 No-billing / local-infrastructure rule

For v1:

- do not require AWS, GCP, Azure, hosted databases, paid observability, or paid CI;
- run MCP fixtures, SQLite, Docker sandboxes, verification, and benchmark orchestration locally;
- GitHub Actions may run deterministic tests/smoke tests, but the quota-heavy final benchmark should run locally unless a free secret-safe runner is already available;
- do not automatically enable or request paid Gemini billing;
- if the free quota is exhausted, **checkpoint and resume later** instead of switching to a paid model/tier.

### 24.5 Gemini provider configuration

The implementation must use environment/configuration rather than hard-coded secrets or model choices. Minimum configuration:

```text
GEMINI_API_KEY                 # required only for model-backed phases
CONTRACTRELAY_DEV_MODEL        # default: gemini-3.5-flash-lite
CONTRACTRELAY_FINAL_MODEL      # default: gemini-3.8-flash
CONTRACTRELAY_MODEL_MODE       # dev | final
CONTRACTRELAY_MAX_CONCURRENCY  # conservative default: 1
CONTRACTRELAY_CACHE_MODE       # dev-only request cache; disabled for independent final trials
```

Commit `.env.example`; never commit `.env` or API keys.

### 24.6 Quota-aware request scheduler

Every Gemini call used by synthesis or baselines MUST flow through one shared request scheduler. It must:

1. enforce per-model RPM/RPD soft budgets;
2. default to sequential execution for `gemini-3.8-flash`;
3. persist each completed request/trial atomically before scheduling the next;
4. handle `429 RESOURCE_EXHAUSTED` with bounded retry/backoff;
5. honor `Retry-After` when supplied;
6. distinguish short-window retry behavior from likely daily-quota exhaustion;
7. stop cleanly rather than loop forever when the daily quota is exhausted;
8. resume unfinished work with `--resume`;
9. never rerun a completed final trial unless explicitly requested;
10. record model ID, request number, timestamps, token usage when returned, prompt hash, response/artifact hash, and error/retry history.

Recommended defaults for the current quota snapshot:

```yaml
models:
  gemini-3.5-flash-lite:
    rpm: 15
    tpm: 250000
    rpd_hard: 500
    rpd_soft: 450
    concurrency: 2
  gemini-3.8-flash:
    rpm: 5
    tpm: 250000
    rpd_hard: 20
    rpd_soft: 18
    concurrency: 1
    daily_reset_timezone: America/Los_Angeles
```

The 18-request soft cap intentionally leaves two daily requests of headroom for failed/retried/manual checks. The user may override it for final runs.

### 24.7 Benchmark model-use policy

Use models in this order:

**Development:**

- use `gemini-3.5-flash-lite` for prompt iteration, schema-output integration, B0/B2/B3 debugging, and development-case regression;
- do not consume Gemini 3.8 Flash quota to debug ordinary TypeScript, Docker, MCP, fixture, or parser bugs;
- deterministic unit/integration tests must not require an API key.

**Final evaluation:**

- primary published stochastic results use `gemini-3.8-flash`;
- minimum final setting remains **3 independent trials per case**; use 5 only for unstable/high-value cases after the mandatory 3-trial suite is complete;
- B1 is deterministic and consumes no model quota;
- B2-V reuses the exact B2 wrapper artifact and therefore consumes no additional generation request;
- final trials MUST disable any response cache that would make repeated stochastic trials non-independent.

With 15 cases and 3 trials, B2 and B3 require at least 90 primary-model generation calls in total. B0 is multi-turn and adds a variable number of requests. Under the current 20-RPD Gemini 3.8 Flash quota, the final benchmark is therefore expected to run across **multiple quota days**. This is planned behavior, not a failure condition.

**Quota-planning rule:** freeze **15 cases first**. Fifteen already satisfies the flagship acceptance range and is the default zero-cost target. Expand toward 20 only after the mandatory 15-case, 3-trial primary-model run is demonstrably feasible within the remaining calendar/quota budget. Do not increase case count merely to make the benchmark look larger.

### 24.8 Optional full-suite Flash-Lite regression

Before spending scarce 3.8 Flash quota, run the entire frozen benchmark through `gemini-3.5-flash-lite` as a **debug/regression pass**. This catches fixture, orchestration, sandbox, evidence-isolation, and accounting bugs cheaply.

Flash-Lite results may be reported as an additional model-strength comparison, but they must not be substituted silently for the planned Gemini 3.8 Flash primary evaluation. If schedule constraints prevent a complete 3.8 run, the report must state exactly which cases/trials were completed rather than implying full coverage.

### 24.9 Optional later

- OpenTelemetry-compatible tracing
- property-based testing library such as fast-check
- additional model providers only after the v1 acceptance criteria are complete

---

## 25. End-to-End Example

### 25.1 Old contract

```text
refund_order(
  order_id: string,
  amount_dollars: number
) -> {
  refund_id: string,
  status: "refunded"
}
```

### 25.2 New backend

```text
lookup_payment(
  order_id: string
) -> {
  payment_id: string
}

refund_payment(
  payment_id: string,
  amount_cents: integer,
  reason: enum
) -> {
  id: string,
  state: "completed" | "pending"
}
```

### 25.3 Candidate plan

```text
ComposeCalls:
  1. lookup_payment(order_id)
  2. refund_payment(
       payment_id = step1.payment_id,
       amount_cents = ConvertType(amount_dollars * 100),
       reason = "customer_request"
     )

ProjectResponse:
  refund_id = step2.id
  status = map(step2.state)
```

### 25.4 Verification

A valid verification suite should check:

1. translated inputs satisfy both new tool schemas;
2. historical orders refund the expected monetary amount;
3. exactly one refund side effect occurs;
4. a replay/retry does not double-refund when idempotency policy is enabled;
5. final payment state matches the old workflow oracle;
6. if `state = pending` cannot satisfy the old immediate `refunded` guarantee, promotion is rejected unless the old contract permitted eventual completion.

The important result is not merely “the calls executed”; it is “the observable old contract remained true under the declared evidence.”

---

## 26. Literature and Competitive Survey

This section is intentionally conservative. It separates what existing systems already solve from the specific combination ContractRelay is designed to test. Entries summarize the contribution relevant to this PRD; they are **not** a claim of exhaustive systematic-review coverage. A fresh citation/direct-competitor audit is required before public release.

### 26.1 MCPEvol-Bench (2026)

**Reference:** Huanxi Liu et al., *MCPEvol-Bench: Benchmarking LLM Agent Performance Across Dynamic Evolutions of MCP Servers*, arXiv:2607.14642.  
https://arxiv.org/abs/2607.14642

**Relevant contribution:** large-scale empirical study of MCP evolution; 11 mutation operators; executable benchmark over 123 servers; frontier-model degradation under evolved toolsets.

**Important benchmark lesson:** the authors state that historical MCP versions frequently fail because of broken dependencies and changing runtime environments, so they simulate realistic evolution by mutating deployable server source code using patterns derived from real histories.

**Implication for ContractRelay:** use real evolution evidence to define change classes, but make the primary evaluation controlled and executable. Reproducing historical server versions is explicitly deferred beyond flagship v1 unless it becomes trivially available.

---

### 26.2 MCP 2026-07-28 specification and version negotiation

**References:**  
https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/index.mdx  
https://blog.modelcontextprotocol.io/posts/2026-07-28/

**What it establishes:** MCP protocol revisions include explicit compatibility/version-handling mechanisms.

**Gap:** protocol compatibility does not automatically preserve application-level tool semantics when names, inputs, outputs, effects, or decomposition change.

**Implication:** ContractRelay must always be described as **tool-contract compatibility**, not MCP protocol migration.

---

### 26.3 `agent-tool-drift`

**Reference:**  
https://github.com/fykong/agent-tool-drift

**Relevant contribution:** normalizes tool definitions into stable `ToolContract` snapshots, detects breaking/non-breaking drift, identifies likely renames, provides migration advice, and integrates with CI across MCP/OpenAPI/framework sources.

**Overlap:** contract normalization and old/new comparison.

**Gap:** it stops at detection/reporting; ContractRelay continues into bounded synthesis, deterministic execution, behavioral verification, and runtime promotion.

**Implication:** drift detection is infrastructure or input evidence, not ContractRelay’s novelty claim.

---

### 26.4 AgentCompat

**Reference:**  
https://github.com/armanzareian/agentcompat

**Relevant contribution:** replays observed historical tool-call arguments against baseline and candidate schemas, computes usage-weighted compatibility, and reports breakages/migration hints. It is intentionally offline and deterministic.

**Overlap:** trace-based compatibility evidence.

**Gap:** it does not synthesize a persistent runtime adapter, execute the evolved implementation, or verify workflow end state.

**Implication:** ContractRelay’s trace replay must be paired with actual execution/state checks where safe fixtures exist.

---

### 26.5 `mcp-proxy-processor`

**Reference:**  
https://github.com/hughescr/mcp-proxy-processor

**Relevant contribution:** MCP proxying, selective re-exposure, schema/description overrides, argument mapping, and response preprocessing/postprocessing.

**Overlap:** the runtime seam and several transformations that resemble ContractRelay DSL operations.

**Gap:** mappings are configured rather than automatically inferred from old/new contracts and independently promoted through semantic evidence gates.

**Implication:** “MCP proxy that renames arguments” is not a sufficient contribution.

---

### 26.6 MCP-AQL Adapter Generator

**Reference:**  
https://mcpaql.com/spec/adapter/generator.html

**Relevant contribution:** schema-to-code and schema-to-runtime adapter generation with input validation, provenance, generated artifacts, and conformance requirements.

**Overlap:** generated adapters, provenance, validation, conformance testing.

**Gap:** it generates adapters to a defined MCP-AQL abstraction; it does not infer preservation of an arbitrary historical agent-facing contract against an evolved tool implementation.

**Implication:** adapter generation by itself is not the novelty.

---

### 26.7 Stable MCP facade patterns / Gortex

**Reference:**  
https://github.com/zzet/gortex/blob/main/docs/mcp-facade-v1.md

**Relevant contribution:** Gortex documents an implemented compact stable MCP facade over legacy handlers, keeps legacy behavior available during migration, and retains compatibility adapters until parity/usage gates permit removal.

**Overlap:** stable client-facing contract and compatibility facade.

**Gap:** the facade/mappings are intentionally engineered, not automatically synthesized from old/new contracts and independently verified as a migration artifact.

**Implication:** the stable facade is a known pattern. ContractRelay’s contribution must rest on **automatic bounded synthesis + evidence-gated promotion**, not on the existence of a facade.

---

### 26.8 Agent Adapter pattern

**Reference:**  
https://www.agentpatternscatalog.org/patterns/agent-adapter/

**What it establishes:** adapters that normalize heterogeneous tools behind a stable interface are already a recognized agent-systems pattern.

**Gap:** ordinary adapters are manually designed and maintained; ContractRelay targets automatic evolution-aware synthesis and verification.

---

### 26.9 MCP protocol/server migration tooling

**Representative reference:**  
https://github.com/dheerajjha/mcp-migrate

**Overlap:** MCP migration terminology.

**Gap:** protocol/server implementation migration is distinct from preserving an historical application-level tool contract for unchanged agents.

---

### 26.10 APIMig (IJCAI 2025)

**Reference:** Li Kuang et al., *APIMig: A Project-Level Cross-Multi-Version API Migration Framework Based on Evolution Knowledge Graph*, IJCAI 2025.  
https://www.ijcai.org/proceedings/2025/829

**Relevant contribution:** constructs API evolution knowledge and uses an LLM to migrate client projects across multiple library versions.

**Overlap:** automated migration using old/new evolution knowledge and LLMs.

**Gap:** rewrites client source code rather than preserving an unchanged agent through a persistent runtime compatibility layer.

---

### 26.11 Automatically Fixing Dependency Breaking Changes (FSE 2025)

**Reference:** Lukas Fruntke and Jens Krinke, *Automatically Fixing Dependency Breaking Changes*, PACMSE/FSE 2025.  
https://doi.org/10.1145/3729366

**Overlap:** automatic repair after dependency/API evolution.

**Gap:** source-level client repair rather than reusable runtime tool-contract mediation.

---

### 26.12 BigBag (2026)

**Reference:** Frank Reyes, Benoit Baudry, Martin Monperrus, *Agentic Generation of AST Transformation Rules for Fixing Breaking Updates*, arXiv:2606.24446.  
https://arxiv.org/abs/2606.24446

**Relevant contribution:** generates structured reusable executable transformations for breaking dependency updates, demonstrating that reusable migration artifacts can be synthesized rather than producing only one-off patches.

**Overlap:** reusable structured migration artifacts and agentic synthesis.

**Gap:** BigBag transforms client source ASTs; ContractRelay leaves the caller unchanged and mediates runtime tool calls/results.

**Implication:** reusable transformation synthesis alone is not enough for novelty.

---

### 26.13 Pig (FSE 2026)

**Reference:** Miryeong Kang et al., *Pig: Leveraging Large Language Models for Python Library Migrations*, PACMSE/FSE 2026.  
https://doi.org/10.1145/3797072

**Relevant contribution:** LLM-assisted Python library migration through task decomposition and targeted context.

**Overlap:** LLM-assisted API/library migration.

**Gap:** modifies client programs rather than providing a persistent agent-facing runtime contract.

---

### 26.14 AgentAssay (2026)

**Reference:** Varun Pratap Bhardwaj, *AgentAssay: Token-Efficient Regression Testing for Non-Deterministic AI Agent Workflows*, arXiv:2603.02601.  
https://arxiv.org/abs/2603.02601

**Relevant contribution:** regression testing for nondeterministic agents using statistical verdicts, coverage, mutation testing, metamorphic relations, trace-first analysis, and CI gates.

**Overlap:** regression methodology, metamorphic checks, traces, gating.

**Gap:** generic regression testing is not automatic tool-compatibility synthesis.

**Implication:** use these ideas as verifier machinery rather than claiming generic agent regression testing as novel.

---

### 26.15 “Do Tool Calls Execute as Intended?” (2026)

**Reference:** Boyang Yang et al., *Do Tool Calls Execute as Intended? Measuring and Repairing Intent-Execution Correspondence in LLM Agents*, arXiv:2610.04375.  
https://arxiv.org/abs/2610.04375

**Relevant contribution:** defines intent-execution correspondence at tool-execution boundaries and shows that execution paths can silently alter tool calls; its repair system may deliver the intended call or refuse it.

**Overlap:** correctness and refusal at the agent-tool boundary.

**Gap:** preserving an emitted call through a harness is different from preserving a historical contract across tool evolution.

---

### 26.16 Survey conclusion

The surrounding ecosystem already covers almost every individual ingredient:

- drift detection;
- trace compatibility;
- proxies and argument transforms;
- stable facades;
- adapter generation;
- API migration;
- reusable transformation synthesis;
- regression testing;
- execution-boundary correctness.

That is why ContractRelay must be evaluated as a **system combination**, not marketed as inventing any individual primitive.

## 27. Literature Survey Conclusion / Novelty Boundary

The defensible project boundary is:

> **Given an old agent-facing contract and an evolved backend contract, automatically synthesize a bounded reusable runtime compatibility plan, compile it deterministically, independently evaluate it against declared behavioral evidence, and fail closed unless it qualifies for promotion.**

ContractRelay must **not** claim novelty for:

- MCP proxying;
- a stable facade;
- schema drift detection;
- adapter generation;
- LLM API migration;
- regression testing;
- trace replay;
- reusable transformations in general.

The project claim is narrower and more defensible: these pieces are combined into a lifecycle for **automatic agent-tool backward compatibility with explicit promotion evidence**.

The PRD also avoids saying the system “proves semantic equivalence.” Verification is bounded by declared evidence and executable oracles. The correct terminology is **evidence-gated compatibility**.

No claim of “first ever” should appear in the README, resume, or report unless a later formal systematic review supports it.

## 28. Evaluation Baselines

Use **four primary systems plus one controlled verifier variant**. All receive matched synthesis information where applicable. The purpose of `B2-V` is methodological isolation, not baseline inflation.

### B0 — Strong agent replanning

The agent receives:

- `C_old`;
- `C_new`;
- change diff/docs;
- the original user task;
- relevant examples available to ContractRelay synthesis.

It directly replans against the evolved toolset on each execution. This is the strongest “do we need a persistent compatibility layer?” baseline.

For incompatible cases, record whether the agent refuses/flags incompatibility or executes a semantically incorrect workflow.

### B1 — Deterministic heuristics

Rule-based migration for:

- exact/near renames;
- explicit constant defaults;
- straightforward numeric/string conversions;
- enum maps when supplied as evidence;
- simple response field projection.

This tests whether ContractRelay is doing anything beyond obvious mechanical rewriting.

### B2 — Generic unconstrained LLM wrapper

An LLM receives the same `C_old`, `C_new`, docs, examples, and **synthesis evidence** as ContractRelay and generates a conventional wrapper implementation.

B2 does **not** receive ContractRelay's promotion gate before final scoring.

Because B2 generates arbitrary source code, every wrapper MUST execute inside an ephemeral sandbox/container with:

- no host secrets;
- no host filesystem access except mounted fixtures/results;
- external network disabled unless a benchmark case explicitly requires a local allowlisted service;
- CPU, memory, and wall-clock limits;
- disposable filesystem/process state.

### B2-V — Generic wrapper + ContractRelay verification gate

Take the same B2-generated wrapper artifact and pass it through the **same gate evidence and promotion policy** used for B3 before final sealed evaluation.

This comparison isolates the value of verification:

```text
B2 -> B2-V ~= effect of evidence-gated verification
```

B2-V is a required experimental variant but reuses B2 generation artifacts; it is not a separate generation pipeline.

### B3 — ContractRelay

Bounded `AdapterPlan` synthesis + deterministic interpretation + the same evidence-gated verification policy + persistent stable runtime interface.

This comparison helps isolate the value of the constrained DSL/runtime:

```text
B2-V -> B3 ~= effect of constrained plan representation + trusted deterministic runtime
```

### Optional diagnostic, not a required baseline

A **new-schema-only** agent run may be recorded to reproduce the basic degradation setting from MCPEvol-style evolution, but it is not required in every flagship experiment because B0 is the more important matched-information comparison.

## 29. Evaluation Dataset Strategy

The primary benchmark is intentionally **small, executable, high quality, and evidence-separated** rather than large and brittle.

### 29.1 Primary controlled suite — 15 to 20 executable migrations

Build **15–20 cases** using evolution classes grounded in observed MCP/API changes and MCPEvol-style operators.

Target distribution:

| Change class | Target cases |
|---|---:|
| Tool/argument rename or replacement | 2–3 |
| Required parameter/default change | 2 |
| Type/constraint conversion | 2 |
| Enum mapping | 2 |
| Response reshaping/projection | 2 |
| Multi-call composition | 1–2 |
| Stateful workflow migration | 1–2 |
| Semantic incompatibility / must reject | 2–3 |
| **Total** | **15–20** |

Every case must include:

```text
old contract
new contract
change rationale/provenance
side-effect class
compatibility label for controlled cases
synthesis evidence
gate evidence
sealed evaluation evidence
resettable execution fixture
```

Do not pad the benchmark with many trivial renames to inflate recovery.

### 29.2 Mandatory evidence split

Every case has three partitions:

**A — Synthesis evidence**  
Visible to model-based generators. Examples: old/new contracts, docs/diff, examples, selected historical calls.

**B — Gate evidence**  
Visible to the promotion verifier but not necessarily to synthesis. Examples: selected replay traces, partial invariants, selected SQLite assertions, metamorphic predicates.

**C — Sealed evaluation evidence**  
Visible only after a method has produced its artifact/action and, where applicable, recorded its promotion decision. Examples: unseen inputs, unseen workflow variants, hidden DB/state assertions, hidden side-effect assertions.

A case is invalid for the primary false-compatibility analysis if its entire final scoring oracle was exposed unchanged to the gate.

### 29.3 Oracle design tiers

Use three oracle sources and report them separately.

**Tier A — Mechanical state oracles**  
Preferred for stateful/write workflows. Examples: SQLite row state, file contents, ledger entries, exact side-effect counts, object lifecycle status.

**Tier B — Contract/property oracles**  
Schema checks, round-trip properties, metamorphic relations, known output invariants, error-contract checks.

**Tier C — Controlled/adversarial semantic cases**  
Purpose-built cases such as send-vs-draft or delete-vs-deactivate. These are valuable but must be explicitly labeled **controlled**, not presented as naturally occurring production incidents.

At least **one stateful flagship case must use Tier A gate evidence plus additional sealed Tier A assertions or inputs** so final safety scoring is not circular.

### 29.4 Held-out/adversarial case policy

To reduce “I wrote the trap and the detector” bias:

- at least **20% of final cases** are frozen/held out from prompt and heuristic tuning;
- sealed-evaluation artifacts for **all** cases are inaccessible to synthesis and promotion;
- author some adversarial cases only after synthesis prompts/heuristics are frozen;
- document which cases influenced design decisions;
- if another person contributes cases, record that fact, but external authorship is not required.

### 29.5 Repeated stochastic trials

For each stochastic method (`B0`, `B2`, `B2-V` through its inherited B2 artifact, and `B3` synthesis):

- run **3 independent trials per case** as the required full-suite final setting under the free quota;
- after the required 3-trial suite is complete, optionally extend unstable/high-value cases to **5 trials** using remaining free quota;
- record model/provider/version, temperature/sampling parameters, seed when supported, prompt hash, and artifact hash;
- report per-case success counts, not only pooled percentages.

B1 is deterministic and needs one run per case unless the fixture itself is nondeterministic.

### 29.6 Real historical cases

Real historical MCP/API pairs are **not part of flagship v1 acceptance criteria**. They may be added after v1 as external-validity follow-up work only if reproducible without dependency archaeology.

This keeps engineering effort focused on the runtime, verification methodology, and controlled evaluation.

### 29.7 MCPEvol-derived grounding

Use MCPEvol-Bench’s observed evolution taxonomy/operator ideas to justify the controlled change classes. The project may reuse/adapt executable fixtures where licensing and engineering effort make sense, but it does not need to reproduce the entire benchmark.

### 29.8 Exclusion policy

A case may be marked unsupported only for a documented technical reason. Report unsupported coverage explicitly; never silently delete difficult cases because a method fails.

## 30. Metrics and Decision Criteria

Keep the headline evaluation focused and denominator-transparent.

### 30.1 Primary effectiveness metric — hidden-evaluation workflow recovery

A workflow counts as recovered only when its **sealed evaluation oracle** passes. “No exception” and “passed the promotion gate” are insufficient.

Report both count and percentage:

```text
recovered compatible trials / total compatible trials
```

and also summarize at the case level, e.g. `14/18 cases recovered in >=4/5 trials`.

### 30.2 Primary safety metric — hidden false-compatible rate

For methods that explicitly accept/promote a reusable migration:

```text
accepted/promoted trials that FAIL sealed evaluation
---------------------------------------------------
all accepted/promoted trials
```

This metric is computed **only from sealed evaluation evidence**, never from the same predicates that determined promotion.

For B0 replanning, which has no persistent promotion step, report the analogous **false-success rate**: runs that complete/claim success but fail the sealed oracle.

### 30.3 Secondary metrics

- safe rejection rate on labeled incompatible cases;
- adapter synthesis success rate;
- recovery by change class;
- gate value (`B2` vs `B2-V`);
- representation/runtime value (`B2-V` vs `B3`);
- one-time synthesis/verification model cost;
- recurring model calls after promotion;
- p50 adapter runtime overhead;
- deterministic replay consistency.

### 30.4 Required reporting

For each method, report at minimum:

```text
compatible recovery: k / n trials and k / n cases
false-compatible (or false-success): k / n
correct rejections: k / n
unsupported cases: k / n
trials per stochastic case
model calls/tokens per migration
model calls per repeated execution
```

Percentages may be shown **only alongside their raw counts** for the 15–20 case flagship suite.

### 30.5 Statistical interpretation

This is a small controlled systems benchmark, not a population-scale estimate.

- Do not overstate fine-grained percentage differences.
- Prefer raw counts, per-case consistency, and confidence intervals/bootstraps only when their assumptions are defensible.
- A one-case difference should be described as such rather than marketed as a dramatic percentage improvement.
- Repeated LLM trials measure stochastic robustness; they do not magically turn 18 underlying migration scenarios into 90 independent real-world migrations.

### 30.6 Interpretation

ContractRelay does **not** need to dominate B0/B2 on raw recovery to be a successful flagship.

Examples of meaningful outcomes:

1. **Best case:** higher recovery and lower hidden false compatibility.
2. **Strong verification result:** `B2-V` materially reduces false compatibility compared with `B2`.
3. **Strong constrained-runtime result:** `B3` matches or improves `B2-V` while offering deterministic trusted execution/auditability.
4. **Strong systems result:** comparable recovery/safety with deterministic repeated execution and no recurring migration inference.
5. **Negative but useful result:** unconstrained wrapper wins recovery while ContractRelay reveals a safety/coverage tradeoff; document the boundary honestly.

### 30.7 Flagship target, not a pre-registered claim

Aim for:

- non-trivial workflow recovery across multiple change classes;
- **zero hidden-evaluation false-compatible promotions on destructive controlled cases**;
- a visibly lower false-compatible count for gated methods than ungated wrapper generation;
- successful unchanged-client execution through the MCP proxy;
- deterministic reuse after promotion.

Do not invent a percentage target before the benchmark exists.

## 31. Test Strategy

Testing is divided into five layers.

### Layer 1 — Unit tests

IR canonicalization, contract hashing, every DSL operation, static validation, error mapping, and promotion rules.

### Layer 2 — Property tests

Round-trip conversions, enum coverage, deterministic serialization, unsupported-value behavior, and idempotency invariants where applicable.

### Layer 3 — Integration tests

`ToolContract -> AdapterPlan -> interpreter -> target tool -> mapped result`.

### Layer 4 — Verification/e2e tests

Full candidate lifecycle through synthesis, verification, promotion/rejection, and MCP serving.

### Layer 5 — Comparative benchmark tests

B0, B1, B2, B2-V, and B3 over the frozen controlled suite using the synthesis/gate/sealed-evaluation split.

The benchmark tests are not substitutes for normal unit/integration testing; they answer the research questions rather than basic correctness.

## 32. Required Test Cases

The flagship requires **26 core acceptance tests**. Additional cases are welcome but are not required merely to make the benchmark look larger.

### TC-001 — Tool rename

**Old:** `get_weather(city)`  
**New:** `fetch_weather(city)`  
**Expected:** `RenameTool`; call and result preserved.

### TC-002 — Argument rename

**Old:** `search_customer(customer_id)`  
**New:** `search_customer(account_id)`  
**Expected:** `RenameArg`; exact identifier preserved.

### TC-003 — Safe constant default

**Old:** temperature implicitly Fahrenheit.  
**New:** explicit `units` required.  
**Evidence:** old behavior documented as Fahrenheit.  
**Expected:** `AddConstantDefault("fahrenheit")`; promote.

### TC-004 — Unsafe invented default

Same shape as TC-003, but old units are unknown.  
**Expected:** `Reject`/inconclusive, not an invented default.

### TC-005 — Type conversion

**Old:** decimal dollars.  
**New:** integer cents.  
**Expected:** deterministic conversion; property tests over supported precision range.

### TC-006 — Enum mapping

**Old:** `low|normal|high`.  
**New:** `P3|P2|P1`.  
**Expected:** documented mapping; unknown value rejected.

### TC-007 — Response projection

**Old:** `{name, email}`.  
**New:** nested profile/contact structure.  
**Expected:** old response shape restored.

### TC-008 — Unsupported/hallucinated plan

Candidate references missing target fields or arbitrary code/network expressions.  
**Expected:** static validation rejects before execution.

### TC-009 — Deterministic execution

Same promoted plan/input against deterministic fixture.  
**Expected:** identical translated call sequence and mapped result.

### TC-010 — Contract hash invalidation

Backend target contract changes after promotion.  
**Expected:** old promotion cannot execute until re-verification.

### TC-011 — Compose calls

**Old:** `refund_order(order_id, amount)`.  
**New:** `lookup_payment(order_id)` + `refund_payment(payment_id, amount)` (+ optional status update).  
**Expected:** bounded composition executes in order and passes the end-state oracle.

### TC-012 — Stateful refund oracle

Use SQLite fixture with payment/order/refund tables.  
**Expected:** correct refund amount, correct order state, and exactly one financial side effect.

### TC-013 — Send vs draft semantic mismatch

Candidate maps “send” behavior to a draft-producing backend without setting the required send behavior.  
**Expected:** behavioral/state oracle rejects.

### TC-014 — Delete vs deactivate

Schemas align but semantics differ.  
**Expected:** fail closed; no promotion.

### TC-015 — Duplicate side effect

A composed non-idempotent step is retried.  
**Expected:** duplicate side effect is detected or execution is blocked by the policy/idempotency guard.

### TC-016 — Historical/recorded trace replay

Recorded successful old calls are translated and replayed.  
**Expected:** every eligible trace either passes its oracle or receives an explicit failure reason.

### TC-017 — Matched synthesis-information baseline

B0/B2/B3 receive the same old/new contracts, docs, examples, and synthesis evidence where applicable.  
**Expected:** benchmark manifest proves parity; sealed evaluation is unavailable to every method until the appropriate decision/artifact is frozen.

### TC-018 — Unchanged MCP client

A client configured with `C_old` continues to invoke the old tool through ContractRelay against `C_new`.  
**Expected:** no change to the client’s advertised logical contract.


### TC-019 — Gate/evaluation non-leakage

Attempt to access a case's sealed evaluation directory from synthesis or verification code.  
**Expected:** access fails before the promotion verdict is committed; benchmark runner records the violation.

### TC-020 — Verifier isolation baseline

Generate one B2 wrapper artifact, score it ungated as B2, then pass the exact same artifact through the ContractRelay gate as B2-V.  
**Expected:** artifact hash is identical; any result difference is attributable to gating/promotion rather than regeneration.

### TC-021 — Repeated stochastic trials

Run a model-based case three times with run manifests, then optionally extend the same case to five.  
**Expected:** all artifacts/results are retained; the required summary reports `k/3`, and an optional extension reports `k/5` without replacing or cherry-picking the original three trials.

### TC-022 — Sandboxed unconstrained wrapper

B2 attempts filesystem/network/process behavior outside the benchmark allowance.  
**Expected:** sandbox blocks the action and records the failure without affecting the host.

### TC-023 — Quota exhaustion + resume

Configure a tiny synthetic request budget (for example two requests), start a benchmark with more work than the budget allows, and force the scheduler to stop.  
**Expected:** completed trials are durably recorded; the process exits cleanly; `--resume` continues from the first unfinished trial without duplicating completed final runs.

### TC-024 — Rate-limit recovery

Mock or induce a `429 RESOURCE_EXHAUSTED` response.  
**Expected:** scheduler applies bounded retry/backoff, records the error, honors retry metadata when present, and never enters an infinite retry loop or paid fallback.

### TC-025 — Final-trial cache isolation

Run two nominally identical final stochastic trials with the development cache enabled globally.  
**Expected:** final-trial mode bypasses cached model responses and records distinct request/run identities; development/smoke mode may use the cache.

### TC-026 — Model/API independence of deterministic core

Remove `GEMINI_API_KEY` and run deterministic core/unit/integration suites.  
**Expected:** ToolContract, DSL, interpreter, verifier fixtures, MCP proxy fixture tests, and deterministic B1 tests still pass; only explicitly model-backed tests are skipped/fail with a clear configuration message.

### Extended tests (recommended, not gating)

- error-contract mapping;
- partial enum compatibility;
- metamorphic read-only relations;
- protocol-version-only change should not trigger tool migration;
- tool removal with no replacement;
- reproducible verification-report hashing.

## 33. Acceptance Tests for “The Project Works”

Flagship v1 is not complete until all of the following are reproducible.

### A. Primitive compatibility

At least rename/default/type/enum/response-projection operations work through the deterministic interpreter.

### B. Non-trivial composed migration

At least one `ComposeCalls` migration is automatically synthesized or selected, executed, and verified.

### C. Objective stateful oracle

At least one write workflow uses an independent machine-checkable state oracle (for example SQLite end state and exact side-effect count).

### D. Non-circular safety evaluation

For the flagship stateful workflow and semantic-rejection cases, the promotion gate uses only gate evidence, while final compatibility is scored with additional sealed inputs/assertions the gate never saw.

### E. Negative semantic safety demo

At least two plausible-looking adapters are automatically rejected because behavior/state semantics differ despite structural similarity.

### F. No arbitrary model code in ContractRelay

The ContractRelay-generated artifact is a schema-valid `AdapterPlan`; runtime translation uses trusted deterministic code only.

### G. Sandboxed arbitrary code baseline

B2 arbitrary wrapper code executes only inside the benchmark sandbox and cannot access host secrets/files/network outside the explicit fixture allowlist.

### H. Promotion binding

Promotion is bound to old/new contract hashes and is invalidated when the target contract changes.

### I. Unchanged MCP client

An unchanged MCP client/agent successfully calls `C_old` while the backend exposes `C_new`.

### J. Fair baseline evaluation

B0, B1, B2, B2-V, and B3 execute over the same frozen cases with synthesis-information parity documented in a machine-readable manifest.

### K. Verifier isolation

B2 and B2-V reuse the **same generated wrapper artifact**; the only difference is whether the ContractRelay gate is applied.

### L. Held-out evaluation

At least **20% of final benchmark cases** are frozen/held out from prompt and heuristic tuning, and **100% of sealed evaluation artifacts** are inaccessible to synthesis/promotion.

### M. Repeated stochastic evaluation

Every stochastic method is run at least **3 independent times per case** in the final report. Five-trial extensions are optional and targeted only after the required three-trial suite is complete.

### N. Count-first reporting

All primary recovery/safety results include `k/n` counts; percentages, if shown, are secondary.

### O. Reproducible result

A single documented command regenerates the primary benchmark summary from versioned fixtures and run artifacts.

### P. Zero-cost execution

Flagship v1 can be built and evaluated with local infrastructure plus the Gemini Developer API Free Tier. No paid model, cloud compute, hosted database, or paid observability dependency is required.

### Q. Multi-day quota resumability

A benchmark intentionally constrained to a tiny daily request budget stops cleanly and later resumes without losing progress, regenerating completed final trials, leaking sealed evaluation evidence, or switching to a paid fallback.

## 34. Phase-by-Phase Build Plan

The project remains a bounded flagship, but **four focused weeks should not be interpreted as four ordinary calendar weeks**. Plan for roughly **4–5 focused engineering weeks**, typically **6–8 calendar weeks** alongside coursework, research, applications, and other obligations.

Publish a usable MVP as soon as the vertical slice exists; continue the benchmark in public as work-in-progress until flagship completion.

### Phase 0 — Scope freeze and repository foundation

**Target:** Day 1–2 focused work

**Build:**

- repository skeleton;
- strict TypeScript config;
- Vitest + lint + typecheck + GitHub Actions;
- short TypeScript/Zod/MCP SDK ramp-up spike if needed;
- install/configure `@google/genai` behind a provider interface;
- add `.env.example`, secret-safe config, model/quota config, and a no-API-key deterministic test mode;
- ADRs for trust boundary, evidence separation, zero-cost execution, and benchmark methodology;
- initial fixtures and result schemas.

**Exit:** CI green; README states non-goals and novelty boundary.

---

### Phase 1 — Deterministic core

**Target:** ~1 focused week

**Build:**

- `ToolContract` IR;
- canonical serialization + hashing;
- MCP `tools/list` ingestion;
- `AdapterPlan` Zod schema;
- `RenameTool`, `RenameArg`, `AddConstantDefault`, `ConvertType`, `MapEnum`, `ProjectResponse`, `Reject`;
- deterministic interpreter/compiler;
- primitive unit/property tests.

**Exit:** primitive/core tests pass without any LLM.

---

### Phase 2 — Verification + synthesis

**Target:** ~1 focused week

**Build:**

- structural verifier;
- recorded trace replay;
- predicate/property oracles;
- synthesis/gate/sealed-eval evidence loader boundaries;
- verification report;
- promotion policy/registry;
- provider-neutral structured LLM synthesis with Gemini implementation via `@google/genai`;
- Zod/JSON-Schema structured output for `AdapterPlan`;
- quota-aware shared model request scheduler + persisted request manifests;
- `--resume` support and bounded 429 handling;
- development defaults to `gemini-3.5-flash-lite`;
- evidence-grounded plan prompt;
- explicit `Reject` path.

**Exit:**

- LLM produces schema-valid plans for simple cases;
- hallucinated/unsupported plans fail before execution;
- a structurally valid semantic mismatch can be rejected by gate evidence;
- sealed evaluation cannot be read before verdict commit.

**Publishable MVP checkpoint:** if the MCP proxy from Phase 3 is pulled forward enough to show one positive migration + one rejection, publish the repository/demo as **in progress** rather than waiting for the complete benchmark.

---

### Phase 3 — Flagship stateful workflow + MCP runtime

**Target:** ~1 focused week

**Build:**

- bounded `ComposeCalls`;
- intermediate references/bindings;
- SQLite commerce/refund fixture;
- side-effect recorder/idempotency policy;
- compatibility MCP proxy exposing `C_old`;
- target invocation against `C_new`;
- response/error mapping;
- contract hash enforcement;
- gate vs sealed state assertions for the flagship workflow.

**Required flagship scenario:**

```text
old: refund_order(order_id, dollars)

new:
  lookup_payment(order_id)
  refund_payment(payment_id, cents)
  update_order_status(order_id, status)

gate evidence:
  selected refund amount/state predicates
  selected duplicate-side-effect predicate

sealed evaluation:
  unseen order/refund inputs
  additional ledger/provenance/state assertions
  hidden retry/workflow variant
```

**Exit:** unchanged MCP client completes the old workflow through the new backend; incompatible semantic cases are rejected; final scoring can still falsify a promoted adapter using unseen evidence.

---

### Phase 4 — Benchmark fixtures + sandbox + baselines

**Target:** ~1.5–2 focused weeks

This phase is intentionally larger than earlier drafts because each case requires executable old/new fixtures, evidence partitions, reset logic, and final oracles, while B0/B2 require real model execution.

**Build:**

- freeze 15–20 executable cases;
- mark held-out subset;
- synthesis/gate/sealed evidence directories + hashes;
- resettable Docker/fixture environments;
- B0 replanning agent loop;
- B1 heuristics;
- B2 generic wrapper generation;
- sandboxed B2 wrapper execution;
- B2-V exact-artifact gate variant;
- B3 ContractRelay runner;
- evidence-parity manifests;
- recovery/false-compatible/rejection metrics;
- repeated trial orchestration;
- free-tier quota accounting and daily soft-budget enforcement;
- development/smoke full-suite run on `gemini-3.5-flash-lite`;
- token/model-call/request accounting.

**Execution rule:** Phase 4 must be fully debuggable on Flash-Lite before scarce Gemini 3.8 Flash final quota is used.

**Exit:** one command runs the comparison and produces count-first results by change class and evidence split.

---

### Phase 5 — Final runs, hardening, and portfolio release

**Target:** ~0.5–1 focused week

**Build:**

- run the required **3 Gemini 3.8 Flash trials per stochastic case** across as many quota days as needed; extend selected unstable/high-value cases to 5 only after the required suite completes;
- schedule final runs through the quota-aware runner (`--resume`), defaulting to <=18 Gemini 3.8 Flash requests per quota day under the current account limits;
- fix benchmark-discovered implementation bugs without changing sealed labels/oracles;
- architecture/evidence-split diagrams;
- polished README;
- 2–3 minute demo path;
- positive composed migration walkthrough;
- semantic rejection walkthrough;
- limitations/threats-to-validity section;
- fresh literature/direct-competitor audit;
- reproducible Docker/CI setup;
- release tag;
- quantified resume bullets only from measured count-supported results.

**Exit:** a reviewer can answer:

1. What problem does ContractRelay solve?
2. Why are stable facades/proxies alone insufficient?
3. What does the LLM generate?
4. What runs deterministically?
5. What evidence can the gate see?
6. What evidence is hidden until final scoring?
7. What did B2 vs B2-V show about verification?
8. What did B2-V vs B3 show about the constrained DSL/runtime?
9. How does the stateful oracle work?
10. What does ContractRelay deliberately not solve?

### Scope-control rule

After Phase 1, any new product feature must replace an existing planned feature unless it directly fixes a blocker in the acceptance tests. Do not add a UI, hosted service, more protocols, more DSL operators, historical-server archaeology, or a giant ablation suite before v1 is complete.

## 35. Milestone Demonstrations

### Demo 1 — Deterministic adapter substrate

Hand-authored old/new contracts + plan demonstrate translation without an LLM.

### Demo 2 — Automatically synthesized simple migration

LLM emits a valid `AdapterPlan`; static validation, trace replay, and promotion pass.

### Demo 3 — Semantic rejection

A structurally plausible adapter fails an independent oracle and is refused.

### Demo 4 — Stateful composition

Old `refund_order` is preserved over a decomposed backend, with SQLite state proving the intended result and exact side-effect count.

### Demo 5 — Unchanged MCP client

A real MCP client still sees/calls the old logical tool while ContractRelay executes the verified new implementation.

### Demo 6 — Comparative benchmark

A single command compares B0, B1, B2, B2-V, and B3 on the frozen controlled suite and emits count-first recovery, hidden false-compatibility/false-success, safe-rejection, repeated-trial, and model-use metrics.

## 36. Threat Model and Safety Model

### 36.1 Threats

- LLM hallucinates nonexistent fields/tools;
- documentation is stale or contradictory;
- tool description is misleading;
- output schema passes but semantics changed;
- retries duplicate a non-idempotent action;
- target service changes after verification;
- test oracle is incomplete;
- promotion evidence leaks the final scoring oracle;
- traces contain secrets/PII;
- malicious tool output attempts prompt injection during synthesis/evaluation;
- arbitrary generated code escapes sandbox.

### 36.2 Mitigations

- schema-valid bounded DSL;
- deterministic interpreter;
- contract hashes;
- independent verification;
- fail-closed policy;
- separate synthesis evidence from executable runtime;
- redaction hooks for trace ingestion;
- isolated benchmark services;
- no arbitrary model-generated code execution;
- explicit side-effect classification;
- promotion invalidation on contract drift;
- physically/logically separated synthesis, gate, and sealed-evaluation artifacts;
- sandboxed execution for arbitrary B2 wrapper code.

---

## 37. Failure Modes to Document

1. **Insufficient semantic evidence:** schemas differ but docs/traces cannot establish meaning.
2. **Irreducible capability loss:** new API removed behavior needed by old contract.
3. **One-to-many ambiguity:** several target workflows could satisfy the surface schema.
4. **Hidden business semantics:** correctness depends on organizational rules absent from available evidence.
5. **Environment-dependent behavior:** nondeterministic remote services make verification unstable.
6. **Stateful migration complexity:** new tool requires hidden state not represented in the old contract.
7. **Partial support:** only a subset of old inputs can be preserved.
8. **Oracle weakness:** tests validate shape but not true behavior.
9. **Evaluation leakage:** the same oracle is used for promotion and final scoring, making false compatibility circular.
10. **LLM synthesis instability:** candidate quality varies by model/prompt.
11. **Cost tradeoff:** one-off low-frequency tools may not justify persistent adapter synthesis.

These are not embarrassing edge cases; they should become part of the evaluation taxonomy.

---

## 38. Observability and Audit Requirements

Every runtime call should be traceable to:

```text
old_contract_hash
new_contract_hash
adapter_plan_hash
promotion_policy_version
old_tool_name
target_tool_sequence
translation_operations
validation_result
execution_result
response_mapping_result
latency breakdown
```

Do not log secrets by default. Provide redaction configuration for trace fixtures.

---

## 39. Benchmark Reproducibility Manifest

Each evaluation run should save:

```yaml
run_id:
git_commit:
contractrelay_version:
case_manifest_version:
trial_id:
trial_index:
synthesis_evidence_hash:
gate_evidence_hash:
sealed_eval_hash:
sealed_eval_opened_after_verdict: true|false
model_provider:
model_id:
model_parameters:
prompt_version:
baseline:
old_contract_hash:
new_contract_hash:
evidence_hash:
verification_policy_version:
container_image_digest:
result:
```

This is important because model-based migration benchmarks otherwise become difficult to reproduce.

---

## 40. Result Reporting Format

Primary result table should use **counts first**, with percentages in parentheses if helpful:

| Method | Compatible recovery | False-compatible / false-success | Safe reject | Trials | One-time model cost | Repeated model calls/execution |
|---|---:|---:|---:|---:|---:|---:|
| B0 Strong replanning | TBD k/n | TBD k/n false-success | TBD k/n | 3–5/case | per run | yes |
| B1 Deterministic heuristics | TBD k/n | TBD k/n | TBD k/n | 1/case | 0 | 0 |
| B2 Generic LLM wrapper | TBD k/n | TBD k/n | TBD k/n | 3–5/case | once per generated wrapper | 0 after generation |
| B2-V Same wrapper + gate | TBD k/n | TBD k/n | TBD k/n | inherits B2 artifacts | gate only | 0 after promotion |
| **B3 ContractRelay** | **TBD k/n** | **TBD k/n** | **TBD k/n** | **3–5/case synthesis** | **once per migration + verification** | **0 after promotion** |

Also report:

- results by change class;
- held-out vs development cases separately;
- per-case trial consistency (`k/5`);
- unsupported cases rather than silently dropping them;
- B2 vs B2-V paired comparison using identical wrapper hashes;
- B2-V vs B3 comparison under the same gate policy;
- gate-visible vs sealed-evaluation failures;
- confidence intervals only when appropriate and never as a substitute for raw counts.

Aggregate recovery alone is insufficient: the final discussion must explicitly analyze the **recovery vs hidden false-compatibility tradeoff** and threats from the small controlled benchmark.

## 41. Kill / Pivot Criteria

These criteria prevent sunk-cost rationalization while preserving the engineering value of a completed system.

### Kill the flagship research claim if:

1. ContractRelay only succeeds on rename/default cases that deterministic heuristics solve equally well.
2. B0/B2 match or beat ContractRelay while ContractRelay shows **no meaningful advantage** in false compatibility, determinism, auditability, stable-contract reuse, or recurring model cost.
3. hidden-evaluation false-compatible promotions remain frequent even on cases with strong objective oracles;
4. `ComposeCalls`/stateful verification cannot be made reliable enough for one convincing non-trivial workflow;
5. the verifier’s apparent safety advantage disappears when gate evidence and sealed evaluation evidence are properly separated;
6. a credible newly published system is found that already implements the same end-to-end lifecycle: old/new contract input, automatic bounded runtime adapter synthesis, independent semantic/state verification, stable facade, and fail-closed promotion.

### Do **not** kill the project merely because:

- old historical MCP repositories cannot be resurrected;
- a strong replanning baseline ties raw recovery;
- the controlled benchmark is only 15–20 high-quality cases, provided results are reported as counts with repeated stochastic trials;
- ContractRelay intentionally rejects cases that an unconstrained wrapper attempts.

### Pivot rather than kill if:

- synthesis is mediocre but verification is clearly valuable -> emphasize evidence-gated compatibility verification;
- general tool evolution is too broad but the stateful/composed subset is strong -> narrow the supported v1 contract classes without pretending universal coverage;
- MCP-specific data is sparse -> keep the architecture and add OpenAPI/function-tool fixtures only after v1.

Do **not** repeatedly narrow until the project becomes “LLM renames API fields.”

## 42. Definition of MVP

MVP is the smallest complete vertical slice and requires:

1. `ToolContract` ingestion and hashing;
2. AdapterPlan DSL with rename/default/type/enum/response projection + `Reject`;
3. deterministic interpreter;
4. structured LLM plan synthesis;
5. structural + trace + predicate verification;
6. explicit synthesis/gate/sealed-evaluation artifact separation in the harness;
7. promotion registry bound to contract hashes;
8. MCP compatibility proxy exposing `C_old` against `C_new`;
9. one positive synthesized migration;
10. one semantic rejection case;
11. CI and machine-readable reports.

**MVP publication point:** publish the repo/demo once an unchanged client works through the proxy and one semantic mismatch is rejected. Label benchmark results **in progress** until the frozen multi-case evaluation is complete.

MVP is **not** yet flagship completion. The stateful composed workflow, sandboxed B2 baseline, B2-V verifier-isolation experiment, frozen 15–20 case suite, repeated trials, and final matched evaluation are required for the resume-quality release.

## 43. Definition of Flagship-Quality Completion

ContractRelay is ready to be presented as a flagship project when all of the following are true:

- TypeScript/Node implementation is the primary runtime;
- a real MCP compatibility proxy exposes a stable old logical interface;
- the DSL is constrained and runtime execution is deterministic;
- LLM synthesis produces plans rather than arbitrary executable code;
- at least one non-trivial `ComposeCalls` migration works end to end;
- at least one stateful write workflow uses an objective machine-checkable oracle;
- at least two semantic incompatibility cases are correctly rejected;
- the primary benchmark contains **15–20 controlled executable cases** across multiple evolution classes;
- at least 20% of final cases are held out from tuning;
- all cases separate synthesis evidence, gate evidence, and sealed final-evaluation evidence;
- B0 replanning, B1 heuristics, B2 generic wrapper, B2-V same-wrapper-plus-gate, and B3 ContractRelay are evaluated under matched information;
- B2 executes in a sandbox;
- stochastic methods complete at least 3 independent trials/case on the primary final model; extra 5-trial repeats are targeted, not mandatory;
- final primary model is `gemini-3.8-flash` unless the report explicitly documents a model change;
- the benchmark runner demonstrates quota-safe checkpoint/resume behavior;
- v1 requires $0 paid API/cloud spend;
- recovery and false-compatible/false-success results are reported as raw counts plus optional percentages;
- repeated-execution model use/cost is measured;
- results are reproducible from versioned fixtures;
- limitations and negative results are documented;
- a fresh literature/direct-competitor audit is completed before publication; real historical examples are not required for v1.

Potential resume structure after results exist:

> **ContractRelay — Evidence-Gated Compatibility Runtime for AI Agent Tools** | TypeScript, Node.js, MCP, Zod, Docker  
> Built a TypeScript runtime that synthesized deterministic backward-compatibility adapters for evolving MCP/API tool contracts, preserving stable agent-facing interfaces across schema, response, and multi-call workflow changes.  
> Designed a fail-closed verification pipeline using trace replay and state-based behavioral oracles; evaluated across **X** executable migrations against replanning, heuristic, and LLM-wrapper baselines, recovering **Y/X cases** with **Z/N hidden-evaluation false-compatible promotions** across repeated trials.

Only measured values should replace X/Y/Z.

## 44. Immediate Implementation Order

Build in this order:

```text
1. repository config + `.env.example` + zero-cost/model quota config
2. ToolContract IR + hashing
3. AdapterPlan schema
4. deterministic interpreter
5. primitive fixtures/tests (must pass with no API key)
6. evidence-partition loader (synthesis / gate / sealed eval)
7. verifier + promotion registry
8. MCP compatibility proxy
9. shared quota-aware model client (`@google/genai`) + persisted request manifests + `--resume`
10. structured LLM synthesis using Gemini 3.5 Flash-Lite for development
11. ComposeCalls + SQLite state oracle
12. publish MVP demo/repo as in-progress
13. freeze 15–20 case benchmark
14. B0/B1/B2/B2-V/B3 harness + sandbox
15. full Flash-Lite smoke/regression benchmark
16. 3-trial Gemini 3.8 Flash final benchmark across quota days
17. optional 5-trial extensions for unstable/high-value cases
18. final reproducible report + demo
19. fresh literature/direct-competitor audit before release
```

The order is deliberate: trusted deterministic infrastructure and evidence isolation come before model synthesis claims; the stateful oracle comes before benchmark polish; the public MVP appears before the full evaluation is finished.

## 45. First Repository Issues / Work Items

Recommended initial issue list:

1. `infra: add .env.example, secret handling, and zero-cost model/quota config`
2. `llm: add @google/genai provider abstraction skeleton`
3. `core: define ToolContract v1 schema`
4. `core: canonical JSON serialization and contract hashing`
5. `mcp: snapshot tools/list into ToolContract bundle`
6. `dsl: define AdapterPlan v1 Zod schema`
7. `dsl: implement RenameTool / RenameArg`
8. `dsl: implement default / type conversion / enum mapping`
9. `dsl: implement ProjectResponse / Reject`
10. `runtime: deterministic AdapterPlan interpreter`
11. `verify: structural verifier + report schema`
12. `traces: canonical trace JSONL format and replay runner`
13. `verify: predicate/property oracle interface`
14. `promotion: registry + exact contract-hash binding`
15. `mcp: compatibility proxy exposing old contract`
16. `synth: provider-neutral structured generation interface`
17. `synth: evidence-grounded AdapterPlan prompt`
18. `llm: quota-aware scheduler with RPM/RPD soft caps`
19. `llm: persisted request manifests + bounded 429 retry`
20. `llm: resumable benchmark queue and final-trial cache bypass`
21. `dsl: bounded ComposeCalls + intermediate references`
22. `fixture: SQLite refund workflow and state oracle`
23. `verify: side-effect recorder / duplicate detection`
24. `bench: case evidence partitions + held-out flag`
25. `bench: enforce sealed-eval access boundary`
26. `bench: B0 strong replanning baseline`
27. `bench: B1 deterministic heuristics baseline`
28. `bench: B2 generic LLM wrapper generation`
29. `bench: sandbox arbitrary B2 wrapper execution`
30. `bench: B2-V same-artifact verifier variant`
31. `bench: B3 ContractRelay runner`
32. `bench: Flash-Lite full-suite smoke/regression run`
33. `bench: Gemini 3.8 Flash 3-trial quota-day orchestration`
34. `bench: optional targeted 5-trial extensions`
35. `bench: count-first recovery + hidden false-compatible + rejection report`
36. `docs: composed migration and semantic rejection walkthroughs`
37. `research: pre-release literature/direct-competitor re-audit`
38. `release: reproducible demo + architecture diagram + final report`

Do not create issues for a UI, hosted service, OpenAPI support, real-history resurrection, or additional DSL operators until the flagship acceptance tests are complete.


## 46. Final Product Principle

ContractRelay should optimize for this rule:

> **A broken workflow is visible; a falsely compatible workflow can be silently wrong. Prefer a justified rejection over an unverified success.**

That principle should influence the DSL, verification policy, benchmark metrics, runtime behavior, and final project story.

---

## 47. References

1. Liu, H. et al. **MCPEvol-Bench: Benchmarking LLM Agent Performance Across Dynamic Evolutions of MCP Servers.** arXiv:2607.14642 (2026). https://arxiv.org/abs/2607.14642
2. Model Context Protocol. **2026-07-28 Specification.** https://github.com/modelcontextprotocol/modelcontextprotocol/tree/main/docs/specification/2026-07-28
3. Model Context Protocol Blog. **The 2026-07-28 Specification.** https://blog.modelcontextprotocol.io/posts/2026-07-28/
4. `agent-tool-drift`. **Agent tool contract drift detection.** https://github.com/fykong/agent-tool-drift
5. AgentCompat. **Trace-driven compatibility testing for evolving LLM tool schemas.** https://github.com/armanzareian/agentcompat
6. `mcp-proxy-processor`. **MCP proxy with tool/schema overrides and argument/response processing.** https://github.com/hughescr/mcp-proxy-processor
7. MCP-AQL. **Adapter Generator Specification.** https://mcpaql.com/spec/adapter/generator.html
8. Gortex. **Compact MCP surface specification / stable facade.** https://github.com/zzet/gortex/blob/main/docs/mcp-facade-v1.md
9. Agent Patterns Catalog. **Agent Adapter.** https://www.agentpatternscatalog.org/patterns/agent-adapter/
10. `mcp-migrate`. **MCP migration tooling.** https://github.com/dheerajjha/mcp-migrate
11. Kuang, L. et al. **APIMig: A Project-Level Cross-Multi-Version API Migration Framework Based on Evolution Knowledge Graph.** IJCAI 2025. https://www.ijcai.org/proceedings/2025/829
12. Fruntke, L.; Krinke, J. **Automatically Fixing Dependency Breaking Changes.** PACMSE/FSE 2025. https://doi.org/10.1145/3729366
13. Reyes, F.; Baudry, B.; Monperrus, M. **Agentic Generation of AST Transformation Rules for Fixing Breaking Updates.** arXiv:2606.24446 (BigBag), 2026. https://arxiv.org/abs/2606.24446
14. Kang, M. et al. **Pig: Leveraging Large Language Models for Python Library Migrations.** PACMSE/FSE 2026. https://doi.org/10.1145/3797072
15. Bhardwaj, V. P. **AgentAssay: Token-Efficient Regression Testing for Non-Deterministic AI Agent Workflows.** arXiv:2603.02601 (2026). https://arxiv.org/abs/2603.02601
16. Yang, B. et al. **Do Tool Calls Execute as Intended? Measuring and Repairing Intent-Execution Correspondence in LLM Agents.** arXiv:2610.04375 (2026). https://arxiv.org/abs/2610.04375
17. Google AI for Developers. **Gemini API Rate Limits.** https://ai.google.dev/gemini-api/docs/rate-limits
18. Google AI for Developers. **Gemini Developer API Pricing.** https://ai.google.dev/gemini-api/docs/pricing
19. Google AI for Developers. **Gemini API Structured Outputs.** https://ai.google.dev/gemini-api/docs/structured-output
20. Google AI for Developers. **Gemini API / Google GenAI JavaScript SDK.** https://ai.google.dev/gemini-api/docs

## 48. Document Decision

**Decision: GREEN — BUILD THE ZERO-COST, METHODOLOGY-HARDENED FLAGSHIP SCOPE.**

The core project remains approved. Version 1.3 keeps the v1.2 methodology fixes and adds an explicit zero-cost execution contract so Codex can implement the project without assuming paid APIs or cloud infrastructure:

- promotion evidence and final scoring evidence are now separated;
- false compatibility is measured on unseen sealed evidence rather than the same oracle used for promotion;
- `B2-V` isolates the value of the verifier from the value of the constrained DSL/runtime;
- stochastic methods require repeated trials and count-first reporting;
- arbitrary B2 wrapper code is sandboxed;
- benchmark engineering is budgeted as a major phase rather than half a week;
- flagship completion is planned as ~4–5 focused engineering weeks / ~6–8 calendar weeks, with an earlier publishable MVP;
- real historical-server resurrection is removed from v1 scope;
- the literature/direct-competitor search must be refreshed before public release;
- development uses Gemini 3.5 Flash-Lite free-tier quota and final primary evaluation uses Gemini 3.8 Flash free-tier quota;
- all model calls go through a quota-aware, persistent, resumable scheduler;
- final evaluation is expected to span multiple quota days; this is planned and must never trigger automatic paid fallback;
- v1 requires **$0 additional external spend**.

The flagship story remains:

> **ContractRelay automatically synthesizes a constrained deterministic compatibility adapter when an agent’s tool changes, independently gates the adapter using limited behavioral evidence, exposes the old logical interface through MCP, and then evaluates the promoted adapter against unseen workflow/state evidence to detect false compatibility.**

The project should be judged on **non-trivial recovery, hidden-evaluation false compatibility, safe rejection, verifier contribution, deterministic reuse, and reproducibility**.

## 49. Codex Execution Contract

This section is written as direct implementation guidance for Codex or any coding agent starting from this PRD. Treat it as operationally binding unless a later user instruction overrides it.

### 49.1 Source of truth

- This `prd.md` is the source of truth for v1 scope.
- Do not add product features outside the acceptance criteria merely because they are interesting.
- If an implementation detail is ambiguous, prefer the smallest design that preserves type safety, deterministic execution, evidence isolation, resumability, and the $0 budget.
- Do not weaken or bypass sealed-evaluation boundaries for convenience.

### 49.2 First implementation milestone

Start with a working repository skeleton and deterministic core. The first milestone MUST NOT require a Gemini API key.

Minimum first milestone:

```text
pnpm install
pnpm lint
pnpm typecheck
pnpm test
```

all succeed locally with:

- ToolContract v1;
- canonical hashing;
- AdapterPlan Zod schema;
- primitive deterministic interpreter;
- unit tests for rename/default/type/enum/response projection/reject;
- no model/network dependency.

Only after this milestone is green should Codex wire the Gemini provider.

### 49.3 Gemini implementation requirements

- Use `@google/genai` behind a small provider interface so the core is not Gemini-specific.
- Use `GEMINI_API_KEY` from the environment.
- Use JSON Schema/Zod structured output for ContractRelay `AdapterPlan` generation.
- Development model default: `gemini-3.5-flash-lite`.
- Final benchmark model default: `gemini-3.8-flash`.
- Never hard-code credentials.
- Never silently switch to a paid model/tier.
- Never create extra projects/API keys to evade quotas.
- Never send sealed evaluation evidence to synthesis or promotion.

### 49.4 Model-call persistence

Persist every model interaction under a stable run directory before the next call. A suggested layout is:

```text
runs/
  <benchmark-version>/
    <case-id>/
      <method>/
        trial-001/
          request.json
          response.json
          artifact.json
          run.json
        trial-002/
          ...
```

`run.json` should include at least:

```yaml
status: pending | running | completed | failed | quota_blocked
provider: google
model:
started_at:
completed_at:
request_index_for_model_day:
prompt_hash:
response_hash:
artifact_hash:
input_tokens:
output_tokens:
retry_count:
error_code:
```

Writes should be atomic enough that a process crash cannot mark an incomplete trial as completed.

### 49.5 Resume semantics

`pnpm eval --resume` (or equivalent CLI) must:

1. read the frozen benchmark manifest;
2. scan retained run artifacts;
3. skip completed final trials;
4. retry only failed/quota-blocked/incomplete trials according to policy;
5. continue until the configured request budget is reached;
6. exit successfully with a clear `quota_blocked`/`remaining` summary when no more free requests should be issued that quota day.

A daily quota stop is **not** a benchmark failure.

### 49.6 Current free-tier scheduling defaults

For the quota snapshot recorded on 2026-10-17:

```text
gemini-3.5-flash-lite
  hard: 15 RPM / 250K TPM / 500 RPD
  default soft daily budget: 450 requests

gemini-3.8-flash
  hard: 5 RPM / 250K TPM / 20 RPD
  default soft daily budget: 18 requests
```

The scheduler should use the configured values rather than scraping AI Studio. Rate-limit configuration is expected to be manually updated if the user's visible quota changes.

### 49.7 Development workflow

Do not consume Gemini 3.8 Flash quota until all of the following are true:

- deterministic core tests pass;
- MCP proxy positive path works;
- one rejection case works;
- benchmark fixtures reset deterministically;
- evidence partitions are enforced;
- B2 sandbox works;
- the whole suite completes successfully using Flash-Lite development mode;
- result accounting and `--resume` have been tested with an artificially tiny quota.

### 49.8 Final benchmark workflow

Final primary evaluation should run approximately as:

```text
1. freeze case manifest + prompts + gate evidence + sealed evidence hashes
2. run B1 deterministic baseline locally
3. run B0/B2/B3 with gemini-3.8-flash, 3 independent trials per case
4. derive B2-V from the exact B2 artifacts without a new generation call
5. stop automatically at the configured daily free-request soft cap
6. resume on later quota days until mandatory trials complete
7. selectively extend unstable/high-value cases to 5 trials if free quota/time remains
8. unseal final-evaluation evidence only after each method's candidate/gate verdict is committed
9. produce count-first result tables and retained run artifacts
```

### 49.9 No-spend guardrails

Codex must not add any v1 dependency that requires payment. In particular, do not:

- provision cloud VMs/databases;
- use paid LLM APIs as an implicit fallback;
- require a paid observability service;
- use Search/Maps grounding;
- enable Google billing as part of setup;
- assume Batch API;
- make final evaluation depend on a hosted service.

If a free-tier limit blocks progress, preserve state and continue later.

### 49.10 Definition of a good Codex handoff

At the end of every implementation chunk, Codex should leave:

- code that type-checks;
- targeted tests for the new behavior;
- no committed secrets;
- updated README/ADR only where needed;
- a short note of completed PRD requirements and the next smallest implementation step;
- no fabricated benchmark results.

