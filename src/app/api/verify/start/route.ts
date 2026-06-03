import { NextResponse } from "next/server";
import {
  ROUTINES_API_VERSION,
  ROUTINES_BETA_HEADER,
  routineFireUrl,
} from "@/lib/munsConfig";
import { putRecord } from "@/lib/verify/store";
import type {
  VerificationRowInput,
  VerificationRunInput,
} from "@/lib/verify/types";

export const dynamic = "force-dynamic";

// The routine fire `text` field is capped at 65536 chars; stay under it.
const MAX_TEXT_LENGTH = 60000;

interface StartRequest {
  company?: { name?: string; ticker?: string; country?: string };
  rows?: VerificationRowInput[];
}

const randomHex = (bytes: number): string => {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
};

const resolveCallbackBase = (request: Request): string => {
  const override = process.env.VERIFY_CALLBACK_BASE_URL?.trim();
  if (override) return override.replace(/\/$/, "");
  return new URL(request.url).origin;
};

export async function POST(request: Request) {
  const token = process.env.ROUTINE_FIRE_TOKEN;
  const triggerId = process.env.ROUTINE_TRIGGER_ID;
  if (!token || !triggerId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Routine verification is not configured. Set ROUTINE_FIRE_TOKEN and ROUTINE_TRIGGER_ID.",
      },
      { status: 500 },
    );
  }

  let body: StartRequest;
  try {
    body = (await request.json()) as StartRequest;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const company = {
    name: body.company?.name?.trim() || "",
    ticker: body.company?.ticker?.trim() || "",
    country: body.company?.country?.trim() || undefined,
  };
  const rows = Array.isArray(body.rows) ? body.rows : [];

  if (!company.name || !company.ticker) {
    return NextResponse.json(
      { ok: false, error: "Company name and ticker are required." },
      { status: 400 },
    );
  }
  if (rows.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No remarks supplied to verify." },
      { status: 400 },
    );
  }

  const runId = `ver_${randomHex(12)}`;
  const callbackSecret = randomHex(24);
  const callbackUrl = `${resolveCallbackBase(request)}/api/verify/callback`;

  const runInput: VerificationRunInput = {
    runId,
    callbackUrl,
    callbackSecret,
    company,
    rows,
  };

  const text = JSON.stringify(runInput);
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      {
        ok: false,
        error: `Payload too large (${text.length} chars). Verify fewer remarks per run.`,
      },
      { status: 413 },
    );
  }

  // Persist the pending record before firing so the callback can never race
  // ahead of a record that doesn't exist yet.
  await putRecord({
    runId,
    status: "pending",
    callbackSecret,
    company,
    createdAt: new Date().toISOString(),
  });

  try {
    const upstream = await fetch(routineFireUrl(triggerId), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": ROUTINES_BETA_HEADER,
        "anthropic-version": ROUTINES_API_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    const raw = await upstream.text();
    if (!upstream.ok) {
      await putRecord({
        runId,
        status: "error",
        callbackSecret,
        company,
        createdAt: new Date().toISOString(),
        error: `Routine fire failed with status ${upstream.status}.`,
        completedAt: new Date().toISOString(),
      });
      return NextResponse.json(
        {
          ok: false,
          runId,
          error: `Routine fire failed with status ${upstream.status}.`,
          raw,
        },
        { status: 502 },
      );
    }

    let sessionUrl: string | undefined;
    try {
      const parsed = JSON.parse(raw) as { claude_code_session_url?: string };
      sessionUrl = parsed.claude_code_session_url;
    } catch {
      // Non-JSON success body — keep the run pending without a session URL.
    }

    await putRecord({
      runId,
      status: "pending",
      callbackSecret,
      company,
      createdAt: new Date().toISOString(),
      sessionUrl,
    });

    return NextResponse.json({ ok: true, runId, sessionUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await putRecord({
      runId,
      status: "error",
      callbackSecret,
      company,
      createdAt: new Date().toISOString(),
      error: `Failed to fire routine: ${message}`,
      completedAt: new Date().toISOString(),
    });
    return NextResponse.json(
      { ok: false, runId, error: `Failed to fire routine: ${message}` },
      { status: 502 },
    );
  }
}
