# ADR 0002: Separate synthesis, promotion and final scoring

Status: accepted; enforced loaders and promotion registry planned.

Every case must have explicit synthesis, gate and sealed-evaluation partitions.
Generators receive a typed synthesis-only bundle. Verifiers receive gate evidence.
The evaluator records the candidate and verdict before opening sealed inputs,
labels and assertions. A shared case-directory reader is not an acceptable API.

Directory separation is an authoring convention, not a security mechanism.
Future loaders/process permissions and tests must enforce the access boundary.
Report schemas contain gate results only; hidden scoring is a separate artifact.

Promotions must bind old/new contract hashes, plan hash and policy version.
Failing, absent or inconclusive mandatory evidence cannot authorize runtime calls.

Consequences: the sealed oracle can falsify a promoted candidate, preserving
non-circular false-compatibility measurement. Additional fixture and runner work
is required before any safety result can be claimed.
