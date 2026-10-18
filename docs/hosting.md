# Public inspector hosting

Live: https://contractrelay-inspector.fondsky12.chatgpt.site

The public demo uses the same inspector pages, GraphQL schema, resolvers and
artifact validation as the local Next.js application. A Sites/Vinext deployment
copy replaces filesystem reads with 113 allowlisted public artifact files. It
contains no credentials, ignored runs, model calls or MCP tool execution.

`apps/inspector/scripts/prepare-hosting.mjs` prepares that copy under the ignored
`.contractrelay/inspector-site/` directory. Local UI sources remain unchanged.
The deployment uses native anchor navigation because the current Vinext Worker
implementation fails during `next/link` prefetch. Search and other React
interactions still run; the existing six browser checks pass on the Worker build.

## Deployment identity

- Site project: `appgprj_6ad43f7d52388191ac4d526456b2566d`
- Hosting source commit: `aa24763f7a062c8813d2b50b46b645139e74fc74`
- Saved version: `appgprj_6ad43f7d52388191ac4d526456b2566d~appgver_83bd8513a01c8191b816d541633794cf`
- Archive SHA-256: `a2f4600a03b249cfc2fc5c925454c036e5fc8743b3cc0525fb15033633e1caad`

The hosting source has its own repository and dependency lock. The core workspace
and local inspector dependency locks were not changed. The hosting copy uses the
Sites starter's Worker build integration, Vinext 1.0.0-beta.5 and Node 22.23.3.

## Maintenance

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
