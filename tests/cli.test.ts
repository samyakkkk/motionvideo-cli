import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const base = { handle: "fixture-creator", avatar: "", poster: "https://example.org/poster.jpg", preview: "https://example.org/preview.mp4", video: "https://example.org/video.mp4", width: 1920, height: 1080 };
const videos = [
  { ...base, slug: "old-chart", title: "Old chart", date: "2026-01-01", contentTags: ["charts"], tags: ["prompt"], promptShared: true, prompt: "Animate a blue chart.", model: "Fixture model" },
  { ...base, slug: "new-chart", title: "New chart", date: "2026-02-01", contentTags: ["charts"], tags: ["skill"], promptShared: false, skillUrl: "https://example.org/skill" },
  { ...base, slug: "phone-demo", title: "Phone demo", date: "2026-03-01", contentTags: ["phone"], tags: ["prompt"], promptShared: true, prompt: "Show a phone." },
];
const entry = (id: string, category: string) => ({ id, name: id, description: "Motion reference", category, url: `https://example.org/${id}`, cover: "" });
const fixture = createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  if (req.url?.startsWith("/offline/")) { res.writeHead(503); res.end('{"error":"unavailable"}'); return; }
  if (req.url === "/api/catalog") res.end(JSON.stringify({ videos }));
  else if (req.url === "/api/catalog/directories") res.end(JSON.stringify({ tools: { entries: [entry("Editor", "Editor"), entry("AI", "AI")] }, studios: { entries: [entry("Studio", "Studio")] } }));
  else { res.writeHead(404); res.end("{}"); }
});
let site: string;
before(async () => {
  await new Promise<void>(resolve => fixture.listen(0, "127.0.0.1", resolve));
  const address = fixture.address();
  assert.ok(address && typeof address !== "string");
  site = `http://127.0.0.1:${address.port}`;
});
after(async () => { fixture.closeAllConnections(); await new Promise<void>(resolve => fixture.close(() => resolve())); });

async function run(args: string[], siteUrl = site) {
  const env = { ...process.env, MOTIONVIDEO_SITE_URL: siteUrl };
  delete env.MOTIONVIDEO_SERVER;
  delete env.MOTIONVIDEO_TOKEN;
  delete env.FLOW_FRAMEWORK_TRACES_KEY;
  return await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], { env, timeout: 20_000 });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout, stderr }));
  });
}
async function json(args: string[]) {
  const result = await run([...args, "--json"]);
  assert.equal(result.code, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("search preserves all-word filters, ordering, limits and complete counts", async () => {
  const result = await json(["search", "chart", "-n", "1"]);
  assert.equal(result.total, 2);
  assert.equal(result.shown, 1);
  assert.equal(result.videos[0].slug, "new-chart");
  const filtered = await json(["search", "blue chart", "--category", "charts", "--type", "prompt", "--sort", "oldest"]);
  assert.deepEqual(filtered.videos.map((v: { slug: string }) => v.slug), ["old-chart"]);
  const empty = await json(["search", "no-such-reference"]);
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.videos, []);
});
test("get retains original prompts, media, credits and neighbours", async () => {
  const result = await json(["get", "old-chart"]);
  assert.equal(result.prompt, "Animate a blue chart.");
  assert.equal(result.handle, "fixture-creator");
  assert.equal(result.video, base.video);
  assert.equal(result.neighbours.previous, "new-chart");
  assert.equal(result.pageUrl, `${site}/videos/old-chart`);
});
test("categories, overview and both directories match catalog data", async () => {
  const categories = await json(["categories"]);
  assert.equal(categories.categories.find((c: { id: string }) => c.id === "charts").count, 2);
  const overview = await json(["overview"]);
  assert.equal(overview.totalVideos, 3);
  assert.equal(overview.videosWithPrompt, 2);
  const tools = await json(["directory", "--category", "editor"]);
  assert.equal(tools.total, 1);
  assert.equal(tools.entries[0].id, "Editor");
  const studios = await json(["directory", "--section", "studios"]);
  assert.equal(studios.section, "studios");
  assert.equal(studios.entries[0].id, "Studio");
});
test("remix is a credited brief and never invents an unavailable prompt", async () => {
  const shared = await json(["remix", "old-chart", "--direction", "Brand teal, 15 seconds"]);
  assert.match(shared.brief, /Animate a blue chart/);
  assert.match(shared.brief, /Brand teal, 15 seconds/);
  assert.match(shared.brief, /fixture-creator/);
  assert.match(shared.brief, /credit the source page/);
  const missing = await json(["remix", "new-chart"]);
  assert.equal(missing.promptShared, false);
  assert.match(missing.brief, /did not share the prompt/);
  assert.match(missing.brief, /Ask for the brand/);
});
test("invalid inputs, missing slugs and upstream outages have nonzero exits", async () => {
  assert.equal((await run(["search", "--limit", "31"])).code, 2);
  const missing = await run(["get", "unknown"]);
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /No catalog video/);
  const offline = await run(["overview"], `${site}/offline`);
  assert.equal(offline.code, 1);
  assert.match(offline.stderr, /temporarily unavailable/);
});
test("human output and help work without accounts, keys or a running daemon", async () => {
  const result = await run(["search", "chart", "-n", "1"]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Showing 1/);
  assert.match(result.stdout, /new-chart/);
  const help = await run(["--help"]);
  assert.equal(help.code, 0);
  for (const name of ["search", "get", "categories", "directory", "overview", "remix"]) assert.ok(help.stdout.includes(name));
});
