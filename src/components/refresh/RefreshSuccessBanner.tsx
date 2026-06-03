"use client";

import { useEffect } from "react";
import { useCompany } from "@/lib/state/CompanyContext";
import type { MunsDiff } from "@/lib/refresh/diffMuns";

const AUTO_DISMISS_MS = 12_000;

export function RefreshSuccessBanner() {
  const { state, dismissProgress } = useCompany();
  const { progress, status } = state;
  const visible = progress.outcome != null && status !== "loading";

  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(dismissProgress, AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [visible, progress.finishedAt, dismissProgress]);

  if (!visible) return null;

  if (progress.outcome === "error") {
    return (
      <Wrapper tone="error">
        <span
          aria-hidden
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-risk-500)] text-[11px] font-bold text-white"
        >
          !
        </span>
        <p className="min-w-0 flex-1 text-sm text-[var(--color-fg)]">
          <strong>Refresh failed.</strong>{" "}
          <span className="text-[var(--color-fg-muted)]">
            {progress.error || "Analysis could not be loaded."}
          </span>
        </p>
        <DismissButton onClick={dismissProgress} />
      </Wrapper>
    );
  }

  return (
    <Wrapper tone="success">
      <span
        aria-hidden
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-good-500)] text-[11px] font-bold text-white"
      >
        {"✓"}
      </span>
      <p className="min-w-0 flex-1 text-sm text-[var(--color-fg)]">
        <strong>Governance analysis updated.</strong>{" "}
        <span className="text-[var(--color-fg-muted)]">
          {summariseDiff(progress.diff)}
        </span>
      </p>
      <DismissButton onClick={dismissProgress} />
    </Wrapper>
  );
}

function Wrapper({
  tone,
  children,
}: {
  tone: "success" | "error";
  children: React.ReactNode;
}) {
  const accent =
    tone === "success"
      ? "border-good-100 bg-good-50/50"
      : "border-risk-100 bg-risk-50/50";
  return (
    <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]">
      <div
        className={`mx-auto flex max-w-screen-2xl items-center gap-3 border-l-4 px-6 py-2.5 ${accent}`}
        role="status"
      >
        {children}
      </div>
    </div>
  );
}

function DismissButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Dismiss notification"
      className="focus-ring inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-fg-subtle)] transition hover:bg-[var(--color-mist-100)] hover:text-[var(--color-fg)]"
    >
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
        <path d="M5.3 5.3a1 1 0 011.4 0L10 8.6l3.3-3.3a1 1 0 111.4 1.4L11.4 10l3.3 3.3a1 1 0 11-1.4 1.4L10 11.4l-3.3 3.3a1 1 0 11-1.4-1.4L8.6 10 5.3 6.7a1 1 0 010-1.4z" />
      </svg>
    </button>
  );
}

function summariseDiff(diff: MunsDiff | null): string {
  if (!diff) return "Refreshed.";
  if (diff.isFirstLoad) {
    const total = diff.sectionsAdded.length;
    return total === 1
      ? "1 section loaded for the first time."
      : `${total} sections loaded for the first time.`;
  }
  const parts: string[] = [];
  if (diff.sectionsUpdated.length > 0) {
    parts.push(
      `${diff.sectionsUpdated.length} updated (${diff.sectionsUpdated.join(", ")})`,
    );
  }
  if (diff.sectionsAdded.length > 0) {
    parts.push(`${diff.sectionsAdded.length} new`);
  }
  if (diff.sectionsRemoved.length > 0) {
    parts.push(`${diff.sectionsRemoved.length} removed`);
  }
  if (diff.sectionsUnchanged.length > 0) {
    parts.push(`${diff.sectionsUnchanged.length} unchanged`);
  }
  if (parts.length === 0) return "No changes detected since last refresh.";
  return parts.join(" · ");
}
