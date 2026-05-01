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

const parseHtmlTables = (html: string): ParsedTable[] => {
  const tables: ParsedTable[] = [];
  let sectionTitle = "Section";
  let tableCount = 0;

  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  const tableMatches = Array.from(html.matchAll(tableRegex));

  const divSectionRegex =
    /<div[^>]*>(?:SECTION \d+:\s*)?([^<]+)<\/div>/gi;
  const divMatches = Array.from(html.matchAll(divSectionRegex));

  for (let tableIdx = 0; tableIdx < tableMatches.length; tableIdx++) {
    const tableHtml = tableMatches[tableIdx][1];
    const rowMatches = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];

    if (rowMatches.length === 0) continue;

    // Try to find a matching section title from divs
    let currentTitle = sectionTitle;
    for (let divIdx = 0; divIdx < divMatches.length; divIdx++) {
      const candidateTitle = stripTags(divMatches[divIdx][1]);
      if (!isSkippableText(candidateTitle)) {
        // Use the most recent non-skippable div title
        if (divMatches[divIdx].index! < tableMatches[tableIdx].index!) {
          currentTitle = candidateTitle;
        }
      }
    }

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
      sectionTitle = currentTitle; // Update for next iteration
      tables.push({ title: currentTitle, headers, rows: dataRows });
      tableCount++;
    }
  }

  return tables;
};

const parseMarkdownTables = (markdown: string): ParsedTable[] => {
  const tables: ParsedTable[] = [];
  const lines = markdown.split("\n");

  let currentTitle = "Section";
  let i = 0;

  const isSeparator = (line: string) =>
    /^\|?[\s|\-:]+\|?$/.test(line.trim()) && line.includes("-");

  const splitCells = (line: string): string[] =>
    line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.replace(/\*\*/g, "").trim());

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
      i++;
      continue;
    }

    if (
      trimmed.includes("|") &&
      i + 1 < lines.length &&
      isSeparator(lines[i + 1])
    ) {
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
