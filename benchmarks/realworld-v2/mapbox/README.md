# Mapbox MCP

Real v0.11.0 to v0.12.3 migration: single point argument becomes a singleton
points array, with a different native response shape. Three independent trials
explicitly reject unsupported DSL transformations; none is promoted.

See [provenance](provenance.json), [native traces](traces/),
[raw model interactions](model-interactions/), and the [extension report](../REPORT.md).

Replay: `node --import=tsx benchmarks/realworld-v2/replay.mjs --case mapbox`.
