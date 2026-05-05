"use client";

import { useEffect, useRef, useState } from "react";
import { CompanySearchInput } from "@/components/header/CompanySearchInput";
import { useCompany } from "@/lib/state/CompanyContext";
import { useToast } from "@/lib/state/ToastContext";
import {
  formatRelativeTime,
  useRefreshHistory,
} from "@/lib/refresh/history";
import type { RefreshHistoryEntry } from "@/lib/refresh/history";
import {
  REFRESH_PHASES,
  currentPhaseIndex,
  formatElapsed,
  progressPercent,
} from "@/lib/refresh/phases";
import type {
  CountryCode,
  ExchangeCode,
} from "@/lib/types/company";

const SUCCESS_HOLD_MS = 2200;

export function SelectionPanel() {
  const { state, setIdentity, refresh, unlockDashboard } = useCompany();
  const { entries } = useRefreshHistory();
  const { push } = useToast();
  const { identity, status, progress } = state;

  const isLoading = status === "loading";
  const showError =
    !isLoading && progress.outcome === "error" && progress.error;
  const showSuccess =
    !isLoading && progress.outcome === "success";

  const [now, setNow] = useState(() => Date.now());
  const prevStatusRef = useRef(status);
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isLoading || !progress.startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isLoading, progress.startedAt]);

  const elapsedMs =
    isLoading && progress.startedAt ? Math.max(0, now - progress.startedAt) : 0;

  useEffect(() => {
    const prev = prevStatusRef.current;
    if (prev === "loading" && status === "ready") {
      unlockTimerRef.current = setTimeout(unlockDashboard, SUCCESS_HOLD_MS);
    }
    prevStatusRef.current = status;
    return () => {
      if (unlockTimerRef.current) {
        clearTimeout(unlockTimerRef.current);
        unlockTimerRef.current = null;
      }
    };
  }, [status, unlockDashboard]);

  const handleRun = () => {
    if (!identity.name.trim() || !identity.ticker.trim()) {
      push({
        tone: "warning",
        title: "Company details required",
        description: "Pick a company and confirm its ticker before running.",
      });
      return;
    }
    void refresh();
  };

  const handleHistoryClick = (entry: RefreshHistoryEntry) => {
    if (isLoading) return;
    setIdentity({
      name: entry.name,
      ticker: entry.ticker,
      exchange: entry.exchange,
      country: entry.country,
    });
    setTimeout(() => void refresh(), 0);
  };

  const handleViewDashboard = () => {
    if (unlockTimerRef.current) {
      clearTimeout(unlockTimerRef.current);
      unlockTimerRef.current = null;
    }
    unlockDashboard();
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-surface)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]">
        <div className="mx-auto flex max-w-screen-2xl items-end justify-between gap-4 px-6 py-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
              Buy-side analytics
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-[22px]">
              Governance &amp; Forensic Scorecard
            </h1>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-[0_1px_2px_rgba(10,20,34,0.04)]">
          <div className="border-b border-[var(--color-border)] px-6 py-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
              Step 1
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--color-fg)]">
              Choose a company to analyse
            </h2>
            <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
              Search a listed company, run the MUNS agent, and the live
              governance dashboard will open here.
            </p>
          </div>

          <div className="px-6 py-6">
            {isLoading ? (
              <ProgressView
                companyName={identity.name}
                ticker={identity.ticker}
                elapsedMs={elapsedMs}
              />
            ) : showSuccess ? (
              <SuccessView
                companyName={identity.name}
                ticker={identity.ticker}
                onView={handleViewDashboard}
              />
            ) : (
              <SelectionForm
                identity={identity}
                onChangeName={(name) => setIdentity({ name })}
                onChangeTicker={(ticker) =>
                  setIdentity({ ticker: ticker.toUpperCase() })
                }
                onPickSuggestion={(s) =>
                  setIdentity({
                    name: s.name,
                    ticker: s.ticker.toUpperCase(),
                    exchange: s.exchange as ExchangeCode | "",
                    country: s.country as CountryCode | "",
                  })
                }
                onRun={handleRun}
                error={showError ? progress.error : null}
              />
            )}
          </div>
        </div>

        {entries.length > 0 ? (
          <RecentList
            entries={entries}
            disabled={isLoading}
            onPick={handleHistoryClick}
          />
        ) : null}
      </main>

      <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface-raised)] py-4">
        <div className="mx-auto max-w-screen-2xl px-6 text-xs text-[var(--color-fg-subtle)]">
          <span>Governance &amp; Forensic Scorecard</span>
        </div>
      </footer>
    </div>
  );
}

function SelectionForm({
  identity,
  onChangeName,
  onChangeTicker,
  onPickSuggestion,
  onRun,
  error,
}: {
  identity: { name: string; ticker: string };
  onChangeName: (v: string) => void;
  onChangeTicker: (v: string) => void;
  onPickSuggestion: (s: import("@/lib/types/search").CompanySuggestion) => void;
  onRun: () => void;
  error: string | null;
}) {
  const canRun = Boolean(identity.name.trim() && identity.ticker.trim());

  return (
    <div className="grid gap-4">
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-[var(--radius-control)] border border-[var(--color-risk-100)] bg-[var(--color-risk-50)] px-3 py-2.5 text-sm text-[var(--color-risk-700)]"
        >
          <span
            aria-hidden
            className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-risk-500)] text-[11px] font-bold text-white"
          >
            !
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-[var(--color-risk-700)]">
              Last run failed
            </p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--color-risk-700)]/90">
              {error}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Company name">
          <CompanySearchInput
            value={identity.name}
            onTextChange={onChangeName}
            onPick={onPickSuggestion}
            placeholder="e.g. Asian Paints"
          />
        </Field>
        <Field label="Ticker">
          <input
            value={identity.ticker}
            onChange={(e) => onChangeTicker(e.target.value)}
            placeholder="ASIANPAINT"
            spellCheck={false}
            className="focus-ring h-10 w-full rounded-[var(--radius-control)] border border-[var(--color-border)] bg-white px-3 text-sm uppercase tracking-wide text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)]"
          />
        </Field>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-[var(--color-fg-subtle)]">
          The MUNS agent typically takes 7–9 minutes per company.
        </p>
        <button
          type="button"
          onClick={onRun}
          disabled={!canRun}
          className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-brand)] px-5 text-sm font-medium text-[var(--color-fg-inverse)] shadow-sm transition hover:bg-[var(--color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {error ? "Run again" : "Run analysis"}
        </button>
      </div>
    </div>
  );
}

function ProgressView({
  companyName,
  ticker,
  elapsedMs,
}: {
  companyName: string;
  ticker: string;
  elapsedMs: number;
}) {
  const phaseIdx = currentPhaseIndex(elapsedMs);
  const percent = progressPercent(elapsedMs, false);

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-fg-subtle)]">
            Running MUNS analysis
          </p>
          <h3 className="mt-1 truncate text-base font-semibold tracking-tight text-[var(--color-fg)]">
            {companyName || "Company"}
            {ticker ? (
              <span className="ml-2 text-[var(--color-fg-subtle)]">
                · {ticker}
              </span>
            ) : null}
          </h3>
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

      <ul className="mt-5 grid gap-2">
        {REFRESH_PHASES.map((phase, i) => {
          const phaseStatus =
            i < phaseIdx ? "done" : i === phaseIdx ? "active" : "pending";
          return (
            <li
              key={phase.id}
              className={`flex items-start gap-3 text-sm ${
                phaseStatus === "pending"
                  ? "text-[var(--color-fg-subtle)]"
                  : "text-[var(--color-fg)]"
              }`}
            >
              <span
                aria-hidden
                className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  phaseStatus === "done"
                    ? "bg-[var(--color-good-500)] text-white"
                    : phaseStatus === "active"
                      ? "bg-[var(--color-good-50)] text-[var(--color-good-700)] ring-2 ring-[var(--color-good-500)]"
                      : "bg-[var(--color-mist-100)] text-[var(--color-fg-subtle)]"
                }`}
              >
                {phaseStatus === "done" ? (
                  "✓"
                ) : phaseStatus === "active" ? (
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
        Leave this tab open — the dashboard will appear automatically when the
        analysis completes.
      </p>
    </div>
  );
}

function SuccessView({
  companyName,
  ticker,
  onView,
}: {
  companyName: string;
  ticker: string;
  onView: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <span
        aria-hidden
        className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-good-50)] text-[var(--color-good-600)]"
      >
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none">
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <h3 className="mt-4 text-lg font-semibold tracking-tight text-[var(--color-fg)]">
        Refresh complete
      </h3>
      <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
        {companyName || "Company"}
        {ticker ? <span className="ml-1.5">· {ticker}</span> : null}
      </p>
      <p className="mt-3 text-xs text-[var(--color-fg-subtle)]">
        Opening the live dashboard…
      </p>
      <button
        type="button"
        onClick={onView}
        className="focus-ring mt-5 inline-flex h-10 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-brand)] px-5 text-sm font-medium text-[var(--color-fg-inverse)] shadow-sm transition hover:bg-[var(--color-brand-hover)]"
      >
        View dashboard
      </button>
    </div>
  );
}

function RecentList({
  entries,
  disabled,
  onPick,
}: {
  entries: RefreshHistoryEntry[];
  disabled: boolean;
  onPick: (e: RefreshHistoryEntry) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="mt-6 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-[0_1px_2px_rgba(10,20,34,0.04)]">
      <header className="border-b border-[var(--color-border)] px-6 py-4">
        <h3 className="text-sm font-semibold tracking-tight text-[var(--color-fg)]">
          Recent refreshes
        </h3>
        <p className="mt-0.5 text-xs text-[var(--color-fg-subtle)]">
          Click a company to re-run analysis with fresh data.
        </p>
      </header>
      <ul role="list" className="divide-y divide-[var(--color-border)]">
        {entries.map((entry) => (
          <li key={entry.ticker}>
            <button
              type="button"
              onClick={() => onPick(entry)}
              disabled={disabled}
              className="focus-ring flex w-full items-center justify-between gap-3 px-6 py-3 text-left transition hover:bg-[var(--color-mist-50)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-[var(--color-fg)]">
                    {entry.name}
                  </p>
                  {entry.lastOutcome === "error" ? (
                    <span className="shrink-0 rounded-full bg-[var(--color-risk-50)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-risk-700)]">
                      Failed
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-[var(--color-fg-subtle)]">
                  Last refreshed {formatRelativeTime(entry.lastRefreshedAt, now)}
                </p>
              </div>
              <span
                className="shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-[var(--color-fg-muted)]"
                data-numeric
              >
                {entry.ticker}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-fg-subtle)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function ActiveDot() {
  return (
    <span className="block h-2 w-2 animate-pulse rounded-full bg-[var(--color-good-600)]" />
  );
}
