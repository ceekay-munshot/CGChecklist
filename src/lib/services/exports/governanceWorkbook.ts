import type { Cell, Workbook } from "exceljs";
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
  GovernanceSectionSummary,
  GovernanceTotals,
} from "@/lib/types/governance";

const COLOR = {
  navy900: "FF0F1B30",
  navy700: "FF1A2C4A",
  navy600: "FF243B62",
  navy500: "FF31507F",
  navy50: "FFEEF2F7",
  mist50: "FFF7F9FC",
  mist100: "FFEEF2F8",
  mist200: "FFDDE4EE",
  mist400: "FF99A6BD",
  mist700: "FF3D485D",
  good50: "FFECF6EE",
  good500: "FF2F9E58",
  good700: "FF1A5D30",
  warn50: "FFFDF3E0",
  warn500: "FFD78A1A",
  warn700: "FF76520C",
  risk50: "FFFBE9E9",
  risk500: "FFC53A3A",
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

const RATING_BAR_COLOR: Record<GovernanceRating, string> = {
  Strong: COLOR.good500,
  Good: COLOR.good500,
  Moderate: COLOR.warn500,
  Weak: COLOR.risk500,
};

export interface GovernanceWorkbookInput {
  rows: GovernanceRow[];
  company: string;
  ticker: string;
  exchange: string;
  country: string;
  reportDate: Date;
  dataSource: string;
}

export async function buildGovernanceWorkbook(
  input: GovernanceWorkbookInput,
): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const totals = calculateGovernanceScore(input.rows);
  const summaries = getGovernanceSectionSummaries(input.rows);

  const wb = new ExcelJS.Workbook();
  wb.creator = "CG Checklist";
  wb.created = new Date();
  wb.company = "CG Checklist";

  buildCoverSheet(wb, { ...input, totals, summaries });
  buildChecklistSheet(wb, input.rows);
  buildMethodologySheet(wb);

  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

interface CoverContext extends GovernanceWorkbookInput {
  totals: GovernanceTotals;
  summaries: GovernanceSectionSummary[];
}

function buildCoverSheet(wb: Workbook, ctx: CoverContext) {
  const ws = wb.addWorksheet("Executive Summary", {
    properties: { tabColor: { argb: COLOR.navy700 } },
    views: [{ showGridLines: false }],
    pageSetup: {
      orientation: "landscape",
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: {
        left: 0.4,
        right: 0.4,
        top: 0.5,
        bottom: 0.5,
        header: 0.2,
        footer: 0.2,
      },
    },
    headerFooter: {
      oddFooter:
        '&L&"Calibri"&9&KAAAAAACG Checklist · Confidential&R&"Calibri"&9&KAAAAAAPage &P of &N',
    },
  });

  ws.columns = [
    { width: 2 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
    { width: 2 },
  ];

  let r = 1;

  ws.getRow(r).height = 8;
  r += 1;

  ws.mergeCells(r, 2, r, 9);
  const eyebrow = ws.getCell(r, 2);
  eyebrow.value = "CORPORATE GOVERNANCE ANALYSIS";
  eyebrow.font = {
    name: "Calibri",
    size: 9,
    bold: true,
    color: { argb: COLOR.mist700 },
  };
  eyebrow.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(r).height = 16;
  r += 1;

  ws.mergeCells(r, 2, r, 9);
  const name = ws.getCell(r, 2);
  name.value = ctx.company;
  name.font = {
    name: "Calibri",
    size: 28,
    bold: true,
    color: { argb: COLOR.navy900 },
  };
  name.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(r).height = 38;
  r += 1;

  ws.mergeCells(r, 2, r, 9);
  const sub = ws.getCell(r, 2);
  const dateLabel = ctx.reportDate.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  sub.value = {
    richText: [
      {
        text: ctx.ticker,
        font: {
          name: "Calibri",
          size: 11,
          bold: true,
          color: { argb: COLOR.navy700 },
        },
      },
      {
        text: `   ·   ${ctx.exchange}   ·   ${ctx.country}   ·   As of ${dateLabel}   ·   ${ctx.dataSource}`,
        font: { name: "Calibri", size: 11, color: { argb: COLOR.mist700 } },
      },
    ],
  };
  sub.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(r).height = 20;
  r += 1;

  ws.getRow(r).height = 6;
  for (let c = 2; c <= 9; c += 1) {
    ws.getCell(r, c).border = {
      bottom: { style: "thin", color: { argb: COLOR.mist200 } },
    };
  }
  r += 1;

  ws.getRow(r).height = 14;
  r += 1;

  const tileLabelStyle = {
    name: "Calibri",
    size: 9,
    bold: true,
    color: { argb: COLOR.mist700 },
  } as const;
  const tileSubStyle = {
    name: "Calibri",
    size: 10,
    bold: true,
    color: { argb: COLOR.mist700 },
  } as const;

  const tileRowStart = r;
  const tileRowEnd = r + 4;

  type TileSpec = {
    startCol: number;
    label: string;
    bigText: string;
    bigColor: string;
    subText: string;
    subColor?: string;
    subFill?: string;
  };

  const ratingFill = RATING_COLORS[ctx.totals.rating];

  const tiles: TileSpec[] = [
    {
      startCol: 2,
      label: "OVERALL SCORE",
      bigText: `${ctx.totals.overallScorePercent.toFixed(1)}%`,
      bigColor: COLOR.navy900,
      subText: ctx.totals.rating.toUpperCase(),
      subColor: ratingFill.fg,
      subFill: ratingFill.bg,
    },
    {
      startCol: 4,
      label: "SCORE",
      bigText: `${ctx.totals.totalScore} / ${ctx.totals.totalMaxScore}`,
      bigColor: COLOR.navy900,
      subText: `${ctx.totals.rowCount} checklist items`,
      subColor: COLOR.mist700,
    },
    {
      startCol: 6,
      label: "RED FLAGS",
      bigText: `${ctx.totals.redFlagRows}`,
      bigColor: ctx.totals.redFlagRows > 0 ? COLOR.risk700 : COLOR.navy900,
      subText:
        ctx.totals.redFlagRows > 0 ? "Items scored zero" : "No critical gaps",
      subColor: ctx.totals.redFlagRows > 0 ? COLOR.risk700 : COLOR.good700,
    },
    {
      startCol: 8,
      label: "LOW CONFIDENCE",
      bigText: `${ctx.totals.lowConfidenceRows}`,
      bigColor:
        ctx.totals.lowConfidenceRows > 0 ? COLOR.warn700 : COLOR.navy900,
      subText:
        ctx.totals.lowConfidenceRows > 0
          ? "Items needing review"
          : "All items confident",
      subColor:
        ctx.totals.lowConfidenceRows > 0 ? COLOR.warn700 : COLOR.good700,
    },
  ];

  for (const tile of tiles) {
    const c1 = tile.startCol;
    const c2 = tile.startCol + 1;

    ws.mergeCells(tileRowStart, c1, tileRowStart, c2);
    const labelCell = ws.getCell(tileRowStart, c1);
    labelCell.value = tile.label;
    labelCell.font = tileLabelStyle;
    labelCell.alignment = {
      vertical: "middle",
      horizontal: "left",
      indent: 1,
    };
    labelCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLOR.mist50 },
    };

    ws.mergeCells(tileRowStart + 1, c1, tileRowStart + 2, c2);
    const bigCell = ws.getCell(tileRowStart + 1, c1);
    bigCell.value = tile.bigText;
    bigCell.font = {
      name: "Calibri",
      size: 26,
      bold: true,
      color: { argb: tile.bigColor },
    };
    bigCell.alignment = {
      vertical: "middle",
      horizontal: "left",
      indent: 1,
    };
    bigCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLOR.white },
    };

    ws.mergeCells(tileRowStart + 3, c1, tileRowEnd, c2);
    const subCell = ws.getCell(tileRowStart + 3, c1);
    subCell.value = tile.subText;
    subCell.font = {
      ...tileSubStyle,
      color: { argb: tile.subColor || COLOR.mist700 },
    };
    subCell.alignment = {
      vertical: "middle",
      horizontal: "left",
      indent: 1,
    };
    subCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: tile.subFill ?? COLOR.white },
    };

    for (let rr = tileRowStart; rr <= tileRowEnd; rr += 1) {
      for (let cc = c1; cc <= c2; cc += 1) {
        const cell = ws.getCell(rr, cc);
        const border: Cell["border"] = {};
        if (rr === tileRowStart)
          border.top = { style: "medium", color: { argb: COLOR.navy500 } };
        if (rr === tileRowEnd)
          border.bottom = { style: "thin", color: { argb: COLOR.mist200 } };
        if (cc === c1)
          border.left = { style: "thin", color: { argb: COLOR.mist200 } };
        if (cc === c2)
          border.right = { style: "thin", color: { argb: COLOR.mist200 } };
        cell.border = border;
      }
    }
  }

  ws.getRow(tileRowStart).height = 18;
  ws.getRow(tileRowStart + 1).height = 22;
  ws.getRow(tileRowStart + 2).height = 22;
  ws.getRow(tileRowStart + 3).height = 16;
  ws.getRow(tileRowEnd).height = 12;
  r = tileRowEnd + 1;

  ws.getRow(r).height = 18;
  r += 1;

  ws.mergeCells(r, 2, r, 9);
  const band = ws.getCell(r, 2);
  band.value = "SECTION PERFORMANCE";
  band.font = {
    name: "Calibri",
    size: 10,
    bold: true,
    color: { argb: COLOR.white },
  };
  band.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLOR.navy700 },
  };
  band.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(r).height = 22;
  r += 1;

  const sectionHeaders = [
    "Section",
    "Score",
    "Max",
    "Score %",
    "Rating",
    "Red Flags",
    "Low Confidence",
  ];
  for (let i = 0; i < sectionHeaders.length; i += 1) {
    const cell = ws.getCell(r, 2 + i);
    cell.value = sectionHeaders[i];
    cell.font = {
      name: "Calibri",
      size: 10,
      bold: true,
      color: { argb: COLOR.navy700 },
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLOR.mist100 },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: i === 0 ? "left" : "center",
      indent: i === 0 ? 1 : 0,
    };
    cell.border = {
      top: { style: "medium", color: { argb: COLOR.navy500 } },
      bottom: { style: "thin", color: { argb: COLOR.navy500 } },
    };
  }
  ws.getRow(r).height = 22;
  r += 1;

  const summaryStartRow = r;
  for (let i = 0; i < ctx.summaries.length; i += 1) {
    const s = ctx.summaries[i];
    const isAlt = i % 2 === 1;
    const fill = isAlt ? COLOR.mist50 : COLOR.white;

    const values = [
      s.title,
      s.score,
      s.maxScore,
      Number(s.scorePercent.toFixed(1)),
      s.rating,
      s.redFlags,
      s.lowConfidence,
    ];

    for (let c = 0; c < values.length; c += 1) {
      const cell = ws.getCell(r, 2 + c);
      cell.value = values[c];
      cell.font = {
        name: "Calibri",
        size: 10,
        color: { argb: COLOR.navy700 },
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: fill },
      };
      cell.alignment = {
        vertical: "middle",
        horizontal: c === 0 ? "left" : "center",
        indent: c === 0 ? 1 : 0,
      };
      cell.border = {
        bottom: { style: "thin", color: { argb: COLOR.mist200 } },
      };
    }

    ws.getCell(r, 5).numFmt = "0.0";

    const ratingCell = ws.getCell(r, 6);
    const rc = RATING_COLORS[s.rating];
    ratingCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: rc.bg },
    };
    ratingCell.font = {
      name: "Calibri",
      size: 10,
      bold: true,
      color: { argb: rc.fg },
    };

    if (s.redFlags > 0) {
      const flagCell = ws.getCell(r, 7);
      flagCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLOR.risk50 },
      };
      flagCell.font = {
        name: "Calibri",
        size: 10,
        bold: true,
        color: { argb: COLOR.risk700 },
      };
    }
    if (s.lowConfidence > 0) {
      const lcCell = ws.getCell(r, 8);
      lcCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLOR.warn50 },
      };
      lcCell.font = {
        name: "Calibri",
        size: 10,
        bold: true,
        color: { argb: COLOR.warn700 },
      };
    }

    ws.getRow(r).height = 22;
    r += 1;
  }
  const summaryEndRow = r - 1;

  if (summaryEndRow >= summaryStartRow) {
    ws.addConditionalFormatting({
      ref: `E${summaryStartRow}:E${summaryEndRow}`,
      rules: [
        {
          type: "dataBar",
          cfvo: [
            { type: "num", value: 0 },
            { type: "num", value: 100 },
          ],
          gradient: false,
          showValue: true,
          priority: 1,
          color: { argb: RATING_BAR_COLOR[ctx.totals.rating] },
        } as unknown as import("exceljs").DataBarRuleType,
      ],
    });
  }

  for (let c = 2; c <= 8; c += 1) {
    ws.getCell(summaryEndRow, c).border = {
      bottom: { style: "medium", color: { argb: COLOR.navy500 } },
    };
  }

  r += 2;

  ws.mergeCells(r, 2, r, 9);
  const note = ws.getCell(r, 2);
  note.value =
    "Score scale: 2 = strong, 1 = partial, 0 = absent / red flag. Rating bands: Strong ≥ 80%, Good 65–79.9%, Moderate 50–64.9%, Weak < 50%.";
  note.font = {
    name: "Calibri",
    size: 9,
    italic: true,
    color: { argb: COLOR.mist700 },
  };
  note.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  ws.getRow(r).height = 28;
}

function buildChecklistSheet(wb: Workbook, rows: GovernanceRow[]) {
  const ws = wb.addWorksheet("Detailed Checklist", {
    properties: { tabColor: { argb: COLOR.navy500 } },
    views: [{ state: "frozen", ySplit: 2, showGridLines: false }],
    pageSetup: {
      orientation: "landscape",
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: "1:2",
      margins: {
        left: 0.4,
        right: 0.4,
        top: 0.5,
        bottom: 0.5,
        header: 0.2,
        footer: 0.2,
      },
    },
    headerFooter: {
      oddHeader:
        '&L&"Calibri"&10&B&KAAAAAACorporate Governance · Detailed Checklist',
      oddFooter:
        '&L&"Calibri"&9&KAAAAAACG Checklist · Confidential&R&"Calibri"&9&KAAAAAAPage &P of &N',
    },
  });

  ws.columns = [
    { width: 56 },
    { width: 18 },
    { width: 9 },
    { width: 11 },
    { width: 64 },
    { width: 22 },
    { width: 13 },
  ];

  ws.mergeCells("A1:G1");
  const title = ws.getCell("A1");
  title.value = "DETAILED CHECKLIST";
  title.font = {
    name: "Calibri",
    size: 12,
    bold: true,
    color: { argb: COLOR.white },
  };
  title.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLOR.navy700 },
  };
  title.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 24;

  const headers = [
    "Particulars",
    "Response",
    "Score",
    "Max",
    "Remarks",
    "Source",
    "Confidence",
  ];
  for (let i = 0; i < headers.length; i += 1) {
    const cell = ws.getCell(2, i + 1);
    cell.value = headers[i];
    cell.font = {
      name: "Calibri",
      size: 10,
      bold: true,
      color: { argb: COLOR.navy700 },
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLOR.mist100 },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: i === 0 || i === 4 || i === 5 ? "left" : "center",
      indent: i === 0 ? 1 : 0,
    };
    cell.border = thinBorder();
  }
  ws.getRow(2).height = 22;

  for (const section of GOVERNANCE_CHECKLIST) {
    const sectionRows = rows.filter((r) => r.sectionId === section.sectionId);
    if (sectionRows.length === 0) continue;

    const bannerRow = ws.addRow([]);
    ws.mergeCells(bannerRow.number, 1, bannerRow.number, 7);
    const banner = ws.getCell(bannerRow.number, 1);
    banner.value = section.title.toUpperCase();
    banner.font = {
      name: "Calibri",
      size: 10,
      bold: true,
      color: { argb: COLOR.navy700 },
    };
    banner.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLOR.navy50 },
    };
    banner.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    bannerRow.height = 22;

    let subtotal = 0;
    let subtotalMax = 0;
    for (let i = 0; i < sectionRows.length; i += 1) {
      const r = sectionRows[i];
      subtotal += r.score;
      subtotalMax += r.maxScore;

      const isAlt = i % 2 === 1;
      const fill = isAlt ? COLOR.mist50 : COLOR.white;
      const row = ws.addRow([
        r.particulars,
        r.response,
        r.score,
        r.maxScore,
        r.remarks,
        r.source,
        r.confidence,
      ]);
      row.height = 30;
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: fill },
        };
        cell.font = {
          name: "Calibri",
          size: 10,
          color: { argb: COLOR.navy700 },
        };
        cell.border = thinBorder();
      });
      row.getCell(1).alignment = { vertical: "middle", wrapText: true };
      row.getCell(5).alignment = { vertical: "middle", wrapText: true };
      row.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(3).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(6).alignment = { vertical: "middle" };
      row.getCell(7).alignment = { horizontal: "center", vertical: "middle" };

      paintScorePill(row.getCell(2), r.score);
      paintScorePill(row.getCell(3), r.score);
      paintConfidencePill(row.getCell(7), r.confidence);
    }

    const sub = ws.addRow([
      `${section.title} Subtotal`,
      "",
      subtotal,
      subtotalMax,
      subtotalMax > 0
        ? `${((subtotal / subtotalMax) * 100).toFixed(1)}%`
        : "—",
      "",
      "",
    ]);
    sub.height = 22;
    sub.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLOR.navy50 },
      };
      cell.font = {
        name: "Calibri",
        size: 10,
        bold: true,
        color: { argb: COLOR.navy700 },
      };
      cell.border = thinBorder();
    });
    sub.getCell(1).alignment = {
      vertical: "middle",
      horizontal: "left",
      indent: 1,
    };
    for (let c = 2; c <= 7; c += 1) {
      sub.getCell(c).alignment = { vertical: "middle", horizontal: "center" };
    }

    ws.addRow([]);
  }
}

function buildMethodologySheet(wb: Workbook) {
  const ws = wb.addWorksheet("Methodology", {
    properties: { tabColor: { argb: COLOR.mist400 } },
    views: [{ showGridLines: false }],
    pageSetup: {
      orientation: "portrait",
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: {
        left: 0.5,
        right: 0.5,
        top: 0.5,
        bottom: 0.5,
        header: 0.2,
        footer: 0.2,
      },
    },
  });

  ws.columns = [{ width: 2 }, { width: 28 }, { width: 70 }, { width: 2 }];

  let r = 2;
  ws.mergeCells(r, 2, r, 3);
  const title = ws.getCell(r, 2);
  title.value = "METHODOLOGY & DEFINITIONS";
  title.font = {
    name: "Calibri",
    size: 14,
    bold: true,
    color: { argb: COLOR.navy900 },
  };
  ws.getRow(r).height = 26;
  r += 2;

  const sections: Array<{ heading: string; entries: Array<[string, string]> }> =
    [
      {
        heading: "Score scale",
        entries: [
          [
            "2",
            "Strong evidence — disclosure or control fully meets the criterion.",
          ],
          ["1", "Partial evidence — meets some but not all aspects."],
          [
            "0",
            "Absent / red flag — disclosure missing or fails the criterion.",
          ],
        ],
      },
      {
        heading: "Confidence levels",
        entries: [
          [
            "High",
            "Backed by primary disclosure or independently verifiable source.",
          ],
          ["Medium", "Backed by secondary source or partial disclosure."],
          [
            "Low",
            "Inferred or weakly supported — flagged for analyst review.",
          ],
        ],
      },
      {
        heading: "Rating bands",
        entries: [
          ["Strong", "Overall score ≥ 80%."],
          ["Good", "Overall score 65–79.9%."],
          ["Moderate", "Overall score 50–64.9%."],
          ["Weak", "Overall score below 50%."],
        ],
      },
      {
        heading: "Coverage",
        entries: [
          [
            "Sections",
            "Board of Directors, Audit, Stakeholders, Employee Welfare, Industry & Promoter, Stock Exchange Compliance, Other Regulatory, and Financial Statements.",
          ],
          ["Red flags", "Count of checklist rows that scored zero."],
          [
            "Low confidence",
            "Count of checklist rows whose underlying evidence was rated Low confidence.",
          ],
        ],
      },
    ];

  for (const sec of sections) {
    ws.mergeCells(r, 2, r, 3);
    const head = ws.getCell(r, 2);
    head.value = sec.heading;
    head.font = {
      name: "Calibri",
      size: 11,
      bold: true,
      color: { argb: COLOR.white },
    };
    head.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLOR.navy600 },
    };
    head.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    ws.getRow(r).height = 22;
    r += 1;

    for (let i = 0; i < sec.entries.length; i += 1) {
      const [k, v] = sec.entries[i];
      const fill = i % 2 === 1 ? COLOR.mist50 : COLOR.white;

      const keyCell = ws.getCell(r, 2);
      keyCell.value = k;
      keyCell.font = {
        name: "Calibri",
        size: 10,
        bold: true,
        color: { argb: COLOR.navy700 },
      };
      keyCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: fill },
      };
      keyCell.alignment = {
        vertical: "middle",
        horizontal: "left",
        indent: 1,
        wrapText: true,
      };
      keyCell.border = {
        bottom: { style: "thin", color: { argb: COLOR.mist200 } },
      };

      const valCell = ws.getCell(r, 3);
      valCell.value = v;
      valCell.font = {
        name: "Calibri",
        size: 10,
        color: { argb: COLOR.navy700 },
      };
      valCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: fill },
      };
      valCell.alignment = {
        vertical: "middle",
        horizontal: "left",
        wrapText: true,
      };
      valCell.border = {
        bottom: { style: "thin", color: { argb: COLOR.mist200 } },
      };

      ws.getRow(r).height = 28;
      r += 1;
    }

    r += 1;
  }

  ws.mergeCells(r, 2, r, 3);
  const disclaimer = ws.getCell(r, 2);
  disclaimer.value =
    "This report is generated from the MUNS governance agent and the CG Checklist scoring methodology. It is intended for internal analyst review and does not constitute investment advice.";
  disclaimer.font = {
    name: "Calibri",
    size: 9,
    italic: true,
    color: { argb: COLOR.mist700 },
  };
  disclaimer.alignment = {
    vertical: "top",
    horizontal: "left",
    wrapText: true,
  };
  ws.getRow(r).height = 50;
}

function thinBorder(): Cell["border"] {
  const side = { style: "thin" as const, color: { argb: COLOR.mist200 } };
  return { top: side, bottom: side, left: side, right: side };
}

function paintScorePill(cell: Cell, score: GovernanceScoreValue) {
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

function paintConfidencePill(cell: Cell, confidence: GovernanceConfidence) {
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
