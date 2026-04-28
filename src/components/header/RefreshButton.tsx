"use client";

import { useCompany } from "@/lib/state/CompanyContext";

export function RefreshButton() {
  const { state, refresh } = useCompany();
  const isLoading = state.status === "loading";

  return (
    <button
      type="button"
      onClick={() => {
        void refresh();
      }}
      disabled={isLoading}
      className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-brand)] px-4 text-sm font-medium text-[var(--color-fg-inverse)] shadow-sm transition hover:bg-[var(--color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isLoading ? (
        <>
          <Spinner />
          Refreshing
        </>
      ) : (
        <>Refresh data</>
      )}
    </button>
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
