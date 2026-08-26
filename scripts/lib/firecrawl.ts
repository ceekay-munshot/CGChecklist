// Firecrawl web search for the backfill — used for the questions the filings
// can't answer (attrition, remuneration-vs-industry, reputation, peer/market
// data). Firecrawl responds reliably from GitHub Actions, where the MUNS chat
// API was timing out on every call.

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v1";
const TIMEOUT_MS = 90_000;

const apiKey = (): string => process.env.FIRECRAWL_API_KEY?.trim() ?? "";

export const firecrawlConfigured = (): boolean => apiKey().length > 0;

interface FcHit {
  url?: string;
  title?: string;
  description?: string;
  snippet?: string;
  markdown?: string;
}

/**
 * Search the web and return the top results as one evidence block (title + url +
 * scraped markdown/snippet per hit). Returns "" on any failure so the caller can
 * fall back gracefully. Tolerates Firecrawl's several /search response shapes.
 */
export async function firecrawlSearch(query: string): Promise<string> {
  const key = apiKey();
  if (!key) return "";
  try {
    const res = await fetch(`${FIRECRAWL_BASE}/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit: 5, scrapeOptions: { formats: ["markdown"] } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return "";
    const data = (await res.json()) as {
      data?: FcHit[] | { web?: FcHit[]; news?: FcHit[] };
      web?: FcHit[];
    };
    const arr: FcHit[] = Array.isArray(data.data)
      ? data.data
      : Array.isArray(data.data?.web)
        ? data.data.web
        : Array.isArray(data.web)
          ? data.web
          : [];
    const blocks = arr
      .filter((h) => h.url)
      .slice(0, 5)
      .map((h) => {
        const body = (h.markdown || h.description || h.snippet || "").trim().slice(0, 3000);
        return `SOURCE: ${h.title ?? ""} (${h.url})\n${body}`;
      });
    return blocks.join("\n\n---\n\n").slice(0, 14_000);
  } catch {
    return "";
  }
}
