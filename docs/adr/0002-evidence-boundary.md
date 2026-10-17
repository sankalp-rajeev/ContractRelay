# ADR 0002: Separate synthesis, promotion and final scoring

Status: accepted; loaders, actual consumer worker restrictions and read-only registry implemented.

Every case must have explicit synthesis, gate and sealed-evaluation partitions.
Generators receive a typed synthesis-only bundle. Verifiers receive gate evidence.
The evaluator records the candidate and verdict before opening sealed inputs,
labels and assertions. A shared case-directory reader is not an acceptable API.

Directory separation is an authoring convention, not a security mechanism.
Loaders check canonical paths, symlink escapes and evidence hashes. Actual
synthesis and verification run in Node processes that can read only their trusted
bundled code, receive no host environment, and have no filesystem write grant.
Direct filesystem probes against sealed data fail in both consumer workers.
The coordinator brokers allowlisted tool calls and quota-scheduled generation
through JSON messages, records immutable artifacts, and then opens sealed data.
Report schemas contain gate results only; hidden scoring is a separate artifact.

Promotions bind old/new contract hashes, plan hash and policy version. Registry
creation repeats isolated verification rather than trusting a verdict string.
Failing, absent or inconclusive mandatory evidence cannot authorize runtime calls.

Consequences: the sealed oracle can falsify a promoted candidate, preserving
non-circular false-compatibility measurement. Additional fixture and runner work
is required before any benchmark safety result can be claimed. These trusted-code
filesystem restrictions are not the hostile-code sandbox required for B2.
