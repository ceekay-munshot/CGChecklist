"use client";

import { useEffect, useRef, useState } from "react";
import { useCompany } from "@/lib/state/CompanyContext";
import {
  REFRESH_PHASES,
  currentPhaseIndex,
  formatElapsed,
  progressPercent,
} from "@/lib/refresh/phases";
import type { MunsDiff } from "@/lib/refresh/diffMuns";
import type { DataStatus } from "@/lib/types/company";

const COMPLETION_HOLD_MS = 3500;

interface CompletionState {
  outcome: "success" | "error";
  totalElapsedMs: number;
  diff: MunsDiff | null;
  error: string | null;
}

export function RefreshProgressModal() {
  const { state, cancel } = useCompany();
  const isLoading = state.status === "loading";
  const startedAt = state.progress.startedAt;
  const finishedAt = state.progress.finishedAt;
  const progressDiff = state.progress.diff;
  const progressError = state.progress.error;
  const progressCancelled = state.progress.cancelled;

  const [elapsedMs, setElapsedMs] = useState(0);
  const [completion, setCompletion] = useState<CompletionState | null>(null);
  const prevStatusRef = useRef<DataStatus>(state.status);

  useEffect(() => {
    if (!isLoading || !startedAt) return;
    const id = setInterval(
      () => setElapsedMs(Date.now() - startedAt),
      1000,
    );
    return () => clearInterval(id);
  }, [isLoading, startedAt]);

  useEffect(() => {
    const prev = prevStatusRef.current;
    if (
      prev === "loading" &&
      (state.status === "ready" || state.status === "error") &&
      !progressCancelled
    ) {
      const total = startedAt && finishedAt ? finishedAt - startedAt : 0;
      setCompletion({
        outcome: state.status === "ready" ? "success" : "error",
        totalElapsedMs: total,
        diff: progressDiff,
        error: progressError,
      });
    } else if (prev !== "loading" && state.status === "loading") {
      setCompletion(null);
      setElapsedMs(0);
    }
    prevStatusRef.current = state.status;
  }, [
    state.status,
    startedAt,
    finishedAt,
    progressDiff,
    progressError,
    progressCancelled,
  ]);

  useEffect(() => {
    if (!completion) return;
    const id = setTimeout(() => setCompletion(null), COMPLETION_HOLD_MS);
    return () => clearTimeout(id);
  }, [completion]);

  if (!isLoading && !completion) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={
        isLoading
          ? "Running governance analysis"
          : completion?.outcome === "success"
            ? "Analysis complete"
            : "Analysis failed"
      }
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
    >
      <div className="absolute inset-0 bg-[var(--color-navy-900)]/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-6 shadow-[0_24px_48px_rgba(10,20,34,0.18)]">
        {isLoading ? (
          <LoadingFrame
            companyName={state.identity.name}
            ticker={state.identity.ticker}
            elapsedMs={elapsedMs}
            onCancel={cancel}
          />
        ) : completion ? (
          <CompletionFrame
            completion={completion}
            companyName={state.identity.name}
            ticker={state.identity.ticker}
            onClose={() => setCompletion(null)}
          />
        ) : null}
      </div>
    </div>
  );
}

function LoadingFrame({
  companyName,
  ticker,
  elapsedMs,
  onCancel,
}: {
  companyName: string;
  ticker: string;
  elapsedMs: number;
  onCancel: () => void;
}) {
  const phaseIdx = currentPhaseIndex(elapsedMs);
  const percent = progressPercent(elapsedMs, false);

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
            Running governance analysis
          </p>
          <h2 className="mt-1 text-base font-semibold tracking-tight text-[var(--color-fg)]">
            {companyName || "Company"}
            {ticker ? (
              <span className="ml-2 text-[var(--color-fg-subtle)]">
                · {ticker}
              </span>
            ) : null}
          </h2>
        </div>
        <span
          className="rounded-full bg-[var(--color-good-50)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-good-700)]"
          data-numeric
        >
          {formatElapsed(elapsedMs)}
        </span>
      </div>

      <div className="mt-5">
        <div
          role="progressbar"
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-mist-100)]"
        >
          <div
            className="h-full rounded-full bg-[var(--color-good-500)] transition-[width] duration-700 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--color-fg-subtle)]">
          <span>Working on it…</span>
          <span data-numeric>{Math.round(percent)}%</span>
        </div>
      </div>

      <ul className="mt-5 space-y-2">
        {REFRESH_PHASES.map((phase, i) => {
          const status =
            i < phaseIdx ? "done" : i === phaseIdx ? "active" : "pending";
          return (
            <li
              key={phase.id}
              className={`flex items-start gap-3 text-sm ${
                status === "pending"
                  ? "text-[var(--color-fg-subtle)]"
                  : "text-[var(--color-fg)]"
              }`}
            >
              <span
                aria-hidden
                className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  status === "done"
                    ? "bg-[var(--color-good-500)] text-white"
                    : status === "active"
                      ? "bg-[var(--color-good-50)] text-[var(--color-good-700)] ring-2 ring-[var(--color-good-500)]"
                      : "bg-[var(--color-mist-100)] text-[var(--color-fg-subtle)]"
                }`}
              >
                {status === "done" ? "✓" : status === "active" ? (
                  <ActiveDot />
                ) : (
                  i + 1
                )}
              </span>
              <span className="leading-5">{phase.label}</span>
            </li>
          );
        })}
      </ul>

      <p className="mt-5 rounded-[var(--radius-control)] bg-[var(--color-mist-50)] px-3 py-2 text-[12px] leading-relaxed text-[var(--color-fg-muted)]">
        The MUNS agent typically takes <strong>7–9 minutes</strong> to compile a
        full governance analysis. You can leave this tab open — we&apos;ll
        update the dashboard the moment results land.
      </p>

      <div className="mt-4 flex justify-center">
        <button
          type="button"
          onClick={onCancel}
          className="focus-ring inline-flex h-9 items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-white px-4 text-sm font-medium text-[var(--color-fg-muted)] transition hover:bg-[var(--color-risk-50)] hover:text-[var(--color-risk-700)]"
        >
          <CancelIcon />
          Cancel run
        </button>
      </div>
    </>
  );
}

function CancelIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <path
        d="M4 4l8 8M12 4l-8 8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CompletionFrame({
  completion,
  companyName,
  ticker,
  onClose,
}: {
  completion: CompletionState;
  companyName: string;
  ticker: string;
  onClose: () => void;
}) {
  const isSuccess = completion.outcome === "success";
  // A sub-second "success" wasn't a real run — it's the saved report served from
  // cache. Label it as such instead of "Completed in 00:00", which reads like a
  // fresh run that finished instantly.
  const instant = isSuccess && completion.totalElapsedMs < 1500;

  return (
    <div className="flex flex-col items-center text-center">
      <span
        aria-hidden
        className={`inline-flex h-14 w-14 items-center justify-center rounded-full ${
          isSuccess
            ? "bg-[var(--color-good-50)] text-[var(--color-good-600)]"
            : "bg-[var(--color-risk-50)] text-[var(--color-risk-600)]"
        }`}
      >
        {isSuccess ? <BigCheck /> : <BigCross />}
      </span>

      <h2 className="mt-4 text-lg font-semibold tracking-tight text-[var(--color-fg)]">
        {!isSuccess ? "Analysis failed" : instant ? "Saved report loaded" : "Analysis complete"}
      </h2>
      <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
        {companyName || "Company"}
        {ticker ? <span className="ml-1.5">· {ticker}</span> : null}
      </p>

      {instant ? (
        <p className="mt-3 max-w-xs text-[12px] leading-relaxed text-[var(--color-fg-muted)]">
          Showing the last saved analysis — nothing was re-run. Use{" "}
          <strong>Run new analysis</strong> for a fresh one (~10 min).
        </p>
      ) : (
        <p
          className="mt-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]"
          data-numeric
        >
          {isSuccess ? "Completed in" : "Stopped after"}{" "}
          {formatElapsed(completion.totalElapsedMs)}
        </p>
      )}

      {isSuccess && !instant && completion.diff ? (
        <DiffStats diff={completion.diff} />
      ) : null}

      {!isSuccess && completion.error ? (
        <p className="mt-4 w-full rounded-[var(--radius-control)] bg-[var(--color-risk-50)] px-3 py-2 text-left text-[12px] leading-relaxed text-[var(--color-risk-700)]">
          {completion.error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={onClose}
        className="focus-ring mt-5 inline-flex h-9 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border)] bg-white px-4 text-sm font-medium text-[var(--color-fg)] transition hover:bg-[var(--color-mist-50)]"
      >
        Close
      </button>
    </div>
  );
}

function DiffStats({ diff }: { diff: MunsDiff }) {
  if (diff.isFirstLoad) {
    return (
      <div className="mt-4 grid w-full grid-cols-1 gap-2">
        <StatRow label="Sections loaded" value={diff.sectionsAdded.length} />
      </div>
    );
  }

  return (
    <div className="mt-4 grid w-full grid-cols-3 gap-2">
      <StatRow label="Updated" value={diff.sectionsUpdated.length} highlight />
      <StatRow label="New" value={diff.sectionsAdded.length} />
      <StatRow label="Unchanged" value={diff.sectionsUnchanged.length} />
    </div>
  );
}

function StatRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-[var(--radius-control)] border px-3 py-2 ${
        highlight
          ? "border-[var(--color-good-100)] bg-[var(--color-good-50)]"
          : "border-[var(--color-border)] bg-[var(--color-surface-muted)]"
      }`}
    >
      <p
        className="text-xl font-semibold tracking-tight text-[var(--color-fg)]"
        data-numeric
      >
        {value}
      </p>
      <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--color-fg-subtle)]">
        {label}
      </p>
    </div>
  );
}

function ActiveDot() {
  return (
    <span className="block h-2 w-2 animate-pulse rounded-full bg-[var(--color-good-600)]" />
  );
}

function BigCheck() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none">
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BigCross() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none">
      <path
        d="M7 7l10 10M17 7L7 17"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
