// Data layer over the motionvideo.xyz catalog.
//
// motionvideo.xyz is the single source of truth: this module fetches
// `/api/catalog` (videos) and `/api/catalog/directories` (tools & studios)
// from the site at request time. Documents are cached per process, and a
// brief site outage keeps serving the last good copy. Keep the field names
// in sync with motionvideo.xyz/src/lib/motion-catalog.ts and
// motionvideo.xyz/src/routes/api/catalog/*.

/** Public site. Point at a local dev server with MOTIONVIDEO_SITE_URL. */
export const SITE_URL = (
  process.env.MOTIONVIDEO_SITE_URL ?? "https://motionvideo.xyz"
).replace(/\/+$/u, "");

const CATALOG_PATH = "/api/catalog";
const DIRECTORIES_PATH = "/api/catalog/directories";

/** A fetched document is served this long before it is refetched. */
const CACHE_TTL_MS = 10 * 60 * 1000;
/** After a failed refetch, serve the stale copy and retry this soon. */
const RETRY_MS = 60 * 1000;
/** Abandon a single fetch after this long. */
const FETCH_TIMEOUT_MS = 10 * 1000;

/** The site could not be reached and no copy has been fetched yet. */
export class CatalogUnavailableError extends Error {
  constructor(path: string, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(
      `The motionvideo.xyz catalog is temporarily unavailable (${SITE_URL}${path}: ${reason}). Retry in a moment.`
    );
    this.name = "CatalogUnavailableError";
  }
}

interface CacheEntry<T> {
  data: T;
  etag?: string;
  /** Epoch ms until which `data` is served without refetching. */
  serveUntil: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

/** Fetch and cache one JSON document, with ETag revalidation. */
const loadDocument = <T>(key: string, path: string): Promise<T> => {
  // SAFETY: every entry under `key` is written by this function, with the
  // same document type `T` for that key.
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry && Date.now() < entry.serveUntil) {
    return Promise.resolve(entry.data);
  }
  // SAFETY: as above; `inflight` holds the pending load for the same key.
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) {
    return running;
  }

  const pending = (async (): Promise<T> => {
    const headers = new Headers({
      accept: "application/json",
      "user-agent": "motionvideo-mcp",
    });
    if (entry?.etag) {
      headers.set("if-none-match", entry.etag);
    }
    try {
      const response = await fetch(`${SITE_URL}${path}`, {
        headers,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (response.status === 304 && entry) {
        entry.serveUntil = Date.now() + CACHE_TTL_MS;
        return entry.data;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      // SAFETY: the site's /api/catalog and /api/catalog/directories
      // endpoints serve exactly the document shapes named by `T`
      // (CatalogDocument / DirectoriesDocument), built from the same JSON
      // bundle the site renders from.
      const data = (await response.json()) as T;
      cache.set(key, {
        data,
        etag: response.headers.get("etag") ?? undefined,
        serveUntil: Date.now() + CACHE_TTL_MS,
      });
      return data;
    } catch (error) {
      if (entry) {
        // The site is briefly unreachable: keep the last good copy flowing.
        console.error(
          `[motionvideo] ${path} refetch failed; serving cached copy:`,
          error
        );
        entry.serveUntil = Date.now() + RETRY_MS;
        return entry.data;
      }
      throw new CatalogUnavailableError(path, error);
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, pending);
  return pending;
};

interface CatalogDocument {
  importedAt?: string;
  videos?: MotionVideo[];
}

interface DirectoriesDocument {
  tools?: { entries?: DirectoryEntry[] };
  studios?: { entries?: DirectoryEntry[] };
}

const loadCatalogDocument = (): Promise<CatalogDocument> =>
  loadDocument("catalog", CATALOG_PATH);

const loadDirectoriesDocument = (): Promise<DirectoriesDocument> =>
  loadDocument("directories", DIRECTORIES_PATH);

/** Every catalog entry, newest first as published on the site. */
export const loadVideos = async (): Promise<MotionVideo[]> => {
  const document = await loadCatalogDocument();
  return document.videos ?? [];
};

/** Reasoning effort the model ran at, as the creator reported it. */
export const EFFORTS = ["medium", "high", "max"] as const;

/** How many rounds of feedback the video took, as the creator reported it. */
export const ITERATIONS = ["one-shot", "few-rounds", "many-rounds"] as const;

export const MOTION_CATEGORIES = [
  "product-ui",
  "phone",
  "charts",
  "diagrams",
  "kinetic-type",
  "shapes",
  "particles",
  "characters",
  "photos",
  "music",
  "code",
] as const;

export type MotionCategory = (typeof MOTION_CATEGORIES)[number];

// Model-facing copy for each gallery category on the site.
export const CATEGORY_META: Record<
  MotionCategory,
  { label: string; description: string }
> = {
  characters: {
    description:
      "Characters: animated mascots, figures, and character-driven storytelling.",
    label: "Characters",
  },
  charts: {
    description:
      "Data visualization: animated charts, dashboards, and infographic motion.",
    label: "Charts",
  },
  code: {
    description:
      "Code and developer themes: terminal, coding, and software-style motion.",
    label: "Code",
  },
  diagrams: {
    description:
      "Diagrams and explainers: flowcharts, system maps, and process animations.",
    label: "Diagrams",
  },
  "kinetic-type": {
    description:
      "Kinetic typography: type-led videos, text animation, and lyric motion.",
    label: "Kinetic type",
  },
  music: {
    description:
      "Music and audio: audio-reactive visuals, lyric videos, and beat-synced edits.",
    label: "Music",
  },
  particles: {
    description:
      "Particles and simulations: physics-driven, generative, and reactive effects.",
    label: "Particles",
  },
  phone: {
    description:
      "Mobile motion: phone mockups, app flows, and screen-on-screen animations.",
    label: "Phone",
  },
  photos: {
    description: "Photo motion: animated photos, collages, and cutout videos.",
    label: "Photos",
  },
  "product-ui": {
    description:
      "Interface motion: buttons, loaders, music players, menus, toasts, and other product UI interactions.",
    label: "Product UI",
  },
  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- "shapes" is a published category id on motionvideo.xyz.
  shapes: {
    description:
      "Shapes and abstract forms: morphs, geometry, and graphic shape animation.",
    label: "Shapes",
  },
};

export interface MotionVideo {
  slug: string;
  title: string;
  date: string;
  tags: string[];
  contentTags: string[];
  promptShared: boolean;
  handle: string;
  avatar: string;
  poster: string;
  preview: string;
  video: string;
  width: number;
  height: number;
  prompt?: string;
  skillUrl?: string;
  tweetUrl?: string;
  description?: string;
  /** How it was made, as the creator reported it. */
  model?: string;
  stack?: string;
  effort?: string;
  iterations?: string;
}

export interface VideoSummary {
  slug: string;
  title: string;
  handle: string;
  avatar: string;
  date: string;
  description?: string;
  contentTags: string[];
  tags: string[];
  poster: string;
  preview: string;
  video: string;
  width: number;
  height: number;
  promptShared: boolean;
  model?: string;
  effort?: string;
  iterations?: string;
  /** Canonical page on motionvideo.xyz. */
  pageUrl: string;
}

export interface VideoDetail extends VideoSummary {
  prompt?: string;
  skillUrl?: string;
  tweetUrl?: string;
  stack?: string;
  /** Primary content category (also the site's category page segment). */
  category?: MotionCategory;
  categoryUrl?: string;
  neighbours: { previous?: string; next?: string };
}

export interface CategorySummary {
  id: MotionCategory;
  label: string;
  description: string;
  count: number;
  url: string;
}

export interface DirectoryEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  url: string;
  cover: string;
}

export const DIRECTORY_SECTIONS = ["tools", "studios"] as const;
export type DirectorySection = (typeof DIRECTORY_SECTIONS)[number];

const isMotionCategory = (value: string): value is MotionCategory =>
  // SAFETY: MOTION_CATEGORIES is a readonly tuple of strings, so the widened
  // array contains exactly those values and none others.
  (MOTION_CATEGORIES as readonly string[]).includes(value);

/** The first content tag is the canonical category page segment on the site. */
export const primaryCategory = (
  video: MotionVideo
): MotionCategory | undefined => video.contentTags.find(isMotionCategory);

export const videoPageUrl = (slug: string): string =>
  `${SITE_URL}/videos/${slug}`;

export const categoryPageUrl = (category: string): string =>
  `${SITE_URL}/category/${category}`;

export const creatorUrl = (handle: string): string => `https://x.com/${handle}`;

export const toSummary = (video: MotionVideo): VideoSummary => ({
  avatar: video.avatar ?? "",
  contentTags: video.contentTags ?? [],
  date: video.date,
  description: video.description,
  effort: video.effort,
  handle: video.handle,
  height: video.height ?? 0,
  iterations: video.iterations,
  model: video.model,
  pageUrl: videoPageUrl(video.slug),
  poster: video.poster,
  preview: video.preview,
  promptShared: Boolean(video.promptShared),
  slug: video.slug,
  tags: video.tags ?? [],
  title: video.title,
  video: video.video,
  width: video.width ?? 0,
});

export interface SearchInput {
  query?: string;
  category?: MotionCategory;
  type?: "prompt" | "skill";
  sort?: "newest" | "oldest";
  limit?: number;
}

export const SEARCH_MAX_LIMIT = 30;

/**
 * Mirrors the site's gallery filtering: every query word must appear in the
 * title, creator handle, prompt, or content tags.
 */
export const searchVideos = async ({
  query,
  category,
  type,
  sort = "newest",
  limit = 12,
}: SearchInput): Promise<{ total: number; videos: VideoSummary[] }> => {
  const videos = await loadVideos();
  const words = query?.trim().toLowerCase().split(/\s+/u).filter(Boolean) ?? [];

  const filtered = videos.filter((video) => {
    if (type && !(video.tags ?? []).includes(type)) {
      return false;
    }
    if (category && !(video.contentTags ?? []).includes(category)) {
      return false;
    }
    const text = [
      video.title,
      video.handle,
      video.prompt ?? "",
      ...(video.contentTags ?? []),
    ]
      .join(" ")
      .toLowerCase();
    return words.every((word) => text.includes(word));
  });

  filtered.sort(
    (a, b) => (sort === "newest" ? -1 : 1) * a.date.localeCompare(b.date)
  );

  const shown = Math.max(1, Math.min(limit, SEARCH_MAX_LIMIT));
  return {
    total: filtered.length,
    videos: filtered.slice(0, shown).map(toSummary),
  };
};

export const findVideo = async (
  slug: string
): Promise<MotionVideo | undefined> => {
  const videos = await loadVideos();
  return videos.find((video) => video.slug === slug);
};

const videoNeighbours = (videos: MotionVideo[], video: MotionVideo) => {
  const category = primaryCategory(video);
  const pool = category
    ? videos.filter((entry) => (entry.contentTags ?? []).includes(category))
    : videos;
  const ordered = pool.toSorted((a, b) => -1 * a.date.localeCompare(b.date));
  const index = ordered.findIndex((entry) => entry.slug === video.slug);
  return {
    next:
      index !== -1 && index < ordered.length - 1
        ? ordered[index + 1]?.slug
        : undefined,
    previous: index > 0 ? ordered[index - 1]?.slug : undefined,
  };
};

export const toDetail = async (video: MotionVideo): Promise<VideoDetail> => {
  const category = primaryCategory(video);
  return {
    ...toSummary(video),
    category,
    categoryUrl: category ? categoryPageUrl(category) : undefined,
    neighbours: videoNeighbours(await loadVideos(), video),
    prompt: video.prompt,
    skillUrl: video.skillUrl,
    stack: video.stack,
    tweetUrl: video.tweetUrl,
  };
};

const categorySummaries = (videos: MotionVideo[]): CategorySummary[] =>
  MOTION_CATEGORIES.map((id) => ({
    count: videos.filter((video) => (video.contentTags ?? []).includes(id))
      .length,
    description: CATEGORY_META[id].description,
    id,
    label: CATEGORY_META[id].label,
    url: categoryPageUrl(id),
  }));

export const listCategories = async (): Promise<CategorySummary[]> =>
  categorySummaries(await loadVideos());

const directoryEntries = (
  document: DirectoriesDocument,
  section: DirectorySection
): DirectoryEntry[] =>
  (document[section]?.entries ?? []).map((entry) => ({
    category: entry.category ?? "",
    cover: entry.cover ?? "",
    description: entry.description ?? "",
    id: entry.id,
    name: entry.name,
    url: entry.url,
  }));

const entryCategories = (entries: DirectoryEntry[]): string[] =>
  [...new Set(entries.map((entry) => entry.category))]
    .filter(Boolean)
    .toSorted((a, b) => a.localeCompare(b));

export const directoryCategories = async (
  section: DirectorySection
): Promise<string[]> =>
  entryCategories(directoryEntries(await loadDirectoriesDocument(), section));

export const DIRECTORY_MAX_LIMIT = 120;

export interface BrowseInput {
  section: DirectorySection;
  query?: string;
  category?: string;
  limit?: number;
}

export const browseDirectory = async ({
  section,
  query,
  category,
  limit = 24,
}: BrowseInput): Promise<{ total: number; entries: DirectoryEntry[] }> => {
  const entries = directoryEntries(await loadDirectoriesDocument(), section);
  const words = query?.trim().toLowerCase().split(/\s+/u).filter(Boolean) ?? [];

  const filtered = entries.filter((entry) => {
    if (
      category &&
      entry.category.toLowerCase() !== category.trim().toLowerCase()
    ) {
      return false;
    }
    if (words.length === 0) {
      return true;
    }
    const text =
      `${entry.name} ${entry.description} ${entry.category}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });

  const shown = Math.max(1, Math.min(limit, DIRECTORY_MAX_LIMIT));
  return { entries: filtered.slice(0, shown), total: filtered.length };
};

/** Compact catalog stats for the overview resource. */
export const catalogStats = async () => {
  const [catalog, directories] = await Promise.all([
    loadCatalogDocument(),
    loadDirectoriesDocument(),
  ]);
  const videos = catalog.videos ?? [];
  return {
    categories: categorySummaries(videos),
    directories: DIRECTORY_SECTIONS.map((section) => {
      const entries = directoryEntries(directories, section);
      return {
        categories: entryCategories(entries),
        label: section === "tools" ? "Tools & apps" : "Motion studios",
        section,
        total: entries.length,
      };
    }),
    importedAt: catalog.importedAt,
    site: SITE_URL,
    totalVideos: videos.length,
    videosWithPrompt: videos.filter((video) => video.promptShared).length,
  };
};
