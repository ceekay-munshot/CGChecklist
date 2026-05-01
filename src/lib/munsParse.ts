export interface MunsParseResult {
  html: string;
  cleanText: string;
  tables: ParsedTable[];
}

export interface ParsedTable {
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

const parseHtmlTables = (html: string): ParsedTable[] => {
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  const tables: ParsedTable[] = [];
  let match;

  while ((match = tableRegex.exec(html)) !== null) {
    const tableHtml = match[1];
    const rows = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];

    if (rows.length === 0) continue;

    const headers: string[] = [];
    const dataRows: Record<string, string>[] = [];

    for (let i = 0; i < rows.length; i++) {
      const rowHtml = rows[i];
      const cells = rowHtml.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || [];

      if (cells.length === 0) continue;

      const cellTexts = cells.map((cell) => {
        const text = cell.replace(/<[^>]+>/g, "").trim();
        return stripTags(text);
      });

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
      tables.push({ headers, rows: dataRows });
    }
  }

  return tables;
};

export const parseMunsResponse = (raw: string): MunsParseResult => {
  const ansContent = extractAnsBlock(raw);
  const cleanText = stripTags(ansContent);
  const tables = parseHtmlTables(ansContent);

  return {
    html: ansContent,
    cleanText,
    tables,
  };
};
