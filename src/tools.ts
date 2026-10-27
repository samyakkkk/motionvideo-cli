import { tool, z } from "@flow-engineer/flow";
import {
  browseDirectory, catalogStats, directoryCategories, DIRECTORY_MAX_LIMIT,
  DIRECTORY_SECTIONS, findVideo, listCategories, MOTION_CATEGORIES,
  SEARCH_MAX_LIMIT, searchVideos, toDetail,
} from "./catalog.ts";

const hints = { readOnly: true, destructive: false, idempotent: true, openWorld: false };
const summary = z.object({
  slug: z.string(), title: z.string(), handle: z.string(), avatar: z.string(),
  date: z.string(), description: z.string().optional(), contentTags: z.array(z.string()),
  tags: z.array(z.string()), poster: z.string(), preview: z.string(), video: z.string(),
  width: z.number().int(), height: z.number().int(), promptShared: z.boolean(),
  model: z.string().optional(), effort: z.string().optional(), iterations: z.string().optional(),
  pageUrl: z.string(),
});
const detail = summary.extend({
  prompt: z.string().optional(), skillUrl: z.string().optional(), tweetUrl: z.string().optional(),
  stack: z.string().optional(), category: z.enum(MOTION_CATEGORIES).optional(), categoryUrl: z.string().optional(),
  neighbours: z.object({ previous: z.string().optional(), next: z.string().optional() }),
});
const category = z.object({ id: z.enum(MOTION_CATEGORIES), label: z.string(), description: z.string(), count: z.number().int(), url: z.string() });
const slugInput = z.string().min(1).describe("Video slug from search results");

export const search = tool({
  name: "search-videos", title: "Search motion videos",
  description: "Search public motion references by keywords, category and shared prompt or skill; returns slugs, credits and media URLs.",
  input: z.object({
    query: z.string().optional().describe("Every word matches the title, creator handle, prompt or content tags"),
    category: z.enum(MOTION_CATEGORIES).optional(), type: z.enum(["prompt", "skill"]).optional(),
    sort: z.enum(["newest", "oldest"]).optional(),
    limit: z.number().int().min(1).max(SEARCH_MAX_LIMIT).optional().describe("Maximum results; default 12, at most 30"),
  }),
  output: z.object({ total: z.number().int(), shown: z.number().int(), videos: z.array(summary) }),
  signIn: "none", hints,
  format: ({ total, shown, videos }) => [
    `Found ${total} motion videos. Showing ${shown}.`,
    ...videos.map(v => `- ${v.title} by @${v.handle} (${v.slug})${v.model ? ` · ${v.model}` : ""}\n  ${v.pageUrl}`),
    total > shown ? "Raise --limit (max 30) or narrow the filters for more precision." : "",
  ].filter(Boolean).join("\n"),
  run: async input => { const result = await searchVideos(input); return { ...result, shown: result.videos.length }; },
});

export const get = tool({
  name: "get-video", title: "Get a motion video",
  description: "Read a video's original prompt, creator-reported production metadata, media URLs and neighbouring slugs.",
  input: z.object({ slug: slugInput }), output: detail, signIn: "none", hints,
  format: v => [
    `${v.title} by @${v.handle}\n${v.pageUrl}\nSlug: ${v.slug}`,
    [v.model, v.stack, v.effort, v.iterations].filter(Boolean).join(" · "),
    `Video: ${v.video}\nPreview: ${v.preview}\nPoster: ${v.poster}`,
    v.prompt ? `Original prompt:\n${v.prompt}` : "The creator did not share a prompt.",
    v.skillUrl ? `Skill: ${v.skillUrl}` : "", v.tweetUrl ? `Original post: ${v.tweetUrl}` : "",
    `Neighbours: previous=${v.neighbours.previous ?? "none"}, next=${v.neighbours.next ?? "none"}`,
  ].filter(Boolean).join("\n\n"),
  run: async ({ slug }) => {
    const video = await findVideo(slug);
    if (!video) throw new Error(`No catalog video with slug "${slug}". Use search-videos to find one.`);
    return toDetail(video);
  },
});

export const categories = tool({
  name: "list-categories", title: "List catalog categories",
  description: "List video content categories with descriptions, counts and category-page URLs.",
  input: z.object({}), output: z.object({ categories: z.array(category) }), signIn: "none", hints,
  format: ({ categories }) => categories.map(c => `- ${c.id}: ${c.label} (${c.count})\n  ${c.description}\n  ${c.url}`).join("\n"),
  run: async () => ({ categories: await listCategories() }),
});

export const directory = tool({
  name: "browse-directory", title: "Browse tools and studios",
  description: "Search MotionVideo's public tools and studios directories by keyword and exact category.",
  input: z.object({
    section: z.enum(DIRECTORY_SECTIONS).optional().describe("Directory section; defaults to tools"),
    query: z.string().optional().describe("Every word matches the name, description or category"),
    category: z.string().optional().describe("Exact category, case insensitive"),
    limit: z.number().int().min(1).max(DIRECTORY_MAX_LIMIT).optional().describe("Maximum results; default 24, at most 120"),
  }),
  output: z.object({
    section: z.enum(DIRECTORY_SECTIONS), categories: z.array(z.string()), total: z.number().int(), shown: z.number().int(),
    entries: z.array(z.object({ id: z.string(), name: z.string(), description: z.string(), category: z.string(), url: z.string(), cover: z.string() })),
  }),
  signIn: "none", hints,
  format: ({ section, total, shown, entries, categories }) => [
    `${total} ${section}. Showing ${shown}.`, `Categories: ${categories.join(", ")}`,
    ...entries.map(e => `- ${e.name} [${e.category}] (${e.id})\n  ${e.description}\n  ${e.url}`),
    total > shown ? "Raise --limit (max 120) or narrow the filters for more precision." : "",
  ].filter(Boolean).join("\n"),
  run: async input => {
    const section = input.section ?? "tools";
    const result = await browseDirectory({ ...input, section });
    return { ...result, section, shown: result.entries.length, categories: await directoryCategories(section) };
  },
});

export const overview = tool({
  name: "catalog-overview", title: "Catalog overview",
  description: "Get the catalog overview resource as a command: video and public-prompt counts, categories and directory sections.",
  input: z.object({}),
  output: z.object({
    site: z.string(), importedAt: z.string().optional(), totalVideos: z.number().int(), videosWithPrompt: z.number().int(),
    categories: z.array(category), directories: z.array(z.object({ section: z.enum(DIRECTORY_SECTIONS), label: z.string(), total: z.number().int(), categories: z.array(z.string()) })),
  }),
  signIn: "none", hints,
  format: o => [`${o.totalVideos} videos · ${o.videosWithPrompt} with public prompts`, o.site,
    ...o.directories.map(d => `${d.label}: ${d.total}`), ...o.categories.map(c => `${c.label}: ${c.count}`)].join("\n"),
  run: async () => catalogStats(),
});

export const remix = tool({
  name: "remix-video", title: "Prepare a remix brief",
  description: "Prepare a credited remix brief from a catalog video and optional new direction. Returns a brief, not a rendered video.",
  input: z.object({ slug: slugInput, direction: z.string().optional().describe("Brand, subject, palette, duration or platform changes") }),
  output: z.object({ slug: z.string(), pageUrl: z.string(), promptShared: z.boolean(), brief: z.string() }),
  signIn: "none", hints, format: r => r.brief,
  run: async ({ slug, direction }) => {
    const video = await findVideo(slug);
    if (!video) throw new Error(`No catalog video with slug "${slug}". Use search-videos to find one first.`);
    const v = await toDetail(video);
    const madeWith = [v.model && `model ${v.model}`, v.effort && `effort ${v.effort}`, v.iterations, v.stack && `stack ${v.stack}`].filter(Boolean).join(", ");
    const brief = [
      `You are adapting a motion video from the MotionVideo catalog: "${v.title}" by @${v.handle}.`,
      `Reference page: ${v.pageUrl}${v.tweetUrl ? ` (original post: ${v.tweetUrl})` : ""}`,
      madeWith ? `How it was made, per the creator: ${madeWith}.` : "",
      v.prompt ? `Original prompt behind it:\n"""\n${v.prompt}\n"""` : "The creator did not share the prompt; use the linked video as a visual reference only.",
      direction ? `New direction from the user: ${direction}.` : "The user has not specified a direction yet. Ask for the brand, copy, palette, duration, and aspect ratio before building.",
      "Deliverable: keep the choreography, timing structure, and constraints that make the original work, swap in the user's content, then build the video in the user's stack. When you share the result, credit the source page above.",
    ].filter(Boolean).join("\n\n");
    return { slug, pageUrl: v.pageUrl, promptShared: Boolean(v.prompt), brief };
  },
});

export const tools = [search, get, categories, directory, overview, remix];
