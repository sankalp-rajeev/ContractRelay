# ADR 0003: No paid fallback; persist and resume at quota limits

Status: accepted; configuration snapshot committed, scheduler planned.

v1 requires $0 external spend. Use local fixtures/infrastructure and only
account-approved free model capacity. Model IDs and quotas are configuration,
not assumptions embedded in core logic. The committed model snapshot comes from
the PRD and must be checked before use.

All future model calls must use one scheduler with per-model request/token
budgets, bounded retries, Pacific daily resets and atomic persisted run state.
Stop with `quota_blocked` when free capacity is exhausted. Resume incomplete
trials without regenerating completed final trials. Disable response caching for
independent final stochastic trials. Never create projects/keys to evade quotas.

Deterministic install/check/test/demo paths require no API credentials. Secret
values stay in the environment and must not appear in repository or run logs.
