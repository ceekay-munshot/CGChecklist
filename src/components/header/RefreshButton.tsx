"use client";

import { useState } from "react";
import { useCompany } from "@/lib/state/CompanyContext";
import { useToast } from "@/lib/state/ToastContext";

export function RefreshButton() {
  const { state, refresh } = useCompany();
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
          "Please choose a company and confirm its ticker before refreshing.",
      });
      return false;
    }
    return true;
  };

  // Cache-respecting refresh: serves the stored run if one exists from the
  // last month, otherwise runs the model.
  const handleRefresh = () => {
    if (!ensureIdentity()) return;
    setPending("refresh");
    void refresh();
  };

  // Forces a fresh run as of today, bypassing the cached run.
  const handleUpdate = () => {
    if (!ensureIdentity()) return;
    setPending("update");
    void refresh({ force: true });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleRefresh}
        disabled={isLoading}
        className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-brand)] px-4 text-sm font-medium text-[var(--color-fg-inverse)] shadow-sm transition hover:bg-[var(--color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading && pending === "refresh" ? (
          <>
            <Spinner />
            Refreshing
          </>
        ) : (
          <>Refresh data</>
        )}
      </button>
      <button
        type="button"
        onClick={handleUpdate}
        disabled={isLoading}
        title="Re-run the analysis as of today, ignoring the cached run"
        className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-white px-4 text-sm font-medium text-[var(--color-fg)] shadow-sm transition hover:bg-[var(--color-mist-50)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading && pending === "update" ? (
          <>
            <Spinner />
            Updating
          </>
        ) : (
          <>Update to today</>
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
