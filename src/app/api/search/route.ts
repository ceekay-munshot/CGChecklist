import { NextResponse } from "next/server";
import type { CompanySuggestion } from "@/lib/types/search";

const BIRDNEST_SEARCH_URL = "https://devde.muns.io/stock/search";

type BirdnestEntry = [string | null, string | null, string | null];

interface BirdnestResponse {
  success?: boolean;
  message?: string;
  data?: {
    total_results?: number;
    results?: Record<string, BirdnestEntry>;
  };
}

const COUNTRY_TO_LISTING: Record<
  string,
  { exchange: string; countryCode: string; suffix: string }
> = {
  India: { exchange: "NSE", countryCode: "IN", suffix: ".NS" },
  "United States": { exchange: "NASDAQ", countryCode: "US", suffix: "" },
  "United Kingdom": { exchange: "LSE", countryCode: "GB", suffix: ".L" },
  "Hong Kong": { exchange: "HKEX", countryCode: "HK", suffix: ".HK" },
  Japan: { exchange: "TSE", countryCode: "JP", suffix: ".T" },
  Australia: { exchange: "ASX", countryCode: "AU", suffix: ".AX" },
  Singapore: { exchange: "OTHER", countryCode: "SG", suffix: ".SI" },
};

const mapBirdnestEntry = (
  ticker: string,
  entry: BirdnestEntry,
): CompanySuggestion | null => {
  const [country, name, industry] = entry;
  if (!ticker || !name) return null;
  const upperTicker = ticker.trim().toUpperCase();
  const listing = country ? COUNTRY_TO_LISTING[country] : undefined;
  const exchange = listing?.exchange ?? "OTHER";
  const countryCode =
    listing?.countryCode ??
    (country ? country.slice(0, 2).toUpperCase() : "OTHER");
  const suffix = listing?.suffix ?? "";
  return {
    symbol: `${upperTicker}${suffix}`,
    ticker: upperTicker,
    name: name.trim(),
    exchange,
    country: countryCode,
    industry: industry?.trim() || undefined,
  };
};

const rankSuggestions = (
  suggestions: CompanySuggestion[],
  query: string,
): CompanySuggestion[] => {
  const upper = query.trim().toUpperCase();
  return [...suggestions].sort((a, b) => {
    const aExact = a.ticker === upper ? 0 : 1;
    const bExact = b.ticker === upper ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    const aPrefix = a.ticker.startsWith(upper) ? 0 : 1;
    const bPrefix = b.ticker.startsWith(upper) ? 0 : 1;
    if (aPrefix !== bPrefix) return aPrefix - bPrefix;
    return a.name.localeCompare(b.name);
  });
};

const fetchBirdnest = async (
  query: string,
): Promise<{ suggestions: CompanySuggestion[]; debug: string }> => {
  const token = process.env.MUNS_BEARER_TOKEN;
  if (!token) {
    return { suggestions: [], debug: "birdnest -> no token" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(BIRDNEST_SEARCH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    });
    if (!res.ok) {
      return { suggestions: [], debug: `birdnest -> ${res.status}` };
    }
    const data = (await res.json()) as BirdnestResponse;
    const results = data.data?.results;
    if (!results) {
      return { suggestions: [], debug: "birdnest -> empty" };
    }
    const mapped: CompanySuggestion[] = [];
    for (const [ticker, entry] of Object.entries(results)) {
      const suggestion = mapBirdnestEntry(ticker, entry);
      if (suggestion) mapped.push(suggestion);
    }
    return {
      suggestions: rankSuggestions(mapped, query).slice(0, 8),
      debug: `birdnest -> ${mapped.length}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return { suggestions: [], debug: `birdnest -> ${msg}` };
  } finally {
    clearTimeout(timer);
  }
};

interface YahooQuote {
  symbol?: string;
  shortname?: string;
  longname?: string;
  exchange?: string;
  exchDisp?: string;
  quoteType?: string;
  typeDisp?: string;
}

const SUFFIX_TO_EXCHANGE: Record<
  string,
  { exchange: string; country: string }
> = {
  NS: { exchange: "NSE", country: "IN" },
  BO: { exchange: "BSE", country: "IN" },
  L: { exchange: "LSE", country: "GB" },
  HK: { exchange: "HKEX", country: "HK" },
  T: { exchange: "TSE", country: "JP" },
  AX: { exchange: "ASX", country: "AU" },
  SI: { exchange: "OTHER", country: "SG" },
};

const US_EXCHANGES: Record<string, string> = {
  NMS: "NASDAQ",
  NGM: "NASDAQ",
  NCM: "NASDAQ",
  NYQ: "NYSE",
  PCX: "NYSE",
  ASE: "NYSE",
};

const mapQuote = (q: YahooQuote): CompanySuggestion | null => {
  const symbol = q.symbol?.trim();
  const name = (q.longname || q.shortname || "").trim();
  if (!symbol || !name) return null;
  if (q.quoteType && q.quoteType !== "EQUITY") return null;

  const dot = symbol.lastIndexOf(".");
  if (dot === -1) {
    const exch = q.exchange ? US_EXCHANGES[q.exchange] || "OTHER" : "OTHER";
    return {
      symbol,
      ticker: symbol,
      name,
      exchange: exch,
      country: exch === "OTHER" ? "OTHER" : "US",
    };
  }

  const suffix = symbol.slice(dot + 1).toUpperCase();
  const ticker = symbol.slice(0, dot);
  const mapping = SUFFIX_TO_EXCHANGE[suffix];
  if (!mapping) return null;

  return {
    symbol,
    ticker,
    name,
    exchange: mapping.exchange,
    country: mapping.country,
  };
};

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://finance.yahoo.com/",
  Origin: "https://finance.yahoo.com",
};

const fetchWithTimeout = async (url: string, timeoutMs: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

const tryYahoo = async (
  query: string,
): Promise<{ quotes: YahooQuote[]; debug: string }> => {
  const encoded = encodeURIComponent(query);
  const endpoints = [
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encoded}&quotesCount=10&newsCount=0&listsCount=0&region=IN&lang=en-IN`,
    `https://query2.finance.yahoo.com/v1/finance/search?q=${encoded}&quotesCount=10&newsCount=0&listsCount=0&region=IN&lang=en-IN`,
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encoded}&quotesCount=10&newsCount=0&listsCount=0`,
  ];

  let lastDebug = "no upstream attempted";
  for (const url of endpoints) {
    try {
      const res = await fetchWithTimeout(url, 4500);
      if (!res.ok) {
        lastDebug = `${new URL(url).host} -> ${res.status}`;
        continue;
      }
      const data = (await res.json()) as { quotes?: YahooQuote[] };
      const quotes = data.quotes || [];
      if (quotes.length > 0) {
        return { quotes, debug: `${new URL(url).host} -> ok` };
      }
      lastDebug = `${new URL(url).host} -> empty`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      lastDebug = `${new URL(url).host} -> ${msg}`;
    }
  }
  return { quotes: [], debug: lastDebug };
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const debug = searchParams.get("debug") === "1";

  if (!q || q.length < 1) {
    return NextResponse.json({ suggestions: [] });
  }

  const { suggestions: birdnestHits, debug: birdnestDebug } =
    await fetchBirdnest(q);
  if (birdnestHits.length > 0) {
    return NextResponse.json(
      debug
        ? { suggestions: birdnestHits, debug: birdnestDebug }
        : { suggestions: birdnestHits },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  }

  const { quotes, debug: upstreamDebug } = await tryYahoo(q);
  const suggestions = quotes
    .map(mapQuote)
    .filter((s): s is CompanySuggestion => s !== null)
    .slice(0, 8);

  return NextResponse.json(
    debug
      ? { suggestions, debug: `${birdnestDebug}; yahoo -> ${upstreamDebug}` }
      : { suggestions },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}
