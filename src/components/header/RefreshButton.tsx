"use client";

import { useState } from "react";
import { useCompany } from "@/lib/state/CompanyContext";
import { useToast } from "@/lib/state/ToastContext";

export function RefreshButton() {
  const { state, runEngineAnalysis } = useCompany();
  const { push } = useToast();
  const isLoading = state.status === "loading";
  const [pending, setPending] = useState<null | "refresh" | "update">(null);

  const ensureIdentity = () => {
    const { name, ticker } = state.identity;
    if (!name.trim() || !ticker.trim()) {
      push({
        tone: "warning",
        title: "Company details required",
        description:
          "Please choose a company and confirm its ticker before loading or running an analysis.",
      });
      return false;
    }
    return true;
  };

  // "Load saved report" — shows the last stored run instantly; only runs the
  // engine if no report exists yet. Does NOT recompute.
  const handleLoad = () => {
    if (!ensureIdentity()) return;
    setPending("refresh");
    void runEngineAnalysis();
  };

  // "Run new analysis" — forces a fresh engine run as of today (~10 min),
  // ignoring the stored report.
  const handleRun = () => {
    if (!ensureIdentity()) return;
    setPending("update");
    void runEngineAnalysis({ force: true });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleLoad}
        disabled={isLoading}
        title="Show the last saved analysis instantly (does not re-run)"
        className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-white px-4 text-sm font-medium text-[var(--color-fg)] shadow-sm transition hover:bg-[var(--color-mist-50)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading && pending === "refresh" ? (
          <>
            <Spinner />
            Loading
          </>
        ) : (
          <>Load saved report</>
        )}
      </button>
      <button
        type="button"
        onClick={handleRun}
        disabled={isLoading}
        title="Run a fresh analysis as of today (~10 min), ignoring the saved report"
        className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-brand)] px-4 text-sm font-medium text-[var(--color-fg-inverse)] shadow-sm transition hover:bg-[var(--color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading && pending === "update" ? (
          <>
            <Spinner />
            Running
          </>
        ) : (
          <>Run new analysis</>
        )}
      </button>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="h-4 w-4 animate-spin"
      fill="none"
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path
        d="M14 8a6 6 0 0 0-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
