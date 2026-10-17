# Controlled comparison protocol

The frozen suite has 15 cases, including three held out from prompt and heuristic
tuning. `benchmarks/manifests/suite-v3.json` binds the synthesis/gate/sealed
partitions, executable fixture source and task inputs. `protocol-v2.json` binds
the baseline source, generation prompts, model settings and Docker image policy.
Changed frozen artifacts stop execution; they require an explicitly versioned
protocol/suite rather than silently changing a measured trial.

Versions 1 and 2 are retained for audit. Before any held-out model scoring, the original count-only
limit case was replaced by a versioned opaque-record retrieval case with an
independent SQLite read observation. The original case could reward fabrication
of a count. Prompts and heuristics were unchanged; the revised oracle was frozen
before execution. Development responses for the unchanged cases are reused,
including their failures, without replacement generation in that pilot.

The pilot exposed three provider HTTP 400 schema failures. These are infrastructure
failures, not evidence of model quality. Protocol version 2 removes nested array
bounds from the provider's serving grammar, retaining all canonical host bounds.
Live development acceptance of both affected schema families passed before the
new freeze. Suite version 3 replaces all three held-out cases with newly authored
delivery-enum, three-call workspace and opaque stream-retrieval cases after that
freeze. Prompts/heuristics are not adjusted against these replacement holdouts.
Earlier pilot scores are not final benchmark results. A fresh job namespace and
complete development regression are required before final-model use.

All cases are controlled synthetic migrations. No claim is made that these are
production incidents. The missing-default case is labeled insufficient evidence,
separately from incompatible semantics. The source PRD's evolution taxonomy
informs the change classes; no upstream benchmark fixtures are copied.

## Methods and evidence

All methods receive the exact same synthesis JSON, whose hash is recorded in
each parity manifest. It includes the old/new contracts and authoritative docs.
Mechanical cases provide structured change documentation to every method.
Labels, gate predicates, fixture internals and sealed oracles are not provided
to generators. B0 additionally receives the original task input and its own tool
results on each execution. The task input is execution context, not an oracle.

- B0 replans through up to eight validated calls and records the action transcript
  before sealed scoring. Every task/replay incurs its own model jobs.
- B1 applies explicit documented mechanical rules. It refuses composition,
  stateful semantics and unspecified mappings; it has no case-specific branches.
- B2 generates ordinary JavaScript once per trial. It runs only in Docker.
- B2-V uses the exact B2 artifact hash. The shared verifier applies the same
  replay, predicate and V3 state/effect logic used for B3. No generation occurs.
- B3 synthesizes the bounded DSL in a restricted worker, repeats independent
  verification and executes through the exact-hash promotion registry.

Representation checks differ by design: B3 validates DSL structure and citations;
B2-V validates wrapper data, schemas and effect policy. Their V1–V3 checks share
one implementation. Neither arbitrary JavaScript nor model actions can select
permissions or access a real external write environment.

Each final stochastic method requires three independent trials per case; B1
runs once. B2-V inherits B2's trial and generation. Sampling temperature is 0.2;
prompts and artifacts are hashed, final caching is disabled, and provider model
versions are retained when returned. Failed attempts remain in denominators.

## Reproduce

```sh
pnpm bench:freeze
pnpm check
docker pull node@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
pnpm test:sandbox
pnpm bench --api-free --include-held-out --resume
pnpm bench --resume
pnpm bench --include-held-out --resume
```

API-free execution uses B1 only. The development model comparison first executes
the 12 development cases. The last command adds held-out scoring in a separate
run folder, reusing the already-recorded development results. It does not tune
the prompts or heuristics against those cases. The development acceptance
manifest is written only after all 75 case/method records exist and no provider,
network, Docker or worker infrastructure failures remain. Invalid model artifacts
remain legitimate failed trials; they are not replaced to improve scores.

Final execution requires that manifest, the frozen final model and all methods,
cases and at least three trials. Set `CONTRACTRELAY_MODEL_MODE=final` for
`pnpm bench --resume`. The soft daily budget cannot exceed 18; exhaustion exits
with `quota_blocked`. The same command resumes on a later Pacific quota day.
Do not delete runs or reset quota ledgers to bypass the cap. No paid fallback.
Final run identity also fingerprints runtime/gate source, the dependency lock,
configuration and the local Node platform/version. A changed implementation
cannot silently resume into the same final experiment.

Results live in ignored `runs/benchmark-v3-*/`: immutable candidates, decisions,
gate reports, observations and trial results; `summary.json`/`full-summary.json`
contain counts by method, change class, case and held-out status. Model request
artifacts and quota ledgers are shared with the development synthesis scripts.
`model-usage.json` counts retained attempts, tokens and unknown-usage attempts,
including invalid model outputs. Logical model jobs and actual HTTP attempts
are distinct quantities.

`pnpm bench:continue` runs the final comparison sequentially across Pacific quota
days after the acceptance gate. It does not reset ledgers, replace failed trials
or publish results. A singleton lock prevents two continuation processes; an
unexpected batch error stops the process. Status and logs are in ignored
`.contractrelay/final-runner.json` and `.contractrelay/final-runner.log`. Create
`.contractrelay/final-runner.stop` to stop after the current batch. The computer
must remain running; after a restart, remove the stop file if present and launch
the same command. The scheduler resumes completed work without regeneration.

## Sandbox and limitations

The digest-pinned official Node container has no host mounts, environment
forwarding, Docker socket or external network. It runs as UID 65534 with a
read-only root, disposable tmpfs, dropped capabilities, no new privileges,
32-process limit, 128 MiB memory, half a CPU, bounded output and a ten-second
wall limit. Host RPC accepts only schema-validated allowlisted fixture tools.
Timeout cleanup removes the exact randomly named container. Real acceptance
tests cover network, filesystem, environment, RPC, infinite loops and flooding.
The settings follow the official [Docker run documentation](https://docs.docker.com/engine/containers/run/)
and [none network driver](https://docs.docker.com/engine/network/drivers/none/).

Containers rely on the local Docker engine/kernel; they are not a formal proof
against a kernel exploit. Gate evidence is finite, and the suite is small and
controlled. A separate SQLite provenance fault demonstrates gate promotion
followed by sealed failure. Unseen oracle inputs/assertions matter: gate pass is
never counted directly as hidden recovery. A refusal after B0 has already
performed side effects is excluded from safe-rejection counts.
