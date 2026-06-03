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
  const { identity, status, progress, logs } = state;

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

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

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
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-8 sm:px-6"
      style={{
        background:
          "radial-gradient(1200px 600px at 85% -10%, rgba(22,119,111,0.10), transparent 60%), radial-gradient(900px 500px at -10% 110%, rgba(50,78,122,0.10), transparent 60%), var(--color-mist-50)",
      }}
    >
      <div className="relative z-10 w-full max-w-2xl">
        <article className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-[0_24px_48px_-24px_rgba(10,20,34,0.25),0_2px_8px_rgba(10,20,34,0.06)]">
          <CardHeader />

          <div className="px-6 pb-2 pt-5 sm:px-7">
            {isLoading ? (
              <ProgressBody
                companyName={identity.name}
                ticker={identity.ticker}
                elapsedMs={elapsedMs}
                logs={logs}
              />
            ) : showSuccess ? (
              <SuccessBody
                companyName={identity.name}
                ticker={identity.ticker}
                onView={handleViewDashboard}
              />
            ) : (
              <FormBody
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

          <div className="border-t border-[var(--color-border)] bg-[var(--color-mist-50)]/60 px-6 py-4 sm:px-7">
            <RecentSection
              entries={entries}
              now={now}
              disabled={isLoading || showSuccess}
              onPick={handleHistoryClick}
            />
          </div>
        </article>

        <p className="mt-4 text-center text-[11px] text-[var(--color-fg-subtle)]">
          Governance &amp; Forensic Scorecard · MUNS-powered
        </p>
      </div>
    </div>
  );
}

function CardHeader() {
  return (
    <header className="relative overflow-hidden px-6 py-5 sm:px-7">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(120deg, var(--color-navy-800) 0%, var(--color-navy-700) 50%, var(--color-teal-600) 100%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage:
            "radial-gradient(ellipse at 80% 30%, rgba(0,0,0,0.6), transparent 70%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at 80% 30%, rgba(0,0,0,0.6), transparent 70%)",
        }}
      />
      <div className="relative flex items-center justify-between gap-3 text-white">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <LivePulse />
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/80">
              Buy-side analytics · MUNS-powered
            </span>
          </div>
          <h1 className="mt-1.5 text-[19px] font-semibold tracking-tight sm:text-xl">
            Governance &amp; Forensic Scorecard
          </h1>
        </div>
      </div>
    </header>
  );
}

function FormBody({
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
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-[var(--color-fg)]">
          Choose a company to analyse
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-fg-muted)]">
          Search by name or ticker. We&apos;ll spin up the MUNS agent and
          stream progress here.
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-[var(--radius-control)] border border-[var(--color-risk-100)] bg-[var(--color-risk-50)] px-3 py-2.5 text-sm"
        >
          <span
            aria-hidden
            className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-risk-500)] text-[11px] font-bold text-white"
          >
            !
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[var(--color-risk-700)]">
              Last run failed
            </p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--color-risk-700)]/90">
              {error}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
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
            className="focus-ring h-10 w-full rounded-[var(--radius-control)] border border-[var(--color-border)] bg-white px-3 font-mono text-sm uppercase tracking-wide text-[var(--color-fg)] placeholder:text-[var(--color-mist-300)]"
          />
        </Field>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-[11.5px] text-[var(--color-fg-muted)]">
          <ClockIcon />
          <span>
            Typical run time <strong>7–9 minutes</strong>
          </span>
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={!canRun}
          className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgba(22,119,111,0.55)] transition disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
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
  );
}

function ProgressBody({
  companyName,
  ticker,
  elapsedMs,
  logs,
}: {
  companyName: string;
  ticker: string;
  elapsedMs: number;
  logs: string[];
}) {
  const phaseIdx = currentPhaseIndex(elapsedMs);
  const percent = progressPercent(elapsedMs, false);
  const activePhase = REFRESH_PHASES[phaseIdx];

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <SpinnerLg />
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-[var(--color-teal-700)]">
            Running analysis
          </p>
          <p className="mt-0.5 truncate text-[15px] font-semibold tracking-tight text-[var(--color-fg)]">
            {companyName || "Company"}
            {ticker ? (
              <span className="ml-2 rounded-md bg-[var(--color-teal-50)] px-1.5 py-0.5 font-mono text-[12px] font-semibold text-[var(--color-teal-700)]">
                {ticker}
              </span>
            ) : null}
          </p>
        </div>
        <span data-numeric className="text-sm font-semibold text-[var(--color-fg)]">
          {formatElapsed(elapsedMs)}
        </span>
      </div>

      <div>
        <div
          role="progressbar"
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-mist-100)]"
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
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-[var(--color-fg-muted)]">
          <span className="truncate">
            {activePhase ? activePhase.label : "Working on it…"}
          </span>
          <span data-numeric className="shrink-0 font-semibold text-[var(--color-fg)]">
            {Math.round(percent)}%
          </span>
        </div>
      </div>

      <ol className="grid grid-cols-7 gap-1.5">
        {REFRESH_PHASES.map((phase, i) => {
          const phaseStatus =
            i < phaseIdx ? "done" : i === phaseIdx ? "active" : "pending";
          return (
            <li
              key={phase.id}
              title={phase.label}
              aria-label={phase.label}
              className={`h-1.5 rounded-full ${
                phaseStatus === "done"
                  ? "bg-[var(--color-good-500)]"
                  : phaseStatus === "active"
                    ? "bg-[var(--color-teal-500)]"
                    : "bg-[var(--color-mist-200)]"
              }`}
            />
          );
        })}
      </ol>

      {logs.length > 0 ? <LiveLogs logs={logs} /> : null}

      <p className="text-[11.5px] leading-relaxed text-[var(--color-fg-muted)]">
        Leave this tab open — the dashboard will appear automatically when the
        analysis lands.
      </p>
    </div>
  );
}

function LiveLogs({ logs }: { logs: string[] }) {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [logs.length]);
  return (
    <div className="rounded-lg border border-[#1e2a3d] bg-[#0b1220] p-2.5">
      <p className="mb-1 text-[9.5px] font-bold uppercase tracking-[0.16em] text-[#5eead4]">
        Live log
      </p>
      <div className="max-h-32 overflow-y-auto">
        <ul className="space-y-0.5 font-mono text-[11px] leading-relaxed text-[#e6ebf2]">
          {logs.map((line, i) => (
            <li key={i} className="[overflow-wrap:anywhere]">
              {line}
            </li>
          ))}
        </ul>
        <div ref={endRef} />
      </div>
    </div>
  );
}

function SuccessBody({
  companyName,
  ticker,
  onView,
}: {
  companyName: string;
  ticker: string;
  onView: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-3 text-center">
      <span
        aria-hidden
        className="relative inline-flex h-14 w-14 items-center justify-center rounded-full text-white shadow-[0_12px_32px_-8px_rgba(47,156,80,0.55)]"
        style={{
          backgroundImage:
            "linear-gradient(135deg, var(--color-good-500), var(--color-teal-600))",
        }}
      >
        <span className="absolute inset-0 animate-ping rounded-full bg-[var(--color-good-500)]/30" />
        <svg viewBox="0 0 24 24" className="relative h-7 w-7" fill="none">
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
        <p className="text-[15px] font-semibold tracking-tight text-[var(--color-fg)]">
          Refresh complete
        </p>
        <p className="mt-0.5 text-xs text-[var(--color-fg-muted)]">
          {companyName || "Company"}
          {ticker ? <span className="ml-1.5">· {ticker}</span> : null}
          {" — "}live dashboard ready.
        </p>
      </div>
      <button
        type="button"
        onClick={onView}
        className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgba(22,119,111,0.55)] transition"
        style={{
          backgroundImage:
            "linear-gradient(135deg, var(--color-teal-500), var(--color-teal-600))",
        }}
      >
        View dashboard
        <ArrowIcon />
      </button>
    </div>
  );
}

function RecentSection({
  entries,
  now,
  disabled,
  onPick,
}: {
  entries: RefreshHistoryEntry[];
  now: number;
  disabled: boolean;
  onPick: (e: RefreshHistoryEntry) => void;
}) {
  return (
    <div>
      <header className="mb-2 flex items-center justify-between">
        <h3 className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-[var(--color-fg-muted)]">
          Recent refreshes
        </h3>
        {entries.length > 0 ? (
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--color-fg-subtle)]">
            {entries.length} stored locally
          </span>
        ) : null}
      </header>

      {entries.length === 0 ? (
        <p className="py-2 text-xs text-[var(--color-fg-subtle)]">
          No recent refreshes yet. Once you run an analysis, your companies
          will appear here for one-click re-runs.
        </p>
      ) : (
        <ul role="list" className="-mx-1.5 max-h-56 overflow-y-auto">
          {entries.map((entry) => (
            <li key={entry.ticker}>
              <HistoryRow
                entry={entry}
                now={now}
                disabled={disabled}
                onClick={() => onPick(entry)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HistoryRow({
  entry,
  now,
  disabled,
  onClick,
}: {
  entry: RefreshHistoryEntry;
  now: number;
  disabled: boolean;
  onClick: () => void;
}) {
  const isError = entry.lastOutcome === "error";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="focus-ring group flex w-full items-center gap-3 rounded-lg px-1.5 py-2 text-left transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
    >
      <span
        aria-hidden
        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isError
            ? "bg-[var(--color-risk-50)] text-[var(--color-risk-600)]"
            : "bg-[var(--color-teal-50)] text-[var(--color-teal-700)]"
        }`}
      >
        {isError ? <FailIcon /> : <CheckIcon />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[13.5px] font-medium text-[var(--color-fg)]">
            {entry.name}
          </p>
          <span
            className="shrink-0 rounded-md bg-[var(--color-mist-100)] px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-fg-muted)]"
            data-numeric
          >
            {entry.ticker}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-[var(--color-fg-muted)]">
          {isError ? "Last attempt failed" : "Refreshed"}{" "}
          {formatRelativeTime(entry.lastRefreshedAt, now)}
        </p>
      </div>
      <span
        aria-hidden
        className="shrink-0 text-[var(--color-fg-subtle)] opacity-0 transition group-hover:opacity-100 group-hover:text-[var(--color-teal-600)] group-focus-visible:opacity-100"
      >
        <ArrowIcon />
      </span>
    </button>
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
    <label className="flex flex-col gap-1.5">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--color-fg-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function LivePulse() {
  return (
    <span className="relative inline-flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-teal-300)] opacity-70" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-teal-300)]" />
    </span>
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

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
      <path
        d="M3.5 8.5L7 12l5.5-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FailIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
      <path
        d="M5 5l6 6M11 5l-6 6"
        stroke="currentColor"
        strokeWidth="2"
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
      className="h-6 w-6 animate-spin text-[var(--color-teal-600)]"
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
