# Real-world external-validity extension

This separate suite evaluates three real historical public MCP migrations with
synthetic data. The flagship 15-case suite, its 195 final records, prompts,
heuristics, verifier, scoring and protocol are preserved unchanged.

The selected old and new servers have been built and executed. Each old workflow
passes; the unchanged old invocation directly on the new server genuinely fails.
Exact revisions, original dependency lockfiles, runtime pins, native tools/list
snapshots and public change provenance are recorded per case.

## Commands

Run from the repository root after installing its pinned pnpm dependencies.
Docker Desktop must be running. These commands acquire dependencies and reproduce
the genuine historical servers; they do not call Gemini:

```sh
node --import=tsx benchmarks/realworld-v1/acquire.mjs --case mindwtr
node --import=tsx benchmarks/realworld-v1/acquire.mjs --case nexus
node --import=tsx benchmarks/realworld-v1/acquire.mjs --case sqlew
node --import=tsx benchmarks/realworld-v1/run.mjs --validate
node --import=tsx --test benchmarks/realworld-v1/test/budget.test.mjs
```

After dependencies are acquired and versioned trial results exist, one command
reproduces each case through the unchanged ContractRelay promotion/proxy path:

```sh
node --import=tsx benchmarks/realworld-v1/run.mjs --case mindwtr --replay
node --import=tsx benchmarks/realworld-v1/run.mjs --case nexus --replay
node --import=tsx benchmarks/realworld-v1/run.mjs --case sqlew --replay
```

Fresh paid evaluation is explicit and separate:

```sh
node --env-file=.env --import=tsx benchmarks/realworld-v1/run.mjs --evaluate
node --import=tsx benchmarks/realworld-v1/report.mjs
```

The evaluator uses only `gemini-3.8-flash`, three independent uncached trials per
migration, and the frozen synthesis/verifier/runtime architecture. Completed and
invalid trials are retained. The API budget is **$1 maximum**: conservative input
byte bounds plus the requested combined output/thinking ceiling are reserved
durably before every request. Known usage releases excess reservation; unknown
or interrupted responses retain their entire bound. The existing scheduler's
exclusive lease protects accounting; concurrency is one, with at most ten calls
per Pacific quota day and no hidden SDK retries. No model calls are used for
history, setup, fixtures, verification, debugging or reporting.

## Evidence and isolation

The case's `synthesis-evidence/`, `gate-evidence/` and `sealed/` folders are hashed
before synthesis. The trusted coordinator stages the existing core partition
layout under ignored `runs/realworld-v1/`; no core loader changes are needed.
Permissioned workers receive only the designated loaded evidence. Sealed reads
are denied until candidate, report and decision are durable. Native old traces
for hidden inputs stay in the sealed partition.

Historical servers run without network, host mounts, credentials or root access,
with read-only roots and bounded disposable tmpfs storage. Image startup checks
historical source and lockfile hashes plus fixture-bootstrap hashes. Docker base
images are pinned by digest. Derived image IDs are audit records of the original
build; a fresh build may have a different ID while its checked inputs match.

Nexus uses genuine historical parsing, graph persistence and MCP lookup with a
preseeded synthetic graph. Its embedding/full-indexing workflows are not claimed
as reproduced. sqlew's consolidated tool has write capabilities, so its read
migration uses isolated-fixture V3 policy and SQL audit triggers that count actual
mutations, including same-value writes. Known upstream limitations are documented
per case and are preserved rather than patched.

The separate [report](REPORT.md) and `results/summary.json` distinguish these
external observations from the controlled flagship comparison. Success requires
exact historical output, independent SQL/AST facts and unchanged persisted state;
promotion or exception absence alone never counts as success.
