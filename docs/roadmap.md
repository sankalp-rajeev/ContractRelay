# Implementation milestones

Use `prd.md` sections 34, 42–45 and 49 for full acceptance criteria.

## Foundation — implemented

- [x] Ten-package pnpm workspace, strict TypeScript, lint and Vitest.
- [x] ToolContract v1, canonical serialization and contract hashing.
- [x] Primitive AdapterPlan schema and structural checks.
- [x] Deterministic read-only candidate interpreter with schema boundaries.
- [x] Paginated MCP tools/list ingestion with explicit safety metadata.
- [x] Exact scaled integer conversion and seeded monetary property tests.
- [x] API-free primitive fixtures, negative tests and local smoke demo.
- [x] GitHub Actions definition, ignored secrets/runs, model/quota snapshot.

## Evidence, verification and promotion — next

- [ ] Typed partition loaders and enforced sealed-evaluation access boundary.
- [ ] Trace validation/redaction/replay and V0/V1/V2 gate checks.
- [ ] Independent predicate oracles and deterministic machine-readable reports.
- [ ] Promotion registry keyed by old/new/plan hashes and policy version.
- [ ] Reject missing evidence; invalidate promotions on contract drift.

## MCP and structured synthesis

- [ ] MCP tools/list ingestion and old-interface compatibility proxy.
- [ ] Shared persistent quota scheduler, bounded 429 retry and interruption/resume.
- [ ] `@google/genai` implementation behind the provider-neutral interface.
- [ ] Structured AdapterPlan generation using synthesis evidence only.
- [ ] Positive synthesized migration and send-vs-draft rejection demo.
- [ ] Document usable vertical slice as MVP, benchmark in progress.

## Stateful composition

- [ ] Bounded ComposeCalls, intermediate references and static graph checks.
- [ ] Resettable SQLite refund fixture and V3 state/side-effect oracles.
- [ ] Idempotency/retry and duplicate-effect handling.
- [ ] Delete-vs-deactivate or equivalent second semantic rejection.
- [ ] Stable old MCP client completes a composed workflow.

## Benchmark and release

- [ ] Freeze 15 executable cases with hashes and at least 20% held out.
- [ ] Implement B0/B1/B2/B2-V/B3 with matched synthesis information.
- [ ] Sandbox B2 with no external network, secrets or host access.
- [ ] Tiny-quota resume tests and full development-model regression.
- [ ] Three independent final-model trials per stochastic case across quota days.
- [ ] Count-first recovery/hidden false-compatibility/rejection/model-use reports.
- [ ] Limitations, reproducible demo and fresh literature/direct-competitor audit.

No UI, hosted service, new protocols or expanded DSL should displace these gates.
