"use client";

import { useState } from "react";
import { GOVERNANCE_CHECKLIST } from "@/lib/governance/checklist";
import {
  calculateGovernanceScore,
  getGovernanceSectionSummaries,
} from "@/lib/services/calculations/governanceCalc";
import type { GovernanceRow } from "@/lib/types/governance";

interface Props {
  rows: GovernanceRow[];
  fileBaseName?: string;
}

const SHEET_NAME_LIMIT = 31;

function safeSheetName(name: string): string {
  // Excel forbids : \ / ? * [ ] and a 31-char limit.
  return name.replace(/[\\/?*[\]:]/g, " ").slice(0, SHEET_NAME_LIMIT);
}

export function GovernanceExportButton({ rows, fileBaseName = "corporate-governance-score" }: Props) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const totals = calculateGovernanceScore(rows);
      const summaries = getGovernanceSectionSummaries(rows);

      const wb = XLSX.utils.book_new();

      const summaryAoa: (string | number)[][] = [
        ["Corporate Governance Score"],
        [],
        ["Overall Governance Score (%)", totals.overallScorePercent],
        ["Total Score", totals.totalScore],
        ["Total Max Score", totals.totalMaxScore],
        ["Governance Rating", totals.rating],
        ["Red Flag Rows", totals.redFlagRows],
        ["Low Confidence Rows", totals.lowConfidenceRows],
        ["Checklist Rows", totals.rowCount],
        [],
        ["Section Summary"],
        [
          "Section",
          "Score",
          "Max Score",
          "Score %",
          "Rating",
          "Red Flags",
          "Low Confidence",
        ],
        ...summaries.map((s) => [
          s.title,
          s.score,
          s.maxScore,
          s.scorePercent,
          s.rating,
          s.redFlags,
          s.lowConfidence,
        ]),
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryAoa);
      summarySheet["!cols"] = [
        { wch: 32 },
        { wch: 10 },
        { wch: 12 },
        { wch: 10 },
        { wch: 12 },
        { wch: 12 },
        { wch: 16 },
      ];
      XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

      for (const section of GOVERNANCE_CHECKLIST) {
        const sectionRows = rows.filter((r) => r.sectionId === section.sectionId);
        if (sectionRows.length === 0) continue;

        const subtotalScore = sectionRows.reduce((a, r) => a + r.score, 0);
        const subtotalMax = sectionRows.reduce((a, r) => a + r.maxScore, 0);

        const aoa: (string | number)[][] = [
          [section.title],
          [],
          [
            "Particulars",
            "Response",
            "Score",
            "Max Score",
            "Remarks",
            "Source",
            "Confidence",
          ],
          ...sectionRows.map((r) => [
            r.particulars,
            r.response,
            r.score,
            r.maxScore,
            r.remarks,
            r.source,
            r.confidence,
          ]),
          ["Subtotal", "", subtotalScore, subtotalMax, "", "", ""],
        ];
        const sheet = XLSX.utils.aoa_to_sheet(aoa);
        sheet["!cols"] = [
          { wch: 56 },
          { wch: 18 },
          { wch: 8 },
          { wch: 10 },
          { wch: 64 },
          { wch: 24 },
          { wch: 12 },
        ];
        XLSX.utils.book_append_sheet(wb, sheet, safeSheetName(section.title));
      }

      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `${fileBaseName}-${stamp}.xlsx`);
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
