"use client";

import { useEffect, useState } from "react";
import { useCompany } from "@/lib/state/CompanyContext";
import {
  REFRESH_PHASES,
  currentPhaseIndex,
  formatElapsed,
  progressPercent,
} from "@/lib/refresh/phases";

export function RefreshProgressModal() {
  const { state } = useCompany();
  const isOpen = state.status === "loading";
  const startedAt = state.progress.startedAt;

  const [, setTick] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [isOpen]);

  if (!isOpen) return null;

  const elapsedMs = startedAt ? Math.max(0, Date.now() - startedAt) : 0;
  const phaseIdx = currentPhaseIndex(elapsedMs);
  const percent = progressPercent(elapsedMs, false);
  const identity = state.identity;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Refreshing governance analysis"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
    >
      <div className="absolute inset-0 bg-[var(--color-navy-900)]/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-6 shadow-[0_24px_48px_rgba(10,20,34,0.18)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
              Refreshing governance analysis
            </p>
            <h2 className="mt-1 text-base font-semibold tracking-tight text-[var(--color-fg)]">
              {identity.name || "Company"}
              {identity.ticker ? (
                <span className="ml-2 text-[var(--color-fg-subtle)]">
                  · {identity.ticker}
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
          The MUNS agent typically takes <strong>7–9 minutes</strong> to compile
          a full governance analysis. You can leave this tab open — we&apos;ll
          update the dashboard the moment results land.
        </p>
      </div>
    </div>
  );
}

function ActiveDot() {
  return (
    <span className="block h-2 w-2 animate-pulse rounded-full bg-[var(--color-good-600)]" />
  );
}
