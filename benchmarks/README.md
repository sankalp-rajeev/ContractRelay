# Benchmark workspace

The frozen suite contains 15 executable cases and three held-out cases.
Synthesis, gate and sealed evaluation partitions have enforced access boundaries.
Protocol v2 and suite v3 remain unchanged after final evaluation.

`results/development-v3.json` preserves the single-trial development regression,
including invalid artifacts and hidden failures. `results/final-v3.json` records
195 final evaluations: B0/B2/B2-V/B3 each run three trials per case; B1 runs once.
The final stochastic methods reach a ceiling on this small controlled suite;
the results do not demonstrate a quality advantage for B3 or B2-V.

Run `pnpm bench:report` to regenerate the primary final summary without an API key.
See `docs/benchmark.md` for evidence parity, sandboxing, cost accounting and
checkpoint/resume. Raw model artifacts and quota ledgers remain in ignored `runs/`.
