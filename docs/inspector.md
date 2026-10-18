# Read-only ContractRelay inspector

The [public inspector](https://contract-relay.vercel.app/)
shows the same artifacts without installation. [Hosting notes](hosting.md) record
the deployment identity, compatibility adapter and reproduction steps.

Historical results are discovered through `data/historical-catalog.json`; each
root retains its own unchanged summary and trials. v2 adds Mapbox and Microsoft
Fabric. Generation failures display INCONCLUSIVE with verification NOT RUN, empty
gate checks and the retained error code. They are never relabeled as safe rejection.
The inspector has sixteen API/component tests and fourteen desktop/mobile browser checks.

The portfolio interface lives in `apps/inspector/`, outside the frozen workspace
packages. It uses Next.js, React, strict TypeScript, Node.js, GraphQL and ordinary
CSS. Server Components handle data and rendering; client components handle
navigation highlighting, migration search and clipboard interaction. No global
state library or database is needed.

## Run

From the repository root:

```sh
pnpm ui:install
pnpm dev
```

Visit http://127.0.0.1:3000. The independent equivalent is:

```sh
cd apps/inspector
npm ci
npm run dev
```

Node.js 22.12+ works with the interface; Node 22.23.3 is used in UI CI and is
recommended for current development-tool engine requirements. No `.env`, Gemini
key, Docker, or original ignored run directory is required. Fonts ship locally;
page rendering needs no external service. There are no automatic model calls,
execution mutations, authentication, billing or cloud deployment steps.

## Architecture and routes

```text
Next.js Server Components / small React client components
                         ↓
Generated typed GraphQL documents / read-only schema
                         ↓
Node ArtifactService (validated, catalog-selected public artifact bundle)
                         ↓
Existing versioned ContractRelay results + completed presentation exports
```

Server Components invoke GraphQL in process, avoiding an HTTP loopback during
SSR. `POST /api/graphql` exposes the same schema for external inspection. Both
paths use the same resolvers and artifact service. GraphQL JSON output is
validated; null-prototype execution results are normalized before crossing
React's server/client boundary.

## Vercel deployment

Use the Next.js preset, Root Directory `apps/inspector`, install command `npm ci`,
and build command `npm run build`. Enable **Include source files outside of the
Root Directory in the Build Step** so the build can read the versioned evidence.
No Gemini key or other environment variable is needed.

The `prebuild` and `predev` hooks package an explicit allowlist of public evidence
into the ignored `.generated/artifacts.json`. The app reads this bundle from its
own directory, without assuming the repository exists two directories above the
serverless function. Next.js tracing explicitly includes the bundle and GraphQL
schema. `postbuild` checks the deployment traces for every data route and fails
the build if either asset is missing. The original versioned files are never
rewritten. The Sites hosting mirror uses the same allowlist.

After deployment, check `/`, `/real-world`, `/benchmarks`, and a migration detail.
An HTTP 200 alone is insufficient: streamed page failures and GraphQL errors can
still use that status. The browser suite checks rendered content and API data.

- `/`: overview, compatibility path, outcomes and evidence boundary.
- `/migrations`: redirects to the stateful refund example.
- `/migrations/[id]`: URL-addressable contracts, plan, gate and observations.
  Historical trials use `?trial=1`, `2`, or `3`; controlled exports select trial 1.
- `/real-world`: all public migrations in the historical summary, full old/new
  SHAs, direct failures, trial counts, outcomes and limitations.
- `/benchmarks`: frozen final aggregates, separately labeled and parsed from
  the published snapshot; no scoring is duplicated here.
- `/methodology`: synthesis/gate/sealed evidence boundary.
- `/api/graphql`: POST-only read queries. No mutation or model capability.

The [full schema](../apps/inspector/src/graphql/schema.graphql) defines:

```graphql
type Query {
  migrations: [MigrationSummary!]!
  migration(id: ID!, trial: Int = 1): Migration
  benchmarkSummary: BenchmarkSummary!
  realWorldResults: [RealWorldResult!]!
}
```

`Migration` includes actual old/new contracts, adapter JSON/hash, status,
verification checks, execution observations, model/prompt metadata, trial
selection and provenance. Verification levels and statuses are typed enums.
The JSON scalar carries irregular persisted contract/plan/trace structures.
GraphQL Code Generator generates operation types and TypedDocumentNodes from
the schema and query documents. `npm run codegen` requires no running server.

Example read:

```sh
curl http://127.0.0.1:3000/api/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ migration(id: \"sqlew\") { status verification { verdict checks { level passed detail } } } }"}'
```

## Source of displayed evidence

Controlled aggregates come directly from `benchmarks/results/final-v3.json`.
Contracts and task inputs come from the frozen case partitions. Trial-1 B3
candidate, gate, result and observation files were copied byte-for-byte from
the completed local run into `apps/inspector/data/controlled/` so clones work
without ignored run files. `data/exports.json` records each original path and
SHA-256; reads check the export digest. All 15 cases are included, with no
success-based selection. No frozen benchmark artifacts were edited or rerun.

Historical artifacts are loaded directly from `benchmarks/realworld-v1/`.
Its summary discovers the historical catalog; each of the three recorded trials
can be inspected. sqlew is visibly rejected at V0, with its unsupported native
union schema preserved. No promoted trace is shown for rejected adapters.
A false-compatible denominator of 0/0 means no promotion, not recovered behavior.

Recorded benchmark observations contain output/state but not individual backend
call telemetry or timing. The declared path is therefore explicitly labeled as
coming from the saved plan. A separate `data/refund-execution.json` capture
records actual backend calls through the existing verifier, promotion registry,
MCP proxy and SQLite fixture using the same B3 trial-1 plan. It records two old
invocations, six backend calls and one ledger entry; it is labeled as a local
demo, never a frozen measurement. No per-step timings were invented.

`scripts/capture-refund.mjs` documents how that capture was made. It is a
maintainer-only, exclusive-write script run manually from the repository root
with `node --experimental-sqlite --import=tsx`; neither installation nor the
web application imports or runs it. The UI service imports no core interpreter,
verifier, promotion, scoring or model-calling implementation.

Missing, invalid, or digest-mismatched artifacts produce explicit API errors
(`ARTIFACT_MISSING`, `ARTIFACT_CORRUPT`) and an unavailable-state UI. Unknown
IDs/trials return null in GraphQL and a missing-state page. Next.js may already
have streamed HTTP 200 before a late `notFound()`; its missing page carries the
`noindex` directive. No successful result is substituted as fallback data.

## Validation

```sh
pnpm ui:check
pnpm ui:build
cd apps/inspector
npx playwright install chromium
npm run test:e2e
```

The 12 focused API/component tests cover the complete catalog and detail loading,
trial and missing-ID lookup, persisted benchmark parsing, historical results and
denominators, rejected reports in all three trials, separate local trace display,
missing/corrupt artifacts, export integrity and request/mutation handling.
Eight browser checks exercise navigation, refund operations, benchmark counts,
sqlew rejection/trials, missing states, search and viewport overflow on desktop
and mobile. Strict TypeScript, lint and production build are separate gates.

`data/protected-before.json` preserves raw Windows hashes for 317 original core,
fixture and benchmark files. `data/protected-portable.json` preserves the same
catalog with UTF-8/LF hashes for cross-platform CI. The audit also checks the
original 221-file flagship guard. The before/after raw aggregate remains:

```text
25aab4e3d73a68b58dee605aa827f9f5d4abbbafa83e38ee302e6789e3061ec9
```

The normalized aggregate remains:

```text
5c6e959f581383fbc1b4ee2aab59bdd3d150ab84461e83affd1c240d38f1eb9a
```

The local benchmark execution fingerprint remains:

```text
ad4a35c05d8c2aba38e303fec9bdf12ee0e7c20c00bf0d278c43787e2546c299
```

After the README editorial pass, the audit projects three explicitly recorded
documentation changes onto those original baselines: moving the byte-identical
PRD to `docs/prd.md`, restoring an apostrophe in the historical report, and updating
only the PRD location in the original guard catalog. The original baseline files
were not reset. [The scoped receipt](editorial-changes.json) records before/after
hashes; the audit checks the corrected files and reports their current aggregate
separately. Every scientific artifact remains unchanged. The historical extension
source fingerprint changes because its catalog path changed; saved trial identities
retain the original fingerprint and are not rewritten or regenerated.

Original suite/protocol hashes and all 195 final records remain identical.
Core source, frozen prompts, gates, scoring, heuristics, model/quota configuration
and root `pnpm-lock.yaml` were not changed. Root integration adds four UI scripts
and excludes the isolated app from the root linter; the app has its own lint,
typecheck, dependency lock and CI gates. Existing 146 tests remain unchanged.
