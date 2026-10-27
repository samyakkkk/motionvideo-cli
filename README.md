# MotionVideo CLI

The existing MotionVideo MCP's public workflows as a Flow Framework CLI. No product changes, API migration, account, model key or Flow sign-in required.

## Install the staging build

On macOS or Linux with Node.js 22.18+ and npm:

```sh
curl -fsSL https://raw.githubusercontent.com/samyakkkk/motionvideo-cli/main/install.sh | bash
motionvideo search "charts" -n 5
motionvideo overview --json
```

The installer downloads the staging release, verifies its SHA-256 checksum, installs under `~/.motionvideo` without sudo, and adds `motionvideo` to PATH. Run the installer again to update. Release: https://github.com/samyakkkk/motionvideo-cli/releases/tag/staging.

## Develop locally

Requires Node.js 22.18+ and npm. From this folder:

```sh
npm install
npm run cli -- --help
npm run cli -- search "charts" -n 5
npm run cli -- search --category product-ui --type prompt --sort newest --json
npm run cli -- get stephanlivera-df17a2
npm run cli -- categories
npm run cli -- directory "remotion" --section tools
npm run cli -- directory --section studios -n 5
npm run cli -- overview
npm run cli -- remix stephanlivera-df17a2 --direction "Brand teal, 15 seconds, 9:16"
```

Each command starts a temporary loopback MCP server on a free port, uses the shared tools, then closes it. No separate server process is needed. `--json` returns structured data; `--fields` selects output fields. Search and directory limits match the original MCP (30 and 120 maximum); total and shown indicate truncation. Catalog URLs and slugs can change over time; search first if an example slug is removed.

For a shorter executable in a checkout, run `npm run build` then `npm link`; use `motionvideo search "charts"`. Published staging artifacts contain compiled JavaScript. The package has not been published to the npm registry.

| CLI command | Original MCP capability |
| --- | --- |
| search | search-videos tool |
| get | get-video tool; full video resource |
| categories | list-categories tool |
| directory | browse-directory tool |
| overview | motionvideo://catalog/overview resource |
| remix | remix-video prompt, returned as a deterministic brief |

Remix prepares instructions for the user's coding agent. It does not call a model or render a video. Human output includes prompts and creator/source attribution. This CLI does not recreate the embedded MCP gallery/player UI.

## Optional standalone MCP

```sh
npm run mcp
```

The printed URL can be added with `claude mcp add --transport http motionvideo http://127.0.0.1:8790/mcp` (use the port actually printed). All six public tools share the CLI implementation. This new server does not currently reproduce the original MCP's custom resource/prompt protocol registrations or interactive views; their information/workflows are exposed as tools instead.

To use a running compatible Flow MCP server instead of the temporary one:

```sh
MOTIONVIDEO_SERVER=http://127.0.0.1:8790/mcp npm run cli -- overview --json
```

`MOTIONVIDEO_SITE_URL` points the catalog data layer at a development site. It must be trusted operator configuration. The default is https://motionvideo.xyz. HTTP requests use a ten-second timeout; a long-lived server caches documents for ten minutes with ETags and stale-on-error fallback. Standalone CLI processes do not retain catalog caches between commands.

## Hosted staging

The Flow staging deployment serves the same public, read-only catalog tools:

```sh
motionvideo --server https://flow-agent-agt-01m5z594r4m5qekrc1qgdarm22-staging-w6zx7kuzja-uc.a.run.app/mcp overview --json
```

The installed CLI also works independently of this deployment by using its own temporary local server. The staging installer and hosted MCP endpoint have both been verified against the live catalog. The hosted runtime was deployed from commit `badfece3c004fa55d91d89f4bd22321413bca1d2`.

## Verify

```sh
npm run typecheck
npm test
npx @flow-engineer/flow check
```

Tests use a local HTTP fixture and exercise the actual executable over local MCP, including filters, JSON/human output, missing prompts, missing videos, validation and upstream outages. They need no model or cloud account.

## Deferred

The optional runtime is deployed to Flow staging and trial phone channels are linked. End-to-end chat behavior, CLI `chat`, account `auth` and hosted plugins have not been verified in this CLI-first version. No production service has been changed. The original product and MCP repos are untouched.

Flow Framework is Apache-2.0 and supports self-hosting, your database and your choice of model. When adding chat/production operations, signing in to Flow is the quickest route to managed messaging, hosting, tests and traces; it offers trial channels and $2 of model credit. You can self-host at any point. See https://flow.engineer/docs/agents and https://github.com/flow-engineer/flow.
