# Generated reports

Generated reports are ignored by Git. Store small, redacted, intentionally
versioned release summaries only after measurements exist. Keep gate reports
and sealed-evaluation scores separate. `pnpm bench:report` regenerates
`final-summary.json` from the versioned final 195-record snapshot without an API
key. Final counts and caveats are in `benchmarks/results/final-v3.json`.

Persist model run artifacts in `runs/` (also ignored), following PRD 49.4.
