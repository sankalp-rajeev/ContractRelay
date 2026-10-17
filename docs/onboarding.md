# PRD onboarding

Source: `prd.md`, version 1.3, dated 2026-10-17. It remains unchanged.

## Product lifecycle

1. Normalize old and evolved tool definitions into versioned `ToolContract`s.
2. Use synthesis-visible contracts/docs/examples to propose a bounded plan.
3. Validate the plan and compile a deterministic candidate.
4. Verify using gate-designated traces, predicates and isolated state oracles.
5. Promote only for the exact old/new contract hashes, plan hash and policy.
6. Expose the old logical interface through MCP without model inference per call.
7. Commit the decision before opening sealed evaluation evidence for final scoring.

The safety principle is to prefer a justified rejection over unverified success.
`INCONCLUSIVE` must behave as rejection at runtime. Read-only tools need behavioral
evidence (V2); supported writes need state/side-effect evidence (V3). Unknown
effects must fail closed. Writes require explicit isolated fixture/simulator
policies and independent V3 evidence; real external writes are not enabled.

## Initial deliverable

PRD section 23 defines the ten-package monorepo layout. Section 49.2 defines the
API-free first milestone: install, lint, typecheck, primitive tests, ToolContract,
hashing, Zod plans and deterministic interpretation. Phase 1 is complete.
Phase 2 adds independent read-only gates, promotion and structured synthesis
infrastructure; its live generation, promotion and sealed-fixture acceptance pass.

The CLI implements `status`, help and `serve --fixture weather|refund` over MCP
stdio. Snapshot/prepare/synthesize/verify/promote/eval are library APIs or scripts
until the general CLI workflow is completed.

## Flagship requirements to preserve

- One composed migration and an objective SQLite state/side-effect oracle.
- At least two semantic incompatibilities correctly rejected.
- A real unchanged MCP client operating through the compatibility proxy.
- Freeze 15 cases first, with at least 20% held out from tuning.
- Separate synthesis, gate and sealed evidence for every case.
- B0 replanning, B1 heuristics, B2 unconstrained wrapper, B2-V the exact same
  wrapper plus gate, and B3 constrained ContractRelay under matched information.
- Sandbox B2 before executing arbitrary code; B2-V reuses its exact artifact.
- At least three independent final stochastic trials per case, without caching.
- Persist requests/results and resume across quota days without repeated final
  trials or automatic paid fallback.
- Report raw counts and limitations; never substitute gate passes for hidden
  recovery or fabricate benchmark results.

## Zero-cost execution

Model configuration comes from the PRD snapshot, with validated environment
overrides wired into the scheduler. Development uses `gemini-3.5-flash-lite`;
final evaluation around `gemini-3.8-flash`. Model IDs and actual free quotas must
be checked before model-backed runs. The controlled Phase 2 live check passed.

The shared scheduler must persist each interaction, bound retries, respect
per-model request/token budgets and the Pacific daily reset, and report
`quota_blocked` as a resumable stop. No private data may be sent to free-tier APIs.

## Acceptance boundary

The usable MVP passes its local and live acceptance checks, including MCP stdio,
ComposeCalls, SQLite state oracles and two semantic rejection cases. It is not
flagship completion: a B2 hostile-code sandbox, frozen cases and the executed
comparative benchmark remain planned in [roadmap.md](roadmap.md).
