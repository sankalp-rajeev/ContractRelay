# ADR 0004: Match information and isolate verifier effects

Status: accepted; harness and benchmark cases planned.

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
