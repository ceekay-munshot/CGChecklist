import type {
  GovernanceConfidence,
  GovernanceResponse,
  GovernanceRow,
  GovernanceScoreValue,
  GovernanceSectionId,
} from "@/lib/types/governance";
import { parseMunsResponse } from "@/lib/munsParse";

const SECTION_MAP: Record<string, GovernanceSectionId> = {
  "board of directors": "BOARD",
  board: "BOARD",
  audit: "AUDIT",
  stakeholder: "STAKEHOLDERS",
  stakeholders: "STAKEHOLDERS",
  employee: "EMPLOYEE",
  "industry and promoter": "INDUSTRY_PROMOTER",
  promoter: "INDUSTRY_PROMOTER",
  "stock exchange": "STOCK_EXCHANGE",
  exchange: "STOCK_EXCHANGE",
  "other regulatory": "OTHER_REGULATORY",
  regulatory: "OTHER_REGULATORY",
  financial: "FINANCIALS",
  financials: "FINANCIALS",
};

const mapSectionName = (title: string): GovernanceSectionId => {
  const normalized = title
    .toLowerCase()
    .trim()
    .replace(/^section\s+\d+:\s*/i, "");

  // Try exact matches first (longest first for better specificity)
  const keys = Object.keys(SECTION_MAP).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (normalized.includes(key)) return SECTION_MAP[key];
  }

  return "BOARD";
};

const responseToConfidence = (response: string): GovernanceConfidence => {
  const v = response.toLowerCase().trim();

  // Could-not-establish or failed-fetch answers carry the least certainty.
  if (["unclear", "n/a", "not established", "not retrieved"].includes(v)) {
    return "Low";
  }

  // A mixed / partial finding sits in the middle.
  if (["neutral", "average", "moderate", "medium"].includes(v)) {
    return "Medium";
  }

  // Any clear directional verdict — positive or negative — is a confident read.
  return "High";
};

const clampScore = (n: number): GovernanceScoreValue => {
  if (n >= 2) return 2;
  if (n <= 0) return 0;
  return 1;
};

const findColumn = (headers: string[], needles: string[]): string | undefined =>
  headers.find((h) => needles.some((n) => h.toLowerCase().includes(n)));

export const munsHtmlToGovernanceRows = (raw: string): GovernanceRow[] => {
  const parsed = parseMunsResponse(raw);
  const rows: GovernanceRow[] = [];
  let questionCounter = 0;

  for (const table of parsed.tables) {
    const sectionId = mapSectionName(table.title);

    const particularsCol = findColumn(table.headers, ["particular"]);
    const responseCol = findColumn(table.headers, ["response"]);
    const scoreCol = table.headers.find(
      (h) => h.toLowerCase().trim() === "score",
    );
    const remarksCol = findColumn(table.headers, ["remark"]);

    if (!particularsCol || !responseCol) continue;

    for (const row of table.rows) {
      const particulars = row[particularsCol] || "";
      const response = row[responseCol] || "";
      const scoreNum = scoreCol ? parseInt(row[scoreCol], 10) || 0 : 0;
      const remarks = remarksCol ? row[remarksCol] || "" : "";

      if (!particulars.trim()) continue;

      rows.push({
        sectionId,
        questionId: `${sectionId}-${++questionCounter}`,
        particulars,
        response: response as GovernanceResponse,
        score: clampScore(scoreNum),
        maxScore: 2,
        remarks,
        source: "MUNS Analysis",
        confidence: responseToConfidence(response),
      });
    }
  }

  return rows;
};
