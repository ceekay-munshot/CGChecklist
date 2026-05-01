"use client";

import { useState } from "react";
import type { GovernanceRow } from "@/lib/types/governance";
import { useCompany } from "@/lib/state/CompanyContext";

interface Props {
  rows: GovernanceRow[];
  fileBaseName?: string;
}

export function GovernanceExportButton({ rows, fileBaseName }: Props) {
  const { state } = useCompany();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    try {
      const { buildGovernanceWorkbook } = await import(
        "@/lib/services/exports/governanceWorkbook"
      );

      const isLive = Boolean(state.munsRaw && !state.munsError);
      const reportDate = state.lastRefreshedAt
        ? new Date(state.lastRefreshedAt)
        : new Date();

      const buffer = await buildGovernanceWorkbook({
        rows,
        company: state.identity.name || "Sample Company",
        ticker: state.identity.ticker || "—",
        exchange: state.identity.exchange || "—",
        country: state.identity.country || "—",
        reportDate,
        dataSource: isLive ? "Live MUNS analysis" : "Sample data",
      });

      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const stamp = reportDate.toISOString().slice(0, 10);
      const safeName = (state.identity.name || "company")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const baseName =
        fileBaseName || `${safeName || "company"}-governance-${stamp}`;

      const link = document.createElement("a");
      link.href = url;
      link.download = `${baseName}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="focus-ring inline-flex h-9 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] px-3.5 text-sm font-medium text-[var(--color-fg)] shadow-sm transition hover:bg-[var(--color-mist-50)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <DownloadIcon />
      {busy ? "Exporting…" : "Export to Excel"}
    </button>
  );
}

function DownloadIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 2.5v8" />
      <path d="m4.5 7 3.5 3.5L11.5 7" />
      <path d="M3 12.5v.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-.5" />
    </svg>
  );
}
