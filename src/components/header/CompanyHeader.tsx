"use client";

import { useCompany } from "@/lib/state/CompanyContext";
import { RefreshButton } from "@/components/header/RefreshButton";
import { StatusBadge } from "@/components/header/StatusBadge";
import { CompanySearchInput } from "@/components/header/CompanySearchInput";
import type {
  CountryCode,
  ExchangeCode,
} from "@/lib/types/company";

export function CompanyHeader() {
  const { state, setIdentity } = useCompany();
  const { identity, lastRefreshedAt } = state;

  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-4 px-6 py-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
            Buy-side analytics
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-[22px]">
            Governance &amp; Forensic Scorecard
          </h1>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-xl lg:flex-1">
          <Field label="Company name">
            <CompanySearchInput
              value={identity.name}
              onTextChange={(name) => setIdentity({ name })}
              onPick={(s) =>
                setIdentity({
                  name: s.name,
                  ticker: s.ticker.toUpperCase(),
                  exchange: s.exchange as ExchangeCode | "",
                  country: s.country as CountryCode | "",
                })
              }
              placeholder="e.g. Asian Paints"
            />
          </Field>

          <Field label="Ticker">
            <input
              value={identity.ticker}
              onChange={(e) =>
                setIdentity({ ticker: e.target.value.toUpperCase() })
              }
              placeholder="ASIANPAINT"
              spellCheck={false}
              className="focus-ring h-10 w-full rounded-[var(--radius-control)] border border-[var(--color-border)] bg-white px-3 text-sm uppercase tracking-wide text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)]"
            />
          </Field>
        </div>

        <div className="flex items-center justify-between gap-3 lg:flex-col lg:items-end lg:justify-end">
          <div className="flex flex-col items-start gap-1 lg:items-end">
            <StatusBadge />
            <p className="text-xs text-[var(--color-fg-subtle)]">
              {lastRefreshedAt
                ? `Last refreshed ${formatTime(lastRefreshedAt)}`
                : "Never refreshed"}
            </p>
          </div>
          <RefreshButton />
        </div>
      </div>
    </header>
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

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  });
}
