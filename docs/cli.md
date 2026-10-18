# Product CLI

The snapshot-first CLI wraps the existing MCP ingestion, isolated synthesis,
isolated verifier, promotion registry and compatibility proxy. It does not add an
interpreter, generate executable code, or rerun benchmarks.

Install from the repository root with Node.js 22.12+:

```sh
pnpm install --frozen-lockfile
pnpm contractrelay --help
```

`node bin/contractrelay.mjs` is equivalent to `pnpm contractrelay`. The package
declares a `contractrelay` binary; `pnpm link --global` can expose the bare command
if pnpm's global bin directory is configured. No package publishing is required.

## API-free example

The checked-in example contains a hand-authored development plan and saved
`tools/list` snapshots for the existing weather fixture. It is not a model result
or a benchmark trial. Run these commands from the repository root:

```sh
pnpm contractrelay verify --plan examples/cli/weather/adapter.json
pnpm --silent contractrelay serve --plan examples/cli/weather/adapter.json
```

Verification prints the actual V0-V2 checks and `PASS` or `REJECT`. On PASS, the
existing registry independently repeats verification before recording promotion.
Serving advertises `get_weather(city)` and forwards through the verified plan to
the existing `fetch_forecast(location, units)` fixture. Neither command loads an
API key or calls a model. Stop the stdio server with Ctrl+C.

For an MCP client, use the launcher directly so package-manager banners cannot
enter the protocol stream:

```json
{
  "command": "node",
  "args": [
    "/absolute/path/ContractRelay/bin/contractrelay.mjs",
    "serve", "--plan",
    "/absolute/path/ContractRelay/examples/cli/weather/adapter.json"
  ]
}
```

An unchanged call `get_weather({"city":"Ann Arbor"})` returns
`{"temperature":64,"conditions":"Clear"}`. Server diagnostics go to stderr;
stdout contains only MCP messages.

## Generate a new plan

Only `migrate` may call Gemini. Set `GEMINI_API_KEY` in the local environment or
the ignored repository `.env`, then run:

```sh
pnpm contractrelay migrate --old examples/cli/weather/old-tools.json --new examples/cli/weather/new-tools.json --out .contractrelay/weather-adapter.json
pnpm contractrelay verify --plan .contractrelay/weather-adapter.json
pnpm --silent contractrelay serve --plan .contractrelay/weather-adapter.json
```

The first command uses the existing provider, model/quota configuration,
checkpointing scheduler and isolated synthesizer, with one concurrent job.
Retained synthesis requests live beside the output in `.json.synthesis/`, away
from benchmark runs. No model-backed command was run to add or test this CLI.

For your own snapshots:

```sh
contractrelay migrate --old old-tools.json --new new-tools.json --out adapter.json
contractrelay verify --plan adapter.json
contractrelay serve --plan adapter.json
```

Use the body of MCP `tools/list` responses: `{"tools":[...]}`. Supply every page
as one complete tool list; a snapshot with an unresolved pagination cursor is
rejected by the existing ingestion code. Choose `--tool NAME` if several old
tools are present. New tools can support a bounded composed plan.

## Evidence and target configuration

Snapshots establish shape, not behavior. `migrate` reads operator settings from
`old-tools.json.evidence.json`, or the explicit `--evidence FILE` option. The
[working example](../examples/cli/weather/old-tools.json.evidence.json) contains:

- `version: 1`, `dataClass`, and an optional `sourceTool` selection.
- `oldMetadata` and `newMetadata`: effect/idempotency classifications by tool
  name. Server annotations remain untrusted hints; unknown effects fail closed.
- `documents`: synthesis-only `{id, text}` entries describing the migration.
- `gate`: existing gate-format traces, independent predicates, evidence references
  and supported constants. No expected outputs are inferred from new-server
  responses. An omitted trace `contractHash` is bound to the imported old contract;
  an explicitly supplied conflicting hash is refused.
- `target`: an operator-supplied executable, argument array and working directory
  for the new MCP stdio server. Relative `cwd` resolves from the evidence file and
  is saved relative to the output plan. No shell is used. The target inherits the
  MCP SDK's default safe environment, without the Gemini key.

The synthesizer receives only normalized contracts and synthesis documents. Gate
checks and target-launch settings are excluded from its input. Without an evidence
file, valid snapshots produce an explicit bounded `Reject` artifact and no model
call; a malformed input or missing key is an operation error, not a semantic verdict.

The first product CLI supports **read-only targets**. Stateful verification still
requires an independently resettable fixture and explicit state/effect evidence;
it is not approximated with response checks. The existing controlled write demo
remains available through `pnpm cli serve --fixture refund` and `pnpm demo:refund`.
Migrate reads saved snapshots. Verify and serve recheck the configured target's
`tools/list` through existing code; there is no new discovery command.

## Saved artifacts and refusal behavior

Keep these companions together:

```text
adapter.json                 bounded AdapterPlan or explicit Reject
adapter.json.context.json    normalized contracts, gate and target configuration
adapter.json.verified.json   successful verification receipt and promotion key
adapter.json.registry/       existing registry's immutable promotion artifacts
adapter.json.synthesis/      retained model attempts, when synthesis was used
```

Serving requires a verified receipt bound to the exact plan and context. The
existing runtime checks promotion artifacts and current contracts before invoking
the target. Changed plans, changed target configuration, revoked promotions and
contract drift are refused. A subsequent explicit behavioral rejection revokes a
previous CLI promotion through the existing registry. Use a fresh output path to
retry a revoked plan. Existing migration outputs are never overwritten.

Exit codes are `0` for success, `2` for a rejection, and `1` for an input or
operation error. Failed checks and residual risks are printed as reasons. This
CLI does not add sealed benchmark evaluation evidence to the promotion gate.
