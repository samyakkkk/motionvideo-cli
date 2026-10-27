# MotionVideo CLI context

Scope: parity with the existing public MCP, not the website's account workflows.
Source: https://github.com/motionvideohq/motionvideo-mcp at b38b81712f03ce39b42ce046b1a61a9cae42ec8f.
Read: index.ts (tools, resources, remix prompt), src/catalog.ts (data and filtering), README.md.
The data layer in src/catalog.ts is copied from that MIT-licensed source; see THIRD_PARTY_NOTICES.md.

Production: https://motionvideo.xyz. Public GET /api/catalog and GET /api/catalog/directories were called successfully on 2026-10-27, without credentials. MOTIONVIDEO_SITE_URL overrides the origin for local development and tests.
There is no server-side pagination: documents are fetched whole and filtered locally. Search limit 1–30 (default 12), directory limit 1–120 (default 24). Cache TTL 10 minutes, ETag revalidation, stale-on-error retry after one minute, 10-second fetch timeout.
No mutations or idempotency keys are needed. CLI invocations start a temporary local MCP server and close it after the command; cached catalog data lasts only for that process. npm run mcp can keep a shared process/cache running.

The draft OpenAPI describes only the two existing public endpoints. Workflows, business, data and access files record the current integration boundaries.

## Questions for the team

- Confirm the draft response contract and public API rate limits before distributing at scale.
- No account-integration questions block this CLI; account tools are deliberately out of scope.
