"use client";

import { useEffect, useRef, useState } from "react";
import type { GovernanceRow } from "@/lib/types/governance";
import { useCompany } from "@/lib/state/CompanyContext";
import {
  pollVerification,
  startVerification,
} from "@/lib/verify/verifyClient";
import { indexResults, type VerificationMap } from "@/lib/verify/mergeResults";

type Phase = "idle" | "starting" | "verifying" | "done" | "error";

interface Props {
  rows: GovernanceRow[];
  disabled?: boolean;
  onResults: (map: VerificationMap) => void;
}

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Verify remarks",
  starting: "Starting…",
  verifying: "Verifying…",
  done: "Re-verify remarks",
  error: "Retry verification",
};

export function VerifyRemarksButton({ rows, disabled, onResults }: Props) {
  const { state } = useCompany();
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [sessionUrl, setSessionUrl] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const busy = phase === "starting" || phase === "verifying";

  async function handleClick() {
    if (busy) return;
    setMessage(null);
    setSessionUrl(null);
    setPhase("starting");

    const company = {
      name: state.identity.name,
      ticker: state.identity.ticker,
      country: state.identity.country || undefined,
    };

    const started = await startVerification(company, rows);
    if (!started.ok || !started.runId) {
      setPhase("error");
      setMessage(started.error || "Could not start verification.");
      return;
    }
    if (started.sessionUrl) setSessionUrl(started.sessionUrl);
    setPhase("verifying");
    setMessage("Routine is web-verifying remarks. This can take a few minutes.");

    const controller = new AbortController();
    abortRef.current = controller;

    const outcome = await pollVerification(started.runId, {
      signal: controller.signal,
    });

    if (!outcome.ok) {
      setPhase("error");
      setMessage(outcome.error || "Verification failed.");
      return;
    }

    const results = outcome.results ?? [];
    onResults(indexResults(results));
    setPhase("done");
    setMessage(
      results.length > 0
        ? `Verified ${results.length} remark${results.length === 1 ? "" : "s"}.`
        : "Routine returned no verifiable remarks.",
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || busy}
        className="focus-ring inline-flex h-9 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] px-3.5 text-sm font-medium text-[var(--color-fg)] shadow-sm transition hover:bg-[var(--color-mist-50)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? <Spinner /> : <ShieldIcon />}
        {PHASE_LABEL[phase]}
      </button>
      {message ? (
        <p
          className={`max-w-[18rem] text-right text-xs ${
            phase === "error"
              ? "text-[var(--color-risk-700)]"
              : "text-[var(--color-fg-muted)]"
          }`}
        >
          {message}
          {sessionUrl ? (
            <>
              {" "}
              <a
                href={sessionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                View run
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function ShieldIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 1.5 3 3.5v4c0 3 2.2 5.3 5 6.5 2.8-1.2 5-3.5 5-6.5v-4L8 1.5Z" />
      <path d="m6 7.8 1.5 1.5L10.5 6" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="h-4 w-4 animate-spin"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <path d="M8 1.5a6.5 6.5 0 1 0 6.5 6.5" />
    </svg>
  );
}
