"use client";

import { useEffect, useRef } from "react";
import { useCompany } from "@/lib/state/CompanyContext";
import { useToast } from "@/lib/state/ToastContext";

export function RefreshButton() {
  const { state, refresh } = useCompany();
  const { push } = useToast();
  const prevStatusRef = useRef(state.status);
  const isLoading = state.status === "loading";

  useEffect(() => {
    const prev = prevStatusRef.current;
    if (prev === "loading" && state.status === "ready") {
      push({
        tone: "success",
        title: "Live data loaded",
        description: state.identity.name
          ? `Latest governance analysis is now live for ${state.identity.name}.`
          : "Latest governance analysis is now live for the selected company.",
      });
    } else if (prev === "loading" && state.status === "error") {
      push({
        tone: "error",
        title: "Refresh failed",
        description:
          state.message ||
          "We couldn't reach the MUNS analysis service. Please try again.",
      });
    }
    prevStatusRef.current = state.status;
  }, [state.status, state.message, state.identity.name, push]);

  const handleClick = () => {
    const { name, ticker } = state.identity;
    if (!name.trim() || !ticker.trim()) {
      push({
        tone: "warning",
        title: "Company details required",
        description:
          "Please choose a company and confirm its ticker before refreshing.",
      });
      return;
    }
    void refresh();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
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
