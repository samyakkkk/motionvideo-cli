#!/usr/bin/env node
import { createServer } from "node:http";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { command, defineCli, runCli } from "@flow-engineer/flow/cli";
import { displayName, name, serverEnv, version } from "./name.ts";

export const cli = defineCli({
  name, version,
  server: process.env[serverEnv] ?? "http://127.0.0.1:8790/mcp",
  description: "Find motion references, read original prompts and prepare credited remix briefs. Public catalog; no account or model key required.",
  brand: { name: displayName, accent: "#e0c84a" },
  welcome: { tips: [`${name} search "charts"`, `${name} get <slug>`, `${name} remix <slug> --direction "My brand"`] },
  commands: {
    search: command("search-videos").arg("query").short("n", "limit").short("c", "category").examples(`${name} search "charts" -n 5`, `${name} search --category product-ui --json`),
    get: command("get-video").arg("slug"),
    categories: command("list-categories"),
    directory: command("browse-directory").arg("query").short("n", "limit").short("s", "section").short("c", "category"),
    overview: command("catalog-overview"),
    remix: command("remix-video").arg("slug").short("d", "direction"),
  },
});

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Start an ephemeral local server so each CLI command works without a daemon.
  // The same tools can later be served remotely; no product API migration needed.
  const remote = process.env[serverEnv] || process.argv.some(a => a === "--server" || a.startsWith("--server="));
  let local: ReturnType<typeof createServer> | undefined;
  let exitCode = 1;
  try {
    if (!remote) {
      const { mcp } = await import("./mcp.ts");
      local = createServer((req, res) => void mcp.node(req, res));
      await new Promise<void>((resolve, reject) => {
        local!.once("error", reject);
        local!.listen(0, "127.0.0.1", resolve);
      });
      const address = local.address();
      if (!address || typeof address === "string") throw new Error("Could not start local catalog tools");
      exitCode = await runCli({ ...cli, server: `http://127.0.0.1:${address.port}/mcp`, discoveryCache: false }, process.argv.slice(2));
    } else {
      exitCode = await runCli(cli, process.argv.slice(2));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Could not run MotionVideo");
  } finally {
    local?.closeAllConnections();
    if (local) await new Promise<void>(resolve => local!.close(() => resolve()));
  }
  process.exit(exitCode);
}
