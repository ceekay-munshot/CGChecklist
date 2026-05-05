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
  const showSuccess = !isLoading && progress.outcome === "success";

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
    <div
      className="relative flex min-h-screen flex-col overflow-hidden"
      style={{
        background:
          "radial-gradient(1200px 600px at 85% -10%, rgba(22,119,111,0.10), transparent 60%), radial-gradient(900px 500px at -10% 100%, rgba(50,78,122,0.10), transparent 60%), var(--color-mist-50)",
      }}
    >
      <Hero />

      <main className="relative z-10 mx-auto w-full max-w-4xl flex-1 px-4 pb-16 sm:px-6">
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
            historyCount={entries.length}
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

        {entries.length > 0 ? (
          <RecentList
            entries={entries}
            disabled={isLoading}
            onPick={handleHistoryClick}
          />
        ) : (
          <EmptyHistory />
        )}
      </main>

      <footer className="relative z-10 border-t border-[var(--color-border)] bg-[var(--color-surface-raised)]/80 py-4 backdrop-blur">
        <div className="mx-auto max-w-4xl px-6 text-xs text-[var(--color-fg-subtle)]">
          Governance &amp; Forensic Scorecard
        </div>
      </footer>
    </div>
  );
}

function Hero() {
  return (
    <header className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(120deg, var(--color-navy-800) 0%, var(--color-navy-700) 40%, var(--color-teal-600) 100%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          maskImage:
            "radial-gradient(ellipse at 70% 30%, rgba(0,0,0,0.6), transparent 70%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at 70% 30%, rgba(0,0,0,0.6), transparent 70%)",
        }}
      />
      <div className="relative mx-auto flex max-w-4xl flex-col gap-3 px-6 py-10 text-white sm:py-14">
        <div className="flex items-center gap-2">
          <LivePulse />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
            Buy-side analytics · MUNS-powered
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
          Governance &amp; Forensic Scorecard
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-white/80 sm:text-[15px]">
          Run a live governance &amp; forensic analysis on any listed company.
          Pick a name below, hit run, and the dashboard opens with fresh
          findings the moment they land.
        </p>
        <div className="mt-1 flex flex-wrap gap-2">
          <HeroChip>Live filings</HeroChip>
          <HeroChip>8 governance sections</HeroChip>
          <HeroChip>Audit &amp; compliance signals</HeroChip>
        </div>
      </div>
    </header>
  );
}

function HeroChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/90 backdrop-blur">
      {children}
    </span>
  );
}

function LivePulse() {
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-teal-300)] opacity-70" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--color-teal-300)]" />
    </span>
  );
}

function PanelCard({
  step,
  title,
  description,
  children,
  accent = true,
}: {
  step?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <section
      className="relative -mt-8 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-[0_24px_48px_-24px_rgba(10,20,34,0.25),0_2px_8px_rgba(10,20,34,0.06)]"
    >
      {accent ? (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1"
          style={{
            background:
              "linear-gradient(180deg, var(--color-teal-400), var(--color-teal-600))",
          }}
        />
      ) : null}
      <div className="px-6 pb-6 pt-6 sm:px-8">
        {step ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-teal-50)] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.16em] text-[var(--color-teal-700)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-teal-500)]" />
            {step}
          </span>
        ) : null}
        <h2 className="mt-3 text-xl font-semibold tracking-tight text-[var(--color-fg)]">
          {title}
        </h2>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm text-[var(--color-fg-muted)]">
            {description}
          </p>
        ) : null}
        <div className="mt-6">{children}</div>
      </div>
    </section>
  );
}

function SelectionForm({
  identity,
  historyCount,
  onChangeName,
  onChangeTicker,
  onPickSuggestion,
  onRun,
  error,
}: {
  identity: { name: string; ticker: string };
  historyCount: number;
  onChangeName: (v: string) => void;
  onChangeTicker: (v: string) => void;
  onPickSuggestion: (s: import("@/lib/types/search").CompanySuggestion) => void;
  onRun: () => void;
  error: string | null;
}) {
  const canRun = Boolean(identity.name.trim() && identity.ticker.trim());

  return (
    <PanelCard
      step="Step 1 · Choose company"
      title="Pick a listed company to analyse"
      description="Search by name or ticker. We'll spin up the MUNS agent and stream progress here while it works."
    >
      <div className="grid gap-4">
        {error ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-[var(--radius-control)] border border-[var(--color-risk-100)] bg-[var(--color-risk-50)] px-3.5 py-3 text-sm"
          >
            <span
              aria-hidden
              className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-risk-500)] text-[12px] font-bold text-white"
            >
              !
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[var(--color-risk-700)]">
                Last run failed
              </p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--color-risk-700)]/90">
                {error}
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
          <Field label="Company name" hint="Start typing — we'll suggest matches">
            <CompanySearchInput
              value={identity.name}
              onTextChange={onChangeName}
              onPick={onPickSuggestion}
              placeholder="e.g. Asian Paints"
            />
          </Field>
          <Field label="Ticker" hint="Auto-fills from search">
            <input
              value={identity.ticker}
              onChange={(e) => onChangeTicker(e.target.value)}
              placeholder="ASIANPAINT"
              spellCheck={false}
              className="focus-ring h-10 w-full rounded-[var(--radius-control)] border border-[var(--color-border)] bg-white px-3 font-mono text-sm uppercase tracking-wide text-[var(--color-fg)] placeholder:text-[var(--color-mist-300)]"
            />
          </Field>
        </div>

        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-[var(--color-fg-muted)]">
            <ClockIcon />
            <span>
              MUNS agent typically takes <strong>7–9 minutes</strong>
              {historyCount > 0 ? (
                <>
                  {" · "}
                  {historyCount} recent
                  {historyCount === 1 ? " run" : " runs"} below
                </>
              ) : null}
            </span>
          </div>
          <button
            type="button"
            onClick={onRun}
            disabled={!canRun}
            className="focus-ring group inline-flex h-11 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgba(22,119,111,0.55)] transition disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            style={{
              backgroundImage: canRun
                ? "linear-gradient(135deg, var(--color-teal-500) 0%, var(--color-teal-600) 100%)"
                : "linear-gradient(135deg, var(--color-mist-400), var(--color-mist-500))",
            }}
          >
            <PlayIcon />
            {error ? "Run again" : "Run analysis"}
            <ArrowIcon />
          </button>
        </div>
      </div>
    </PanelCard>
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
    <PanelCard
      step="Running"
      title={
        <span className="flex items-center gap-3">
          <SpinnerLg />
          Analysing {companyName || "company"}
          {ticker ? (
            <span className="rounded-md bg-[var(--color-teal-50)] px-2 py-0.5 font-mono text-sm text-[var(--color-teal-700)]">
              {ticker}
            </span>
          ) : null}
        </span>
      }
      description="The MUNS agent is reading filings, cross-checking disclosures, and scoring governance signals. Leave this tab open."
    >
      <div className="grid gap-5">
        <div>
          <div className="flex items-center justify-between text-xs text-[var(--color-fg-muted)]">
            <span className="font-medium">In progress</span>
            <span data-numeric className="font-semibold text-[var(--color-fg)]">
              {formatElapsed(elapsedMs)} · {Math.round(percent)}%
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={Math.round(percent)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-mist-100)]"
          >
            <div
              className="h-full rounded-full transition-[width] duration-700 ease-out"
              style={{
                width: `${percent}%`,
                backgroundImage:
                  "linear-gradient(90deg, var(--color-teal-400), var(--color-teal-600))",
              }}
            />
          </div>
        </div>

        <ul className="grid gap-2.5">
          {REFRESH_PHASES.map((phase, i) => {
            const phaseStatus =
              i < phaseIdx ? "done" : i === phaseIdx ? "active" : "pending";
            return (
              <li
                key={phase.id}
                className={`flex items-center gap-3 rounded-[var(--radius-control)] border px-3 py-2.5 text-sm transition ${
                  phaseStatus === "active"
                    ? "border-[var(--color-teal-200)] bg-[var(--color-teal-50)] text-[var(--color-fg)]"
                    : phaseStatus === "done"
                      ? "border-[var(--color-good-100)] bg-[var(--color-good-50)]/60 text-[var(--color-fg)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-fg-subtle)]"
                }`}
              >
                <span
                  aria-hidden
                  className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    phaseStatus === "done"
                      ? "bg-[var(--color-good-500)] text-white"
                      : phaseStatus === "active"
                        ? "bg-[var(--color-teal-600)] text-white ring-4 ring-[var(--color-teal-100)]"
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
      </div>
    </PanelCard>
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
    <PanelCard step="Done" title="Refresh complete" accent={false}>
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <span
          aria-hidden
          className="relative inline-flex h-16 w-16 items-center justify-center rounded-full text-white shadow-[0_12px_32px_-8px_rgba(47,156,80,0.55)]"
          style={{
            backgroundImage:
              "linear-gradient(135deg, var(--color-good-500), var(--color-teal-600))",
          }}
        >
          <span className="absolute inset-0 animate-ping rounded-full bg-[var(--color-good-500)]/30" />
          <svg viewBox="0 0 24 24" className="relative h-8 w-8" fill="none">
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div>
          <p className="text-base font-semibold tracking-tight text-[var(--color-fg)]">
            {companyName || "Company"}
            {ticker ? (
              <span className="ml-2 rounded-md bg-[var(--color-teal-50)] px-2 py-0.5 font-mono text-[13px] text-[var(--color-teal-700)]">
                {ticker}
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Live governance dashboard is ready.
          </p>
        </div>
        <button
          type="button"
          onClick={onView}
          className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgba(22,119,111,0.55)] transition"
          style={{
            backgroundImage:
              "linear-gradient(135deg, var(--color-teal-500), var(--color-teal-600))",
          }}
        >
          View dashboard
          <ArrowIcon />
        </button>
      </div>
    </PanelCard>
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
    <section className="mt-8">
      <header className="mb-3 flex items-end justify-between gap-3 px-1">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-[var(--color-fg)]">
            Recent refreshes
          </h3>
          <p className="mt-0.5 text-xs text-[var(--color-fg-muted)]">
            Click any company to re-run the analysis with fresh data.
          </p>
        </div>
        <span className="rounded-full bg-[var(--color-mist-100)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-fg-muted)]">
          {entries.length} stored locally
        </span>
      </header>
      <ul role="list" className="grid gap-2.5">
        {entries.map((entry, idx) => (
          <li key={entry.ticker}>
            <HistoryItem
              entry={entry}
              now={now}
              disabled={disabled}
              accentIndex={idx}
              onClick={() => onPick(entry)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

const ACCENT_PALETTE = [
  ["var(--color-teal-500)", "var(--color-teal-600)"],
  ["var(--color-navy-500)", "var(--color-navy-700)"],
  ["var(--color-good-500)", "var(--color-teal-500)"],
  ["var(--color-warn-500)", "var(--color-warn-600)"],
  ["var(--color-teal-400)", "var(--color-navy-600)"],
];

function HistoryItem({
  entry,
  now,
  disabled,
  accentIndex,
  onClick,
}: {
  entry: RefreshHistoryEntry;
  now: number;
  disabled: boolean;
  accentIndex: number;
  onClick: () => void;
}) {
  const [from, to] = ACCENT_PALETTE[accentIndex % ACCENT_PALETTE.length];
  const initial = entry.name.trim().charAt(0).toUpperCase() || "?";
  const isError = entry.lastOutcome === "error";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="focus-ring group flex w-full items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-3 text-left shadow-[0_1px_2px_rgba(10,20,34,0.04)] transition hover:-translate-y-px hover:border-[var(--color-teal-200)] hover:shadow-[0_8px_20px_-12px_rgba(22,119,111,0.35)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:border-[var(--color-border)] disabled:hover:shadow-[0_1px_2px_rgba(10,20,34,0.04)]"
    >
      <span
        aria-hidden
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white shadow-[0_6px_16px_-8px_rgba(10,20,34,0.45)]"
        style={{
          backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
        }}
      >
        {initial}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-[var(--color-fg)]">
            {entry.name}
          </p>
          <span
            className="shrink-0 rounded-md bg-[var(--color-mist-100)] px-1.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--color-fg-muted)]"
            data-numeric
          >
            {entry.ticker}
          </span>
          {isError ? (
            <span className="shrink-0 rounded-full bg-[var(--color-risk-50)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-risk-700)]">
              Failed
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-[var(--color-good-50)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-good-700)]">
              Live
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
          Last refreshed{" "}
          <span className="font-medium text-[var(--color-fg)]">
            {formatRelativeTime(entry.lastRefreshedAt, now)}
          </span>
        </p>
      </div>
      <span
        aria-hidden
        className="shrink-0 text-[var(--color-fg-subtle)] transition group-hover:translate-x-0.5 group-hover:text-[var(--color-teal-600)]"
      >
        <ArrowIcon />
      </span>
    </button>
  );
}

function EmptyHistory() {
  return (
    <section className="mt-8 rounded-2xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-raised)]/60 px-6 py-8 text-center">
      <span
        aria-hidden
        className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-teal-50)] text-[var(--color-teal-600)]"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
          <path
            d="M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <h3 className="mt-3 text-sm font-semibold text-[var(--color-fg)]">
        No recent refreshes yet
      </h3>
      <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
        Once you run an analysis, your recent companies will show up here for
        one-click re-runs.
      </p>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-fg-muted)]">
          {label}
        </span>
        {hint ? (
          <span className="text-[10.5px] text-[var(--color-fg-subtle)]">
            {hint}
          </span>
        ) : null}
      </span>
      {children}
    </label>
  );
}

function ActiveDot() {
  return (
    <span className="block h-2 w-2 animate-pulse rounded-full bg-white" />
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
      <path d="M5 3.5a.5.5 0 0 1 .76-.43l7 4.5a.5.5 0 0 1 0 .86l-7 4.5A.5.5 0 0 1 5 12.5v-9z" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
      <path
        d="M3 8h10M9 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 4.5V8l2.5 1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SpinnerLg() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-5 w-5 animate-spin text-[var(--color-teal-600)]"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
