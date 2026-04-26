"use client";

import { useMemo } from "react";

import { RefreshButton } from "@/components/header/RefreshButton";
import { StatusBadge } from "@/components/header/StatusBadge";
import { COUNTRIES } from "@/lib/mock/countries";
import { EXCHANGES } from "@/lib/mock/exchanges";
import { useCompany } from "@/lib/state/CompanyContext";

const FIELD_LABEL_CLS =
  "block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]";
const FIELD_INPUT_CLS =
  "mt-1 h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)] " +
  "placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-teal-500)] focus:outline-none focus:ring-2 focus:ring-[var(--color-teal-100)]";

function formatRefreshedAt(iso: string | null): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CompanyHeader() {
  const {
    query,
    patchQuery,
    status,
    lastRefreshedAt,
    isRefreshing,
    refresh,
  } = useCompany();

  const lastRefreshedLabel = useMemo(
    () => formatRefreshedAt(lastRefreshedAt),
    [lastRefreshedAt]
  );

  const canRefresh = Boolean(
    query.name.trim() &&
      query.ticker.trim() &&
      query.exchangeCode &&
      query.countryCode
  );

  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--color-navy-800)] text-[var(--color-text-inverse)]">
            <span className="font-mono text-sm font-semibold tracking-tight">
              GFS
            </span>
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-[var(--color-text-primary)]">
              Governance &amp; Forensic Scorecard
            </h1>
            <p className="text-xs text-[var(--color-text-muted)]">
              Buy-side checklist · Governance · Beneish · Altman
            </p>
          </div>
        </div>

        <div className="flex flex-col items-start gap-2 lg:items-end">
          <StatusBadge status={status} />
          <p className="text-xs text-[var(--color-text-muted)]">
            Last refreshed:{" "}
            <span className="font-medium text-[var(--color-text-secondary)]">
              {lastRefreshedLabel}
            </span>
          </p>
        </div>
      </div>

      <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-muted)]">
        <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-4 px-6 py-4 md:grid-cols-12 md:items-end">
          <div className="md:col-span-4">
            <label htmlFor="company-name" className={FIELD_LABEL_CLS}>
              Company name
            </label>
            <input
              id="company-name"
              className={FIELD_INPUT_CLS}
              placeholder="e.g. Reliance Industries Ltd."
              value={query.name}
              onChange={(event) => patchQuery({ name: event.target.value })}
              autoComplete="off"
            />
          </div>

          <div className="md:col-span-2">
            <label htmlFor="company-ticker" className={FIELD_LABEL_CLS}>
              Ticker
            </label>
            <input
              id="company-ticker"
              className={FIELD_INPUT_CLS + " font-mono uppercase"}
              placeholder="e.g. RELIANCE"
              value={query.ticker}
              onChange={(event) =>
                patchQuery({ ticker: event.target.value.toUpperCase() })
              }
              autoComplete="off"
            />
          </div>

          <div className="md:col-span-2">
            <label htmlFor="company-exchange" className={FIELD_LABEL_CLS}>
              Exchange
            </label>
            <select
              id="company-exchange"
              className={FIELD_INPUT_CLS}
              value={query.exchangeCode}
              onChange={(event) =>
                patchQuery({ exchangeCode: event.target.value })
              }
            >
              <option value="">Select exchange…</option>
              {EXCHANGES.map((exchange) => (
                <option key={exchange.code} value={exchange.code}>
                  {exchange.code} — {exchange.label.replace(/^[A-Z]+ — /, "")}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="company-country" className={FIELD_LABEL_CLS}>
              Country
            </label>
            <select
              id="company-country"
              className={FIELD_INPUT_CLS}
              value={query.countryCode}
              onChange={(event) =>
                patchQuery({ countryCode: event.target.value })
              }
            >
              <option value="">Select country…</option>
              {COUNTRIES.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.label}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2 md:flex md:justify-end">
            <RefreshButton
              onRefresh={refresh}
              isRefreshing={isRefreshing}
              disabled={!canRefresh}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
