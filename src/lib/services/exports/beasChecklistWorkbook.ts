import type { Border } from "exceljs";
import { GOVERNANCE_CHECKLIST } from "@/lib/governance/checklist";
import { splitRemarkBullets } from "@/lib/remarks";
import type { GovernanceRow } from "@/lib/types/governance";

// Show 0 / 0.25 / 0.5 (and totals like 19.25) exactly. A plain "0.0" format
// rounds 0.25 → "0.3", visibly breaking the quarter-point scale in the sheet.
const SCORE_FMT = "0.##";

/**
 * Excel export in Beas Capital's exact CG-checklist layout, so the output can be
 * downloaded and pasted straight into their stage order. Reproduces their sheet
 * from the Capillary Technologies reference file: one "CG Checklist" sheet,
 * columns Particulars | Score | Max Score | Remarks, section banner rows, item
 * rows scored out of 0.5, and Total / Overall rows driven by live formulas.
 * Fonts, sizes, colours and column widths are copied from that file.
 */

// Colours (ARGB) copied from the reference workbook.
const NAVY = "FF1F3A5F"; // BEAS CAPITAL / company title text
const HEADER_FILL = "FF002060"; // header row fill
const HEADER_TEXT = "FFFFFFFF"; // header row text
const SECTION_FILL = "FFD9E2EC"; // section banner fill
const GRID = "FFBFBFBF"; // thin grid lines

const TITLE_FONT = "Calibri";
const BODY_FONT = "Book Antiqua";

const thin: Partial<Border> = { style: "thin", color: { argb: GRID } };
const boxBorder = { top: thin, bottom: thin, left: thin, right: thin };

interface BeasChecklistInput {
  rows: GovernanceRow[];
  company: string;
}

export async function buildBeasChecklistWorkbook(
  input: BeasChecklistInput,
): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Beas Capital · CG Checklist";
  wb.created = new Date();

  const ws = wb.addWorksheet("CG Checklist", {
    views: [{ state: "frozen", ySplit: 4 }],
  });
  ws.columns = [
    { width: 49.5 },
    { width: 8 },
    { width: 10 },
    { width: 110.5 },
  ];

  const byId = new Map(input.rows.map((row) => [row.questionId, row]));

  // Row 1 — BEAS CAPITAL
  ws.getCell(1, 1).value = "BEAS CAPITAL";
  ws.getCell(1, 1).font = {
    name: TITLE_FONT,
    size: 14,
    bold: true,
    color: { argb: NAVY },
  };
  ws.getRow(1).height = 17.4;

  // Row 2 — company name
  ws.getCell(2, 1).value = input.company;
  ws.getCell(2, 1).font = {
    name: TITLE_FONT,
    size: 11,
    bold: true,
    color: { argb: NAVY },
  };

  // Row 3 — blank spacer. Row 4 — column headers.
  const headers = ["Particulars", "Score", "Max Score", "Remarks"];
  headers.forEach((text, i) => {
    const cell = ws.getCell(4, i + 1);
    cell.value = text;
    cell.font = { name: BODY_FONT, size: 9, bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: "left" };
    cell.border = boxBorder;
  });

  let r = 5;
  const itemRowNumbers: number[] = [];

  for (const section of GOVERNANCE_CHECKLIST) {
    // Section banner row — title in column A, fill spans A:D.
    for (let c = 1; c <= 4; c += 1) {
      const cell = ws.getCell(r, c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SECTION_FILL } };
      cell.font = { name: BODY_FONT, size: 9, bold: true };
      cell.border = boxBorder;
    }
    ws.getCell(r, 1).value = section.title;
    r += 1;

    for (const item of section.items) {
      const row = byId.get(item.questionId);

      const particulars = ws.getCell(r, 1);
      particulars.value = item.particulars;
      particulars.font = { name: BODY_FONT, size: 9 };
      particulars.alignment = { vertical: "top", wrapText: true };
      particulars.border = boxBorder;

      const score = ws.getCell(r, 2);
      score.value = row ? row.score : 0;
      score.font = { name: BODY_FONT, size: 9, bold: true };
      score.alignment = { horizontal: "center", vertical: "top" };
      score.numFmt = SCORE_FMT;
      score.border = boxBorder;

      const maxScore = ws.getCell(r, 3);
      maxScore.value = row ? row.maxScore : 0.5;
      maxScore.font = { name: BODY_FONT, size: 9 };
      maxScore.alignment = { horizontal: "center", vertical: "top" };
      maxScore.numFmt = SCORE_FMT;
      maxScore.border = boxBorder;

      const remarks = ws.getCell(r, 4);
      remarks.value = remarkText(row);
      remarks.font = { name: BODY_FONT, size: 9 };
      remarks.alignment = { vertical: "top", wrapText: true };
      remarks.border = boxBorder;

      // No fixed row height: leave the wrapped Particulars/Remarks cells eligible
      // for Excel's auto-fit so long evidence isn't clipped to one line.
      itemRowNumbers.push(r);
      r += 1;
    }
  }

  // Total Score + Overall Governance Score, as live formulas over the item block
  // (section banner rows have blank Score/Max cells, so they sum to zero).
  const firstItem = itemRowNumbers[0];
  const lastItem = itemRowNumbers[itemRowNumbers.length - 1];

  ws.getCell(r, 1).value = "Total Score";
  ws.getCell(r, 1).font = { name: BODY_FONT, size: 9, bold: true };
  const totalScore = ws.getCell(r, 2);
  totalScore.value = { formula: `SUM(B${firstItem}:B${lastItem})` };
  totalScore.font = { name: BODY_FONT, size: 9, bold: true };
  totalScore.alignment = { horizontal: "center" };
  totalScore.numFmt = SCORE_FMT;
  const totalMax = ws.getCell(r, 3);
  totalMax.value = { formula: `SUM(C${firstItem}:C${lastItem})` };
  totalMax.font = { name: BODY_FONT, size: 9, bold: true };
  totalMax.alignment = { horizontal: "center" };
  totalMax.numFmt = SCORE_FMT;
  const totalRow = r;
  r += 1;

  ws.getCell(r, 1).value = "Overall Governance Score";
  ws.getCell(r, 1).font = { name: BODY_FONT, size: 9, bold: true };
  const overall = ws.getCell(r, 3);
  overall.value = { formula: `B${totalRow}/C${totalRow}` };
  overall.font = { name: BODY_FONT, size: 9, bold: true };
  overall.alignment = { horizontal: "center" };
  overall.numFmt = "0.0%";

  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

// Compose the single Remarks cell: verdict first, then supporting detail — the
// house style in the reference file ("Yes. Board of 6: …"). Avoids repeating the
// verdict when the remark already leads with it.
function remarkText(row?: GovernanceRow): string {
  if (!row) return "";
  const remarks = (row.remarks || "").trim();
  const response = (row.response || "").trim();
  const composed =
    remarks &&
    response &&
    response !== "Unclear" &&
    !remarks.toLowerCase().startsWith(response.toLowerCase())
      ? `${response}. ${remarks}`
      : remarks || response;

  // MUNS joins its three answer bullets with literal <br>; Excel shows those as
  // text, so split them back out and rejoin with real newlines (the cell wraps).
  return splitRemarkBullets(composed).join("\n");
}
