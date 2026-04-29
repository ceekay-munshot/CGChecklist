"use client";

import { useState } from "react";
import { GOVERNANCE_CHECKLIST } from "@/lib/governance/checklist";
import {
  calculateGovernanceScore,
  getGovernanceSectionSummaries,
} from "@/lib/services/calculations/governanceCalc";
import type {
  GovernanceConfidence,
  GovernanceRating,
  GovernanceRow,
  GovernanceScoreValue,
} from "@/lib/types/governance";

interface Props {
  rows: GovernanceRow[];
  fileBaseName?: string;
}

// ARGB hex (alpha first) — exceljs uses this format.
const COLOR = {
  navy700: "FF1A2C4A",
  navy600: "FF243B62",
  navy50: "FFEEF2F7",
  mist50: "FFF7F9FC",
  mist100: "FFEEF2F8",
  mist200: "FFDDE4EE",
  mist700: "FF3D485D",
  good50: "FFECF6EE",
  good700: "FF1A5D30",
  warn50: "FFFDF3E0",
  warn700: "FF76520C",
  risk50: "FFFBE9E9",
  risk700: "FF731E1E",
  white: "FFFFFFFF",
} as const;

const SCORE_COLORS: Record<
  GovernanceScoreValue,
  { bg: string; fg: string }
> = {
  2: { bg: COLOR.good50, fg: COLOR.good700 },
  1: { bg: COLOR.warn50, fg: COLOR.warn700 },
  0: { bg: COLOR.risk50, fg: COLOR.risk700 },
};

const CONFIDENCE_COLORS: Record<
  GovernanceConfidence,
  { bg: string; fg: string }
> = {
  High: { bg: COLOR.good50, fg: COLOR.good700 },
  Medium: { bg: COLOR.warn50, fg: COLOR.warn700 },
  Low: { bg: COLOR.risk50, fg: COLOR.risk700 },
};

const RATING_COLORS: Record<GovernanceRating, { bg: string; fg: string }> = {
  Strong: { bg: COLOR.good50, fg: COLOR.good700 },
  Good: { bg: COLOR.good50, fg: COLOR.good700 },
  Moderate: { bg: COLOR.warn50, fg: COLOR.warn700 },
  Weak: { bg: COLOR.risk50, fg: COLOR.risk700 },
};

export function GovernanceExportButton({
  rows,
  fileBaseName = "corporate-governance-score",
}: Props) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const totals = calculateGovernanceScore(rows);
      const summaries = getGovernanceSectionSummaries(rows);

      const wb = new ExcelJS.Workbook();
      wb.creator = "CG Checklist";
      wb.created = new Date();

      const ws = wb.addWorksheet("Corporate Governance Score", {
        views: [{ state: "frozen", ySplit: 1 }],
      });

      ws.columns = [
        { width: 56 }, // A — Particulars / labels / section title
        { width: 18 }, // B — Response / value
        { width: 10 }, // C — Score
        { width: 11 }, // D — Max Score
        { width: 64 }, // E — Remarks
        { width: 26 }, // F — Source
        { width: 14 }, // G — Confidence
      ];

      // ===== Title bar =====
      ws.mergeCells("A1:G1");
      const titleCell = ws.getCell("A1");
      titleCell.value = "Corporate Governance Score";
      titleCell.font = {
        name: "Calibri",
        size: 16,
        bold: true,
        color: { argb: COLOR.white },
      };
      titleCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLOR.navy700 },
      };
      titleCell.alignment = {
        vertical: "middle",
        horizontal: "left",
        indent: 1,
      };
      ws.getRow(1).height = 28;
      ws.addRow([]);

      // ===== Scorecard block =====
      addBandHeader(ws, "Scorecard");
      addKeyValueRow(ws, "Overall Governance Score", `${totals.overallScorePercent.toFixed(1)}%`);
      addKeyValueRow(ws, "Total Score", totals.totalScore);
      addKeyValueRow(ws, "Total Max Score", totals.totalMaxScore);
      addRatingRow(ws, "Governance Rating", totals.rating);
      addKeyValueRow(ws, "Red Flag Rows", totals.redFlagRows, totals.redFlagRows > 0 ? "risk" : null);
      addKeyValueRow(ws, "Low Confidence Rows", totals.lowConfidenceRows, totals.lowConfidenceRows > 0 ? "risk" : null);
      addKeyValueRow(ws, "Checklist Rows", totals.rowCount);
      ws.addRow([]);

      // ===== Section summary =====
      addBandHeader(ws, "Section Summary");
      const sectionSummaryHeader = [
        "Section",
        "Score",
        "Max Score",
        "Score %",
        "Rating",
        "Red Flags",
        "Low Confidence",
      ];
      addTableHeader(ws, sectionSummaryHeader);
      for (const s of summaries) {
        const row = ws.addRow([
          s.title,
          s.score,
          s.maxScore,
          Number(s.scorePercent.toFixed(1)),
          s.rating,
          s.redFlags,
          s.lowConfidence,
        ]);
        styleDataRow(row);
        row.getCell(4).numFmt = "0.0";
        styleRatingCell(row.getCell(5), s.rating);
        if (s.redFlags > 0) styleAlertCell(row.getCell(6));
        if (s.lowConfidence > 0) styleAlertCell(row.getCell(7));
        for (let c = 2; c <= 7; c += 1) {
          row.getCell(c).alignment = { horizontal: "center", vertical: "middle" };
        }
        row.getCell(1).alignment = { vertical: "middle" };
      }
      ws.addRow([]);

      // ===== Per-section detail tables =====
      for (const section of GOVERNANCE_CHECKLIST) {
        const sectionRows = rows.filter(
          (r) => r.sectionId === section.sectionId,
        );
        if (sectionRows.length === 0) continue;

        addSectionHeader(ws, section.title);
        const detailHeader = [
          "Particulars",
          "Response",
          "Score",
          "Max Score",
          "Remarks",
          "Source",
          "Confidence",
        ];
        addTableHeader(ws, detailHeader);

        let subtotal = 0;
        let subtotalMax = 0;
        for (const r of sectionRows) {
          subtotal += r.score;
          subtotalMax += r.maxScore;
          const row = ws.addRow([
            r.particulars,
            r.response,
            r.score,
            r.maxScore,
            r.remarks,
            r.source,
            r.confidence,
          ]);
          styleDataRow(row);
          row.height = 30;
          row.getCell(1).alignment = { vertical: "middle", wrapText: true };
          row.getCell(5).alignment = { vertical: "middle", wrapText: true };
          row.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
          row.getCell(3).alignment = { horizontal: "center", vertical: "middle" };
          row.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
          row.getCell(6).alignment = { vertical: "middle" };
          row.getCell(7).alignment = { horizontal: "center", vertical: "middle" };
          styleResponseCell(row.getCell(2), r.score);
          styleScoreCell(row.getCell(3), r.score);
          styleConfidenceCell(row.getCell(7), r.confidence);
        }
        const sub = ws.addRow([
          "Subtotal",
          "",
          subtotal,
          subtotalMax,
          "",
          "",
          "",
        ]);
        styleSubtotalRow(sub);
        ws.addRow([]);
      }

      // ===== Final summary =====
      addBandHeader(ws, "Final Score Summary");
      addKeyValueRow(ws, "Total Score", totals.totalScore);
      addKeyValueRow(ws, "Total Max Score", totals.totalMaxScore);
      addKeyValueRow(
        ws,
        "Overall Governance Score",
        `${totals.overallScorePercent.toFixed(1)}%`,
      );
      addRatingRow(ws, "Governance Rating", totals.rating);

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().slice(0, 10);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${fileBaseName}-${stamp}.xlsx`;
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

// ---------- styling helpers ----------

type Worksheet = import("exceljs").Worksheet;
type Row = import("exceljs").Row;
type Cell = import("exceljs").Cell;

function thinBorder(): Partial<Cell["border"]> {
  const side = { style: "thin" as const, color: { argb: COLOR.mist200 } };
  return { top: side, bottom: side, left: side, right: side };
}

function addBandHeader(ws: Worksheet, label: string) {
  const row = ws.addRow([label]);
  ws.mergeCells(`A${row.number}:G${row.number}`);
  const cell = row.getCell(1);
  cell.font = { bold: true, size: 11, color: { argb: COLOR.white } };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLOR.navy600 },
  };
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  row.height = 22;
}

function addSectionHeader(ws: Worksheet, label: string) {
  const row = ws.addRow([label]);
  ws.mergeCells(`A${row.number}:G${row.number}`);
  const cell = row.getCell(1);
  cell.font = { bold: true, size: 11, color: { argb: COLOR.navy700 } };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLOR.navy50 },
  };
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  row.height = 22;
}

function addTableHeader(ws: Worksheet, headers: string[]) {
  const row = ws.addRow(headers);
  row.height = 20;
  for (let c = 1; c <= headers.length; c += 1) {
    const cell = row.getCell(c);
    cell.font = { bold: true, size: 10, color: { argb: COLOR.navy700 } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLOR.mist100 },
    };
    cell.alignment = { vertical: "middle", horizontal: c === 1 || c === 5 || c === 6 ? "left" : "center" };
    cell.border = thinBorder();
  }
}

function styleDataRow(row: Row) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = thinBorder();
    if (!cell.font) cell.font = { name: "Calibri", size: 10 };
    else cell.font = { name: "Calibri", size: 10, ...cell.font };
  });
}

function styleScoreCell(cell: Cell, score: GovernanceScoreValue) {
  const c = SCORE_COLORS[score];
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: c.bg },
  };
  cell.font = {
    name: "Calibri",
    size: 10,
    bold: true,
    color: { argb: c.fg },
  };
}

function styleResponseCell(cell: Cell, score: GovernanceScoreValue) {
  const c = SCORE_COLORS[score];
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: c.bg },
  };
  cell.font = {
    name: "Calibri",
    size: 10,
    bold: true,
    color: { argb: c.fg },
  };
}

function styleConfidenceCell(cell: Cell, confidence: GovernanceConfidence) {
  const c = CONFIDENCE_COLORS[confidence];
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: c.bg },
  };
  cell.font = {
    name: "Calibri",
    size: 10,
    bold: true,
    color: { argb: c.fg },
  };
}

function styleRatingCell(cell: Cell, rating: GovernanceRating) {
  const c = RATING_COLORS[rating];
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: c.bg },
  };
  cell.font = {
    name: "Calibri",
    size: 10,
    bold: true,
    color: { argb: c.fg },
  };
}

function styleAlertCell(cell: Cell) {
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLOR.risk50 },
  };
  cell.font = {
    name: "Calibri",
    size: 10,
    bold: true,
    color: { argb: COLOR.risk700 },
  };
}

function styleSubtotalRow(row: Row) {
  row.height = 20;
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLOR.mist50 },
    };
    cell.border = thinBorder();
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLOR.navy700 } };
  });
  row.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  for (let c = 2; c <= 7; c += 1) {
    row.getCell(c).alignment = { vertical: "middle", horizontal: "center" };
  }
}

function addKeyValueRow(
  ws: Worksheet,
  label: string,
  value: string | number,
  tone: "risk" | null = null,
) {
  const row = ws.addRow([label, value]);
  row.height = 18;
  const labelCell = row.getCell(1);
  const valueCell = row.getCell(2);
  labelCell.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLOR.mist700 } };
  labelCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  valueCell.font = {
    name: "Calibri",
    size: 11,
    bold: true,
    color: { argb: tone === "risk" ? COLOR.risk700 : COLOR.navy700 },
  };
  valueCell.alignment = { vertical: "middle", horizontal: "left" };
}

function addRatingRow(ws: Worksheet, label: string, rating: GovernanceRating) {
  const row = ws.addRow([label, rating]);
  row.height = 18;
  const labelCell = row.getCell(1);
  const valueCell = row.getCell(2);
  labelCell.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLOR.mist700 } };
  labelCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  styleRatingCell(valueCell, rating);
  valueCell.alignment = { vertical: "middle", horizontal: "center" };
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
