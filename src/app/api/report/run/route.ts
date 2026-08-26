import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Dispatches an external workflow; never statically optimize.
export const dynamic = "force-dynamic";

interface RunRequest {
  ticker?: string;
  company?: string;
  /** Git ref the workflow runs against. Defaults to "main". */
  ref?: string;
}

/** Read a string binding from the Cloudflare env, falling back to process.env. */
function readEnv(name: string): string | undefined {
  try {
    const bindings = getCloudflareContext().env as Record<string, unknown>;
    const v = bindings[name];
    if (typeof v === "string" && v.trim()) return v.trim();
  } catch {
    // no Cloudflare context (plain `next dev`)
  }
  const p = process.env[name];
  return p && p.trim() ? p.trim() : undefined;
}

/**
 * Trigger the source-first analysis engine for a company by dispatching the
 * `analyze.yml` GitHub Actions workflow. The engine harvests Screener + the
 * annual report, answers all 51 questions with citations, and ingests the
 * result into KV (`report:<COUNTRY>:<TICKER>`), which the dashboard then reads
 * via /api/report/get.
 *
 * Config (worker secrets / vars):
 *   GITHUB_DISPATCH_TOKEN — a PAT with Actions: write on the repo (secret)
 *   GITHUB_REPO           — "owner/repo" (var; defaults to the known repo)
 */
export async function POST(request: Request) {
  let body: RunRequest;
  try {
    body = (await request.json()) as RunRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const ticker = body.ticker?.trim().toUpperCase();
  const company = body.company?.trim() ?? "";
  if (!ticker) {
    return NextResponse.json({ ok: false, error: "ticker is required." }, { status: 400 });
  }

  const token = readEnv("GITHUB_DISPATCH_TOKEN");
  const repo = readEnv("GITHUB_REPO") ?? "ceekay-munshot/CGChecklist";
  const ref = body.ref?.trim() || "main";

  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Dashboard-triggered runs aren't configured yet. Set the GITHUB_DISPATCH_TOKEN worker secret (a PAT with Actions: write) to enable them.",
      },
      { status: 501 },
    );
  }

  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/analyze.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "cgchecklist-dashboard",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref, inputs: { ticker, company } }),
    },
  );

  // GitHub returns 204 No Content on a successful dispatch.
  if (res.status === 204) {
    return NextResponse.json({ ok: true, status: "dispatched", ticker, repo, ref });
  }

  const detail = await res.text().catch(() => "");
  return NextResponse.json(
    {
      ok: false,
      error: `GitHub workflow dispatch failed (HTTP ${res.status}).`,
      detail: detail.slice(0, 300),
    },
    { status: 502 },
  );
}
