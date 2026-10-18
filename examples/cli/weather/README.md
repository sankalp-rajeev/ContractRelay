# API-free weather CLI example

These snapshots, documents and independent gate checks wrap the existing
controlled weather fixture. `adapter.json` is the existing hand-authored plan,
copied unchanged; it has not been claimed as model-generated or as a benchmark
result. No verified receipt is checked in: run the gate yourself.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm contractrelay verify --plan examples/cli/weather/adapter.json
pnpm --silent contractrelay serve --plan examples/cli/weather/adapter.json
```

See [the product CLI guide](../../../docs/cli.md) for generation and configuration.
