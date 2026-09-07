// Firecrawl web research for the backfill — used for the questions the filings
// can't answer (attrition, remuneration-vs-industry, reputation, peer/market
// data). Firecrawl responds reliably from GitHub Actions, where the MUNS chat
// API was timing out on every call.
//
// COST NOTE — this file is split into a cheap SEARCH and a cached SCRAPE, the
// same shape cgchecklist2.0 uses, so the SAME evidence is gathered for a
// fraction of the Firecrawl credits:
//
//   1) SEARCH ONLY — /search with NO scrapeOptions returns a light list of hits
//      (title + snippet + url). Firecrawl bills a scrape PER PAGE, so bundling
//      `scrapeOptions` into the search meant every question re-read the full
//      text (every page) of its 5 results.
//   2) SCRAPE THROUGH A RUN-LEVEL CACHE — each hit's URL is fetched at most ONCE
//      per run and reused for every question whose search surfaced it. A company
//      document that shows up across many questions (e.g. a 600-page RHP, an
//      annual report) is therefore billed once, not once per question.
//
// The evidence block handed to the judge is built exactly as before (title +
// url + page markdown, same caps), so answer quality is unchanged — only the
// duplicate fetching of the same document is removed.

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v1";
const SEARCH_TIMEOUT_MS = 30_000;
const SCRAPE_TIMEOUT_MS = 90_000;
const MAX_HITS = 5;
const PER_HIT_CHARS = 3000;
const MAX_EVIDENCE_CHARS = 14_000;

const apiKey = (): string => process.env.FIRECRAWL_API_KEY?.trim() ?? "";

export const firecrawlConfigured = (): boolean => apiKey().length > 0;

interface FcHit {
  url?: string;
  title?: string;
  description?: string;
  snippet?: string;
  markdown?: string;
}

// Run-level scrape cache: url -> scraped markdown (Promise, so concurrent
// questions racing on the same URL share one in-flight fetch instead of both
// paying for it). Keyed per process — which is exactly one `analyze.ts` run — so
// every question in the run shares a single fetch of any given URL. This is the
// change that stops the same big PDF being re-billed once per question.
const scrapeCache = new Map<string, Promise<string>>();

/** Reset the per-run scrape cache (tests / repeated in-process runs). */
export function resetFirecrawlCache(): void {
  scrapeCache.clear();
}

// Firecrawl's /search has shipped a few response shapes: a flat `data: []`, a
// categorised `data: { web: [], news: [] }`, and occasionally a top-level
// `web: []`. Accept all so a shape change can't silently yield zero results.
function hitsFrom(data: {
  data?: FcHit[] | { web?: FcHit[]; news?: FcHit[] };
  web?: FcHit[];
}): FcHit[] {
  const d = data.data;
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d.web)) return d.web;
  if (Array.isArray(data.web)) return data.web;
  return [];
}

/**
 * Search the web and return the top hits (title + snippet + url) WITHOUT
 * scraping — a light, ~1-credit call. Returns [] on any failure so the caller
 * can fall back gracefully.
 */
async function searchHits(query: string): Promise<FcHit[]> {
  const key = apiKey();
  if (!key) return [];
  try {
    const res = await fetch(`${FIRECRAWL_BASE}/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit: MAX_HITS }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Parameters<typeof hitsFrom>[0];
    return hitsFrom(data).filter((h) => h.url);
  } catch {
    return [];
  }
}

/**
 * Scrape one URL's page as markdown, memoised for the whole run: the first
 * question to need a URL pays for it, every later question reads the cached
 * text. Returns "" on any failure. Best-effort and never throws.
 */
async function scrapeUrl(url: string): Promise<string> {
  const cached = scrapeCache.get(url);
  if (cached) return cached;
  const p = (async () => {
    const key = apiKey();
    if (!key) return "";
    try {
      const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url, formats: ["markdown"] }),
        signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
      });
      if (!res.ok) return "";
      const data = (await res.json()) as {
        data?: { markdown?: string };
        markdown?: string;
      };
      return (data.data?.markdown ?? data.markdown ?? "").trim();
    } catch {
      return "";
    }
  })();
  scrapeCache.set(url, p);
  return p;
}

/**
 * Search the web and return the top results as one evidence block (title + url +
 * page markdown per hit). Returns "" on any failure so the caller can fall back
 * gracefully.
 *
 * Same output as before, but the two-step search→cached-scrape means any
 * document shared across questions is fetched from Firecrawl only once per run.
 */
export async function firecrawlSearch(query: string): Promise<string> {
  const hits = await searchHits(query);
  if (!hits.length) return "";

  const blocks = await Promise.all(
    hits.slice(0, MAX_HITS).map(async (h) => {
      const url = h.url as string;
      // Page text (cached across the run); fall back to the search snippet if the
      // scrape returns nothing — the same fallback order as before.
      const markdown = await scrapeUrl(url);
      const body = (markdown || h.description || h.snippet || "").trim().slice(0, PER_HIT_CHARS);
      return `SOURCE: ${h.title ?? ""} (${url})\n${body}`;
    }),
  );
  return blocks.join("\n\n---\n\n").slice(0, MAX_EVIDENCE_CHARS);
}
