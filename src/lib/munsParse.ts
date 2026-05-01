export interface MunsParseResult {
  html: string;
  cleanText: string;
  tables: ParsedTable[];
}

export interface ParsedTable {
  title: string;
  headers: string[];
  rows: Record<string, string>[];
}

const extractAnsBlock = (raw: string): string => {
  const match = raw.match(/<ans>([\s\S]*?)<\/ans>/);
  return match ? match[1] : raw;
};

const stripTags = (html: string): string => {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
};

const looksLikeHtml = (text: string): boolean => /<table[^>]*>/i.test(text);

const isSkippableText = (text: string): boolean => {
  const normalized = text.toLowerCase().trim();
  return (
    normalized.includes("highly confidential") ||
    normalized.includes("disclaimer") ||
    normalized === ""
  );
};

const SECTION_KEYWORD_TITLES: Array<{ keyword: string; title: string }> = [
  { keyword: "board of directors", title: "Board of Directors" },
  { keyword: "audit committee", title: "Audit Committee" },
  { keyword: "audit", title: "Audit" },
  { keyword: "stakeholders", title: "Stakeholders" },
  { keyword: "stakeholder", title: "Stakeholders" },
  { keyword: "employee welfare", title: "Employee Welfare" },
  { keyword: "employee", title: "Employee" },
  { keyword: "industry and promoter", title: "Industry and Promoter" },
  { keyword: "promoter", title: "Promoter" },
  { keyword: "stock exchange", title: "Stock Exchange" },
  { keyword: "exchange compliance", title: "Stock Exchange" },
  { keyword: "other regulatory", title: "Other Regulatory" },
  { keyword: "regulatory", title: "Regulatory" },
  { keyword: "financial statement", title: "Financial Statements" },
  { keyword: "financials", title: "Financials" },
  { keyword: "financial", title: "Financials" },
];

const findTitleInGap = (gap: string): string | null => {
  const text = stripTags(gap).toLowerCase();
  if (!text) return null;
  let bestEnd = -1;
  let bestLen = 0;
  let bestTitle: string | null = null;
  for (const { keyword, title } of SECTION_KEYWORD_TITLES) {
    const idx = text.lastIndexOf(keyword);
    if (idx === -1) continue;
    const end = idx + keyword.length;
    if (end > bestEnd || (end === bestEnd && keyword.length > bestLen)) {
      bestEnd = end;
      bestLen = keyword.length;
      bestTitle = title;
    }
  }
  return bestTitle;
};

const parseHtmlTables = (html: string): ParsedTable[] => {
  const tables: ParsedTable[] = [];
  let sectionTitle = "Section";

  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  const tableMatches = Array.from(html.matchAll(tableRegex));

  let prevTableEnd = 0;

  for (let tableIdx = 0; tableIdx < tableMatches.length; tableIdx++) {
    const match = tableMatches[tableIdx];
    const tableHtml = match[1];
    const tableStart = match.index ?? 0;
    const rowMatches = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];

    if (rowMatches.length === 0) {
      prevTableEnd = tableStart + match[0].length;
      continue;
    }

    const gap = html.slice(prevTableEnd, tableStart);
    const gapTitle = findTitleInGap(gap);
    const currentTitle = gapTitle || sectionTitle;

    const headers: string[] = [];
    const dataRows: Record<string, string>[] = [];

    for (let i = 0; i < rowMatches.length; i++) {
      const rowHtml = rowMatches[i];
      const cells = rowHtml.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || [];

      if (cells.length === 0) continue;

      const cellTexts = cells.map((cell) => stripTags(cell));

      if (i === 0) {
        headers.push(...cellTexts);
      } else if (headers.length > 0) {
        const row: Record<string, string> = {};
        headers.forEach((header, idx) => {
          row[header] = cellTexts[idx] || "";
        });
        dataRows.push(row);
      }
    }

    if (headers.length > 0) {
      sectionTitle = currentTitle;
      tables.push({ title: currentTitle, headers, rows: dataRows });
    }

    prevTableEnd = tableStart + match[0].length;
  }

  return tables;
};

const parseMarkdownTables = (markdown: string): ParsedTable[] => {
  const tables: ParsedTable[] = [];
  const lines = markdown.split("\n");

  let currentTitle = "Section";
  let gapBuffer = "";
  let i = 0;

  const isSeparator = (line: string) =>
    /^\|?[\s|\-:]+\|?$/.test(line.trim()) && line.includes("-");

  const splitCells = (line: string): string[] =>
    line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.replace(/\*\*/g, "").trim());

  const consumeGapTitle = () => {
    const fromGap = findTitleInGap(gapBuffer);
    if (fromGap) currentTitle = fromGap;
    gapBuffer = "";
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    const headingMatch = trimmed.match(/^#{1,4}\s+\*?\*?(.+?)\*?\*?$/);
    if (headingMatch) {
      const candidateTitle = headingMatch[1]
        .replace(/\*\*/g, "")
        .replace(/^SECTION\s+\d+:\s*/i, "")
        .trim();
      if (!isSkippableText(candidateTitle)) {
        currentTitle = candidateTitle;
      }
      gapBuffer = "";
      i++;
      continue;
    }

    if (
      trimmed.includes("|") &&
      i + 1 < lines.length &&
      isSeparator(lines[i + 1])
    ) {
      consumeGapTitle();

      const headers = splitCells(trimmed);
      if (headers.length === 0 || headers.some((h) => !h)) {
        i += 2;
        continue;
      }

      const dataRows: Record<string, string>[] = [];
      i += 2;

      while (i < lines.length) {
        const rowLine = lines[i].trim();
        if (!rowLine.includes("|")) break;
        if (isSeparator(rowLine)) {
          i++;
          continue;
        }
        const cells = splitCells(rowLine);
        const row: Record<string, string> = {};
        headers.forEach((header, idx) => {
          row[header] = cells[idx] || "";
        });
        dataRows.push(row);
        i++;
      }

      if (headers.length > 0 && dataRows.length > 0) {
        tables.push({ title: currentTitle, headers, rows: dataRows });
      }
      continue;
    }

    gapBuffer += " " + trimmed;
    i++;
  }

  return tables;
};

export const parseMunsResponse = (raw: string): MunsParseResult => {
  const ansContent = extractAnsBlock(raw);
  const cleanText = stripTags(ansContent);

  const tables = looksLikeHtml(ansContent)
    ? parseHtmlTables(ansContent)
    : parseMarkdownTables(ansContent);

  return {
    html: ansContent,
    cleanText,
    tables,
  };
};
