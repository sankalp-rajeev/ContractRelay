# ADR 0004: Match information and isolate verifier effects

Status: accepted; suite, harness and sandbox implemented; live development regression in progress.

Start with 15 controlled executable cases, at least 20% held out from prompt and
heuristic tuning. Every case has distinct synthesis, gate and sealed evidence.
Require at least three independent final stochastic trials per case.

Compare B0 strong replanning, B1 deterministic heuristics, B2 generic wrapper,
B2-V that exact wrapper plus the ContractRelay gate, and B3 the constrained plan
with the same gate. B2 requires resource-limited, network-disabled sandboxing
before execution. B2-V must reuse B2's artifact hash without another generation.

Report hidden recovery and false-compatible/false-success counts, safe rejections,
unsupported coverage and recurring model use. Keep failed cases in appropriate
denominators. Gate passes are not hidden-evaluation successes. A small controlled
suite supports bounded claims, not proof of arbitrary semantic equivalence.

See [the executable protocol](../benchmark.md) and the frozen manifests under
`benchmarks/manifests/`. Missing semantic evidence is classified separately from
demonstrably incompatible effects. Invalid generated artifacts and partial quota
stops remain in the request accounting; B0 refusals after effects are not safe
rejections. No final-model results are claimed until the complete suite finishes.
