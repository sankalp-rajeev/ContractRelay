# Reference and related systems check

Checked 2026-10-17 against primary paper pages, project documentation and
repositories. This is a scoped engineering audit, not an exhaustive systematic
review or an independent reproduction of other systems' performance. The PRD
is preserved unchanged. Descriptions below distinguish published functionality
from our interpretation of how it relates to ContractRelay.

[MCPEvol-Bench](https://arxiv.org/abs/2607.14642) is a verified July 2026 paper
about agent performance under evolving MCP toolsets. Its executable mutation
approach grounds the controlled evolution setting. ContractRelay does not copy
its fixtures or claim to reproduce its full dataset/results. Our much smaller
suite studies retained adapters and independent promotion, rather than claiming
benchmark-scale coverage.

[agent-tool-drift](https://github.com/fykong/agent-tool-drift) already normalizes
tool definitions into contracts, compares snapshots and emits migration advice
and CI reports. [AgentCompat](https://github.com/armanzareian/agentcompat) already
replays observed arguments against old/new schemas with deterministic impact
scores and repair hints. Contract normalization, diffs and replay are therefore
existing techniques. Our interpretation is that behavioral/state evidence and
executed persistent adapters are the dimensions this project needs to evaluate;
the comparison cannot rest on naming a schema `ToolContract`.

[mcp-proxy-processor](https://github.com/hughescr/mcp-proxy-processor) documents
argument/response processing and tool-description overrides. The
[MCP-AQL generator specification](https://mcpaql.com/spec/adapter/generator.html)
already specifies schema-driven adapter generation and provenance artifacts.
[Gortex's facade specification](https://github.com/zzet/gortex/blob/main/docs/mcp-facade-v1.md)
documents stable request envelopes, effect boundaries, canonical routing and
compatibility tests. Proxies, generated adapters, stable facades and effect-aware
routing are not new contributions here.

[APIMig](https://www.ijcai.org/proceedings/2025/829) addresses API migration using
evolution knowledge. [BigBag](https://arxiv.org/abs/2606.24446) generates reusable
AST fixing transformations for breaking library updates. Both are relevant to
repair/reuse claims; ContractRelay's runtime tool facade is a different setting,
not evidence that reusable migration synthesis is new.

[AgentAssay](https://arxiv.org/abs/2603.02601) covers regression testing of
nondeterministic agent workflows, including metamorphic relations and statistical
gates. [IntAct/IEC](https://arxiv.org/abs/2610.04375) studies whether execution
matches emitted tool intent across intermediary hops. These support keeping
trace evidence, repeated trials and actual execution observations distinct from
surface call success. We do not infer that a finite passing gate proves intent
or semantic equivalence for arbitrary unseen executions.

A fresh search also identified close adjacent work beyond the PRD's list.
[ToolGate](https://arxiv.org/abs/2601.04688) specifies pre/postcondition checks and
verified symbolic state evolution. [Governed capability evolution](https://github.com/s20sc/governed-capability-evolution)
provides compatibility screening, sandbox/shadow execution and gated activation
for embodied-agent capabilities. [AGATE](https://arxiv.org/abs/2609.30830) uses
authorization, provenance and effect ledgers with deterministic runtime checks.
These overlap directly with verification/admission/ledger ideas. ContractRelay
must not claim that evidence gates or deterministic effect checks are novel.
[GATE](https://aclanthology.org/2026.acl-long.87/) evolves reusable tool graphs;
our interpretation is that tool construction is adjacent to, rather than the
same task as, preserving a previously exposed logical contract.

The bounded contribution to test is the combination of constrained migration
synthesis, trusted deterministic reuse and independently gated promotion under
an evidence-separated, paired B2/B2-V comparison. The actual benchmark may show
limited recovery or no advantage. Claims of superiority, first-of-kind status,
production safety or semantic proof are withheld. Final results must include
failures and limitations before any portfolio release.

The model IDs were also rechecked in Google's official
[model catalog](https://ai.google.dev/gemini-api/docs/models) and
[pricing page](https://ai.google.dev/gemini-api/docs/pricing): the configured
development/final endpoints are listed with free standard-tier input/output.
Account quotas remain project-specific; the runner enforces the PRD snapshot
and never enables a paid fallback or paid grounding feature.
