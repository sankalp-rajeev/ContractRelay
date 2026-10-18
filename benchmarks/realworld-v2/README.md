# Harder historical MCP migrations

This versioned extension adds Mapbox and Microsoft Fabric to the three preserved
`realworld-v1` migrations. Both candidates were accepted only after executing real
old/new servers, capturing native `tools/list`, proving old success and direct
breakage, and checking that the native new operation works. Neither new migration
was recovered. Failures and raw model outputs are retained.

See [REPORT.md](REPORT.md), [protocol.json](protocol.json), and the per-case
`provenance.json`, source excerpts, traces and separated evidence partitions.

## Reproduce without Gemini

From the repository root, with Node 22.12+, pinned pnpm dependencies and Docker:

```sh
pnpm install --frozen-lockfile
node --import=tsx benchmarks/realworld-v2/acquire.mjs --case mapbox
node --import=tsx benchmarks/realworld-v2/acquire.mjs --case fabric
node --import=tsx benchmarks/realworld-v2/run.mjs --validate
node --import=tsx benchmarks/realworld-v2/replay.mjs
node --import=tsx benchmarks/realworld-v2/diagnose.mjs
node --import=tsx benchmarks/realworld-v2/report.mjs --offline
node --import=tsx --test benchmarks/realworld-v2/test/*.test.mjs
node apps/inspector/scripts/audit-protected.mjs
```

Acquisition needs public Git/registry access. Server runtime has no network,
credentials or host mounts. Mapbox builds the original source with original lock
files and actual Git release history. Fabric uses digest-pinned official images;
their vendor source-version labels match the Git release SHAs. Only revision
metadata and a disposable .NET extraction-cache setting are added to those images.

`replay.mjs` runs saved Mapbox candidates through the original isolated gate and
reproduces Fabric's parser failures from retained raw provider responses. It does
not gate the evaluator's bookkeeping Reject sentinel and relabel the failure as
a safe rejection. The paid evaluator's generic `run.mjs --replay` path cannot
reconstruct invalid generations; use the explicit replay command above.

The original evaluated harness and all trial identities remain unchanged. The
additional replay path is API-free and does not replace any candidate or outcome.
The sealed partition stays behind the existing durable-decision coordinator.

`report.mjs --offline` reads the committed interactions and budget ledger, so a
fresh checkout can regenerate the aggregates without the original ignored runs.

Fresh evaluation was explicit, uncached and sequential, with three independent
trials per migration. The unchanged v1 budget provider protects a separate v2
ledger with a **$1 hard cap**, charging output and thinking tokens and reserving
the full bound for unknown/interrupted requests. Six calls cost **$0.03602175**;
no more paid calls are needed to reproduce these artifacts.

## Protected artifacts

`protected-before.json` captures 321 pre-existing core/CLI/config/fixture/benchmark
files at commit `4097228`, including every `realworld-v1` file. Raw Windows hashes
and portable UTF-8/LF hashes are checked separately. The 195 controlled records,
original prompts, gates, scoring, core sources and v1 results remain unchanged.
`frozen-files.json` retains the evaluated v2 files; `supplemental-files.json`
records only later API-free replay/validation additions. Neither baseline is reset.

The inspector reads both versioned summaries through
`apps/inspector/data/historical-catalog.json`. It displays Fabric as INCONCLUSIVE,
with verification NOT RUN, rather than claiming its generation failures passed a
gate or were explicit safe rejections.
