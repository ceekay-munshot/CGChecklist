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

const parseHtmlTables = (html: string): ParsedTable[] => {
  const tables: ParsedTable[] = [];

  const sectionRegex =
    /<div[^>]*>(?:SECTION \d+:\s*)?([^<]+)<\/div>[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/gi;
  let sectionMatch;

  while ((sectionMatch = sectionRegex.exec(html)) !== null) {
    const title = stripTags(sectionMatch[1]);
    const tableHtml = sectionMatch[2];
    const rowMatches = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];

    if (rowMatches.length === 0) continue;

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
      tables.push({ title, headers, rows: dataRows });
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
      currentTitle = headingMatch[1]
        .replace(/\*\*/g, "")
        .replace(/^SECTION\s+\d+:\s*/i, "")
        .trim();
      i++;
      continue;
    }

    if (
      trimmed.includes("|") &&
      i + 1 < lines.length &&
      isSeparator(lines[i + 1])
    ) {
      const headers = splitCells(trimmed);
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

      if (headers.length > 0) {
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
