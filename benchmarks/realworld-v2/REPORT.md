# Historical external-validity v2 results

Two new real historical migrations were accepted and evaluated in the requested
order. Neither was recovered. Three Mapbox trials explicitly rejected unsupported
structural transformations. Three Fabric trials generated invalid DSL plans and
never reached the verifier. There were **zero promotions and zero observed
false-compatible outcomes**; 0/0 promoted adapters supplies no positive evidence
about semantic compatibility.

Across v1 and v2, the measured total is **five migrations: two recovered, two
safely rejected, one with generation failures**. Mindwtr/Nexus remain 3/3 recovered
each; sqlew remains 3/3 safely rejected. All prior files are preserved byte for byte.

## Mapbox MCP — accepted, structural argument and response migration

- Repository: https://github.com/mapbox/mcp-server
- Old: **v0.11.0**, `7d2c0f323915ebd4aeb3ff6721cae51c81300941`
- New: **v0.12.3**, `aae9e2fa777aab88809950032841675a844691df`
- Removal commit: [`85eb71d9b2283a42c5d6de2e33c93f748feeff82`](https://github.com/mapbox/mcp-server/commit/85eb71d9b2283a42c5d6de2e33c93f748feeff82)
- [Pinned public changelog](https://github.com/mapbox/mcp-server/blob/aae9e2fa777aab88809950032841675a844691df/CHANGELOG.md)

The real `point_in_polygon_tool(point, polygon)` was removed. Its replacement
requires `points=[point]` and returns `{points_within, count, total}` instead of
`{inside, point}`. Correct compatibility needs dynamic singleton-array
construction, a count-to-boolean transformation and retention of the input point.
The unchanged bounded DSL lacks those operations. No wrapper, constant test-point
substitution, schema approximation or compiler patch was supplied.

Old success, unchanged-old-on-new failure and native-new success were executed and
recorded. Native schemas are retained. Three held-out geometry workflows cover
outside points, a polygon hole and negative coordinates. Expected outputs came
from the real old server and were independently checked by ray casting that does
not use Turf or the upstream implementation.

**Trials 1, 2 and 3:** explicit Reject, gate REJECTED, recovery false, safe rejection
true, false-compatible false. No translation was promoted or executed. All three
raw responses identify the unsupported transformations. [Trial artifacts](mapbox/results/)
and [provenance](mapbox/provenance.json) retain the measured evidence.

## Microsoft Fabric MCP — accepted, tool and required-argument rename

- Repository: https://github.com/microsoft/mcp
- Old: **Fabric.Mcp.Server-1.3.0**, `4828227fcf11fcae80794ff4620897160d32d583`
- New: **Fabric.Mcp.Server-1.4.0**, `d638fefa0c98b91916da81a694035f5fe4625f5b`
- [Pinned public changelog](https://github.com/microsoft/mcp/blob/d638fefa0c98b91916da81a694035f5fe4625f5b/servers/Fabric.Mcp.Server/CHANGELOG.md)
- [Official release-image metadata](fabric/docker/): exact digests and Microsoft
  `com.azure.dev.image.build.sourceversion` labels match both source SHAs.

The scored workflow retrieves bundled API documentation. It combines
`docs_workload-api-spec → docs_item-api-spec` with the required
`workload-type → item-type` argument rename. Old calls succeed on the old binary;
the unchanged call fails on the new binary. Calling the new name with the old
argument also fails. The correctly named native new call works without an account
or network. Held-out report/lakehouse specifications are independently read from
the exact old Git revision; their Git blob identities match the new release.

The additional list-tool response change is independently captured in
[native traces](fabric/traces/list-response-change.json). The changelog describes
`workloads → itemTypes`; the observed wire fields are **`Workloads → ItemTypes`**.
This separate operation is provenance only, not claimed as a scored workflow.

**Trials 1, 2 and 3:** `INVALID_MODEL_OUTPUT`, generation_failed true, gate
INCONCLUSIVE/not executed, recovery false, safe rejection false, false-compatible
false. Each response proposed the documented rename, but `RenameArg.from` and
`.to` violate the existing identifier regex because they contain hyphens.
[API-free diagnostics](results/generation-diagnostics.json) reproduce the exact
two parser failures per trial. Raw invalid outputs are retained in
[model-interactions](fabric/model-interactions/); the bookkeeping Reject sentinel
is not a model rejection. No replacement generation or grammar fix was performed.

## Candidate decisions and scope

Mapbox and Microsoft Fabric were accepted after native reproduction. No candidate
repository was rejected as non-breaking or unreproducible. Optional arXiv was
**deferred, not evaluated or counted**: Mapbox needed real Git metadata for its
unmodified build, and Fabric needed a writable .NET bundle-extraction cache in
the disposable tmpfs. The protocol's clean/quick condition for a third repository
was therefore not met. No arXiv version or result is invented.

Both accepted cases use actual public historical binaries and public synthetic
inputs. They do not evaluate Mapbox APIs, private Fabric services or writes.
Finite gate evidence cannot establish semantic equivalence. These observations
do not compare performance with LLM baselines or establish production safety.

## Cost, replay and integrity

**6 Gemini calls; 10,794 input tokens; 806 visible output tokens; 6,641 thinking
tokens. Estimated spend: $0.03602175 of the $1 hard cap.** Unknown usage: zero.
Invalid generations are fully charged. The [durable ledger](results/budget.json)
retains every request and its reservation. Rates were verified against
[Google's published pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash)
on 2026-10-18: $0.75/M input and $3.75/M output including thinking.

All six outcomes replayed API-free against the real pinned new servers.
[Replay validation](results/replay-validation.json) reproduces Mapbox's gate
rejections and Fabric's original parser failures without turning those failures
into safe rejections. No frozen candidate, prompt, gate, score or result was edited.

Protected audit: **321 pre-existing files unchanged**, including every v1 file
and the original 195 controlled records. Raw aggregate:
`b8cd270b81d82663bd58e0b1d4b44a20a0dce9cbc99fd8c03a08bc4bcd34df53`.
Portable UTF-8/LF aggregate:
`112e6d4a24d367dc213bd0ca88baf9847a244df47a47a05a14a0c443858501df`.
The earlier 317-file inspector audit and its original baselines also pass. The
core execution fingerprint remains
`ad4a35c05d8c2aba38e303fec9bdf12ee0e7c20c00bf0d278c43787e2546c299`.
**No core or CLI source changed.** Exact reproduction commands are in
[README.md](README.md#reproduce-without-gemini).
