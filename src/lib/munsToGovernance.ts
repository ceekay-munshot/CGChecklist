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
  audit: "AUDIT",
  stakeholders: "STAKEHOLDERS",
  employee: "EMPLOYEE",
  "industry and promoter": "INDUSTRY_PROMOTER",
  "stock exchange": "STOCK_EXCHANGE",
  "other regulatory": "OTHER_REGULATORY",
  financials: "FINANCIALS",
};

const mapSectionName = (title: string): GovernanceSectionId => {
  const normalized = title.toLowerCase().trim();
  for (const [key, value] of Object.entries(SECTION_MAP)) {
    if (normalized.includes(key)) return value;
  }
  return "BOARD";
};

const responseToConfidence = (response: string): GovernanceConfidence => {
  const v = response.toLowerCase().trim();
  if (
    ["yes", "good", "high", "above", "stable", "no"].includes(v) ||
    v.includes("debt <") ||
    v.includes("cash >")
  ) {
    return "High";
  }
  if (["average", "moderate", "medium"].includes(v)) return "Medium";
  return "Low";
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
    const maxScoreCol = findColumn(table.headers, ["max"]);
    const remarksCol = findColumn(table.headers, ["remark"]);

    if (!particularsCol || !responseCol) continue;

    for (const row of table.rows) {
      const particulars = row[particularsCol] || "";
      const response = row[responseCol] || "";
      const scoreNum = scoreCol ? parseInt(row[scoreCol], 10) || 0 : 0;
      const maxScoreNum = maxScoreCol ? parseInt(row[maxScoreCol], 10) || 2 : 2;
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
