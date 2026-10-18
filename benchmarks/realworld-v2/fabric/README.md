# Microsoft Fabric MCP

Real 1.3.0 to 1.4.0 bundled API documentation workflow: tool rename plus required
hyphenated argument rename. Three independent generations propose the documented
changes but fail the unchanged DSL field grammar. These are generation failures,
not safe rejections; no gate or promoted compatibility execution was run.

See [provenance](provenance.json), [native traces](traces/),
[raw invalid generations](model-interactions/), [parser diagnostics](../results/generation-diagnostics.json),
and the [extension report](../REPORT.md).

Replay: `node --import=tsx benchmarks/realworld-v2/replay.mjs --case fabric`.
