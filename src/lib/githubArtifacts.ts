// Pull a source-first engine report straight from the GitHub Actions artifact
// the analyze.yml run produced. This lets the dashboard show results using the
// SAME GitHub token the "Run" button already needs (a fine-grained PAT with
// Actions: read & write) — no second secret, no Cloudflare API token, no
// workflow push-back. The Worker lists the newest `cg-report-<TICKER>` artifact,
// downloads its zip, and reads the results.json out of it.

import { unzipSync } from "fflate";
import type { GovernanceRow } from "@/lib/types/governance";

const GH_API = "https://api.github.com";

export interface ArtifactReport {
  ticker: string;
  company: string;
  total: number;
  max: number;
  rows: GovernanceRow[];
  harvestNote: string | null;
}

interface ArtifactMeta {
  id: number;
  name: string;
  expired: boolean;
  created_at: string;
}

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "cgchecklist-dashboard",
  };
}

/**
 * Find the newest non-expired `cg-report-<TICKER>` artifact. One cheap API call;
 * returns its id + created_at so the caller can skip re-downloading when it
 * already cached this exact artifact.
 */
export async function listLatestArtifact(
  ticker: string,
  token: string,
  repo: string,
): Promise<{ id: number; createdAt: string } | null> {
  const wanted = `cg-report-${ticker.trim().toUpperCase()}`.toLowerCase();
  try {
    const res = await fetch(`${GH_API}/repos/${repo}/actions/artifacts?per_page=100`, {
      headers: ghHeaders(token),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { artifacts?: ArtifactMeta[] };
    const match = (data.artifacts ?? [])
      .filter((a) => !a.expired && a.name.trim().toLowerCase() === wanted)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
    return match ? { id: match.id, createdAt: match.created_at } : null;
  } catch {
    return null;
  }
}

// Download the artifact zip. GitHub 302-redirects to signed storage; we read the
// Location and fetch it without the auth header. Falls back to letting fetch
// follow the redirect (the runtime strips auth cross-origin per spec).
async function downloadZip(url: string, token: string): Promise<Uint8Array | null> {
  try {
    let res = await fetch(url, { headers: ghHeaders(token), redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return null;
      res = await fetch(loc);
    } else if (res.status === 0 || res.type === "opaqueredirect") {
      // Runtime hid the redirect — let it follow (auth stripped cross-origin).
      res = await fetch(url, { headers: ghHeaders(token), redirect: "follow" });
    }
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Download + unzip an artifact and parse the engine results.json inside it. */
export async function downloadArtifactReport(
  artifactId: number,
  token: string,
  repo: string,
): Promise<ArtifactReport | null> {
  const zip = await downloadZip(
    `${GH_API}/repos/${repo}/actions/artifacts/${artifactId}/zip`,
    token,
  );
  if (!zip) return null;

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zip);
  } catch {
    return null;
  }
  const key = Object.keys(files).find((k) => /results\.json$/i.test(k));
  if (!key) return null;

  let parsed: Partial<ArtifactReport>;
  try {
    parsed = JSON.parse(new TextDecoder().decode(files[key])) as Partial<ArtifactReport>;
  } catch {
    return null;
  }
  if (!Array.isArray(parsed.rows) || parsed.rows.length === 0) return null;

  return {
    ticker: parsed.ticker ?? "",
    company: parsed.company ?? parsed.ticker ?? "",
    total: typeof parsed.total === "number" ? parsed.total : 0,
    max: typeof parsed.max === "number" ? parsed.max : 0,
    rows: parsed.rows as GovernanceRow[],
    harvestNote: parsed.harvestNote ?? null,
  };
}
