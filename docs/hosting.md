# Public inspector hosting

Live: https://contract-relay.vercel.app/

## Current deployment: Vercel

The public inspector runs the Next.js application in `apps/inspector/` on Vercel,
connected to the GitHub repository's `main` branch. The repository About website,
README and demo walkthrough all point to the URL above.

Use the Next.js preset, Root Directory `apps/inspector`, `npm ci` for installation,
and `npm run build` for the build. Enable source files outside the Root Directory
in the build step. No environment variables or model credentials are needed.

The build packages 146 allowlisted public artifacts into `.generated/artifacts.json`.
Next.js includes this bundle and the GraphQL schema in every data route's function;
the postbuild check verifies their deployment traces. Runtime reads use the app
directory without assuming the original repository layout exists on Vercel.
See [inspector deployment instructions](inspector.md#vercel-deployment).

The deployed packaging fix passed all twelve desktop/mobile browser checks,
fourteen inspector tests and 169 core/CLI tests. Frozen evidence is unchanged.

## Previous deployment: Sites

The earlier public demo used the same inspector pages, GraphQL schema, resolvers
and artifact validation through a Sites/Vinext deployment copy. Its version 2
replaced filesystem reads with 127 allowlisted public artifact files. It
contains no credentials, ignored runs, model calls or MCP tool execution.

`apps/inspector/scripts/prepare-hosting.mjs` prepares that copy under the ignored
`.contractrelay/inspector-site/` directory. Local UI sources remain unchanged.
The deployment uses native anchor navigation because the current Vinext Worker
implementation fails during `next/link` prefetch. Search and other React
interactions still run; all eight browser checks pass on the Worker build.

### Archived version 2 deployment identity

- Site project: `appgprj_6ad43f7d52388191ac4d526456b2566d`
- Hosting source commit: `637554ad59dacf34fe715d3f7ddb35f48133fd2d`
- Saved version 2: `appgprj_6ad43f7d52388191ac4d526456b2566d~appgver_ceea313d75688191b5293cfd429fe455`
- Archive SHA-256: `547aed2eb5142538660f951810c3bd1d29dc5a0c2e70acdebcd26b650b2f621d`

Version 2 adds the v2 historical catalog and displays synthesis failures separately
from gate rejection. The original public version remains in Site history at source
commit `aa24763f7a062c8813d2b50b46b645139e74fc74` and saved version
`appgprj_6ad43f7d52388191ac4d526456b2566d~appgver_83bd8513a01c8191b816d541633794cf`.

The hosting source has its own repository and dependency lock. The core workspace
and local inspector dependency locks were not changed. The hosting copy uses the
Sites starter's Worker build integration, Vinext 1.0.0-beta.5 and Node 22.23.3.

### Archived Sites mirror maintenance

Reuse this Site project ID and its persisted `.openai/hosting.json` in the hosting
checkout. Do not register a replacement Site. With the Sites plugin, open that
source checkout using a fresh short-lived repository credential, then regenerate
the mirror from this repository:

```sh
node apps/inspector/scripts/prepare-hosting.mjs
```

Run the starter's typecheck and build, then the existing inspector browser checks
against its local Worker preview. Use the Sites source helper to push the exact
validated source and package its build output before saving and deploying a new
version. Credentials travel through hidden stdin and never belong in files.

On Windows, use Git Bash rather than WSL Bash for packaging, and set
`TAR_OPTIONS=--force-local` so GNU tar treats the drive-letter archive path as a
local file. The checkout may also need a process-local `safe.directory` exception
when Git runs under a different account from the sandbox that created it.

Future UI work should continue in `apps/inspector/`; the hosting directory is a
generated deployment copy, not a second product implementation.
