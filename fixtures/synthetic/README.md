# Controlled development fixtures

`weather/` contains hand-authored old/new contracts, migration evidence and a
candidate plan for API-free interpreter development. It is not a sealed or
frozen benchmark case. Run `pnpm demo` or `pnpm test:smoke`.

Add resettable stateful fixtures only with independent observable state and
side-effect oracles. Keep future benchmark evidence partitions separate.
