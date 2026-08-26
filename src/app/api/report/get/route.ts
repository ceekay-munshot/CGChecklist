import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getMunsKv, getReport, putReport, reportCacheKey } from "@/lib/munsCache";
import { resolveCountry } from "@/lib/munsConfig";
import { listLatestArtifact, downloadArtifactReport } from "@/lib/githubArtifacts";

// Reads live KV + GitHub, so never statically optimize.
export const dynamic = "force-dynamic";

/** Read a string binding/env, Cloudflare first then process.env. */
function readEnv(name: string): string | undefined {
  try {
    const bindings = getCloudflareContext().env as Record<string, unknown>;
    const v = bindings[name];
    if (typeof v === "string" && v.trim()) return v.trim();
  } catch {
    // no Cloudflare context
  }
  const p = process.env[name];
  return p && p.trim() ? p.trim() : undefined;
}

/**
 * Return the source-first engine report for a ticker. The result is read from KV
 * cache, but the cache is populated straight from the analyze.yml GitHub Actions
 * artifact using the same PAT the "Run" button needs — so no extra secret is
 * required, and a newer engine run automatically refreshes what's shown.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const ticker = url.searchParams.get("ticker")?.trim();
  if (!ticker) {
    return NextResponse.json({ ok: false, error: "ticker is required." }, { status: 400 });
  }
  const country = resolveCountry(url.searchParams.get("country"));
  const key = reportCacheKey({ ticker, country });

  let kv = null;
  try {
    const bindings = getCloudflareContext().env as Record<string, unknown>;
    kv = getMunsKv((bindings.MUNS_RUNS as never) ?? null);
  } catch {
    kv = getMunsKv(null);
  }

  const cached = await getReport(key, kv);

  // Look for the newest engine artifact and pull it if we haven't cached it yet
  // (or a newer run has replaced it). This needs the one GITHUB_DISPATCH_TOKEN
  // PAT — the same one the Run button uses.
  const token = readEnv("GITHUB_DISPATCH_TOKEN");
  const repo = readEnv("GITHUB_REPO") ?? "ceekay-munshot/CGChecklist";

  // Diagnostic (no secret leaked): ?debug=1 reports whether the token is live
  // and reachable, so a misconfigured key can be spotted without guesswork.
  if (url.searchParams.get("debug") === "1") {
    let apiStatus: number | null = null;
    if (token) {
      try {
        const probe = await fetch(
          `https://api.github.com/repos/${repo}/actions/artifacts?per_page=1`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28",
              "User-Agent": "cgchecklist-dashboard",
            },
          },
        );
        apiStatus = probe.status;
      } catch {
        apiStatus = -1;
      }
    }
    const artifact = token ? await listLatestArtifact(ticker, token, repo) : null;
    return NextResponse.json({
      ok: true,
      debug: true,
      ticker: ticker.toUpperCase(),
      tokenConfigured: !!token,
      repo,
      githubApiStatus: apiStatus, // 200 = token+scope OK; 401/403 = token/scope; 404 = repo
      artifactFound: !!artifact,
      artifactCreatedAt: artifact?.createdAt ?? null,
      cached: !!cached,
    });
  }

  if (token) {
    const latest = await listLatestArtifact(ticker, token, repo);
    if (latest && (!cached || cached.sourceStamp !== latest.createdAt)) {
      const pulled = await downloadArtifactReport(latest.id, token, repo);
      if (pulled) {
        await putReport(
          key,
          {
            ticker: pulled.ticker || ticker.toUpperCase(),
            company: pulled.company,
            total: pulled.total,
            max: pulled.max,
            rows: pulled.rows,
            harvestNote: pulled.harvestNote ?? undefined,
            sourceStamp: latest.createdAt,
          },
          kv,
        );
        return NextResponse.json({
          ok: true,
          found: true,
          ticker: pulled.ticker || ticker.toUpperCase(),
          company: pulled.company,
          country,
          total: pulled.total,
          max: pulled.max,
          rows: pulled.rows,
          harvestNote: pulled.harvestNote,
          storedAt: new Date().toISOString(),
        });
      }
    }
  }

  if (cached) {
    return NextResponse.json({
      ok: true,
      found: true,
      ticker: cached.ticker,
      company: cached.company,
      country,
      total: cached.total,
      max: cached.max,
      rows: cached.rows,
      harvestNote: cached.harvestNote ?? null,
      storedAt: new Date(cached.storedAt).toISOString(),
    });
  }

  return NextResponse.json({ ok: true, found: false });
}
