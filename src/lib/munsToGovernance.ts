import type { GovernanceRow, GovernanceSectionId } from "@/lib/types/governance";

const SECTION_MAP: Record<string, GovernanceSectionId> = {
  "board of directors": "BOARD",
  "audit": "AUDIT",
  "stakeholders": "STAKEHOLDERS",
  "employee": "EMPLOYEE",
  "industry and promoter": "INDUSTRY_PROMOTER",
  "stock exchange": "STOCK_EXCHANGE",
  "other regulatory": "OTHER_REGULATORY",
  "financials": "FINANCIALS",
};

const mapSectionName = (title: string): GovernanceSectionId => {
  const normalized = title.toLowerCase().trim();
  for (const [key, value] of Object.entries(SECTION_MAP)) {
    if (normalized.includes(key)) return value;
  }
  return "BOARD"; // fallback
};

const responseToConfidence = (response: string): "High" | "Medium" | "Low" => {
  const low = response.toLowerCase();
  if (["yes", "good", "high", "above", "positive", "stable", "no issues"].includes(low))
    return "High";
  if (["average", "moderate", "moderate"].includes(low)) return "Medium";
  return "Low";
};

const responseToType = (response: string) => {
  const low = response.toLowerCase().trim();
  return (low as any); // trusts it's a valid GovernanceResponse
};

export const munsHtmlToGovernanceRows = (html: string): GovernanceRow[] => {
  const rows: GovernanceRow[] = [];
  let currentSection: GovernanceSectionId = "BOARD";
  let questionCounter = 0;

  // Extract section headers and their tables
  const sectionRegex = /<div[^>]*>SECTION \d+:\s*([^<]+)<\/div>[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/gi;
  let sectionMatch;

  while ((sectionMatch = sectionRegex.exec(html)) !== null) {
    const sectionTitle = sectionMatch[1].trim();
    currentSection = mapSectionName(sectionTitle);
    const tableHtml = sectionMatch[2];

    // Parse rows within the table
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let isHeader = true;
    let rowMatch;

    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      if (isHeader) {
        isHeader = false;
        continue; // Skip header row
      }

      const rowHtml = rowMatch[1];
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const cells: string[] = [];
      let cellMatch;

      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        const cell = cellMatch[1].replace(/<[^>]+>/g, "").trim();
        cells.push(cell);
      }

      if (cells.length >= 5) {
        const particulars = cells[0];
        const response = cells[1];
        const score = parseInt(cells[2], 10) || 0;
        const maxScore = 2;
        const remarks = cells[4];

        rows.push({
          sectionId: currentSection,
          questionId: `${currentSection}-${++questionCounter}`,
          particulars,
          response: responseToType(response),
          score: (score as 0 | 1 | 2),
          maxScore,
          remarks,
          source: "MUNS Analysis",
          confidence: responseToConfidence(response),
        });
      }
    }
  }

  return rows;
};
