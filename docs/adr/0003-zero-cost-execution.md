# ADR 0003: No paid fallback; persist and resume at quota limits

Status: accepted; configuration, provider and persistent scheduler implemented.

v1 requires $0 external spend. Use local fixtures/infrastructure and only
account-approved free model capacity. Model IDs and quotas are configuration,
not assumptions embedded in core logic. The committed model snapshot comes from
the PRD and must be checked before use.

All model calls use one scheduler with per-model request/token
budgets, bounded retries, Pacific daily resets and atomic persisted run state.
Stop with `quota_blocked` when free capacity is exhausted. Resume incomplete
trials without regenerating completed final trials. Disable response caching for
independent final stochastic trials. Never create projects/keys to evade quotas.

The scheduler reserves requests durably before calls, retains each attempt,
serializes execution, disables SDK retries and recovers persisted responses after
interruption. Completed final trials require `--resume` and are integrity-checked.
Model transport and tiny-quota behavior are tested locally; live acceptance is
passed with a configured free-tier development key on 2026-10-17.

Deterministic install/check/test/demo paths require no API credentials. Secret
values stay in the environment and must not appear in repository or run logs.

Official sources checked 2026-10-17: [structured output](https://ai.google.dev/gemini-api/docs/structured-output),
[rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) and
[pricing](https://ai.google.dev/gemini-api/docs/pricing). Project quotas remain
account-specific; the scheduler uses configured values rather than scraping them.
