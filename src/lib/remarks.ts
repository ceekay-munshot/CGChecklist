// The MUNS answer for each question comes back as a few short bullet lines (the
// mega prompt asks for "THREE BULLET POINTS ONLY"). A markdown table cell can't
// hold a real newline, so assembleMarkdown() joins those bullets with <br> when
// building the scorecard. This splits a remark string back into its individual
// bullet lines so the dashboard and the Excel export can render them as a list
// rather than one run-on paragraph.
//
// Tolerates <br> separators, real newlines, and a leading bullet marker
// ("-", "–", "—", "•", "*", or "1." / "1)") on each line, which is stripped so
// the caller can supply its own marker.
export function splitRemarkBullets(remarks: string): string[] {
  return remarks
    .split(/<br\s*\/?>|\r?\n/i)
    .map((line) => line.replace(/^\s*(?:[-–—•*]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
}

// The engine hands us an opaque source string, e.g. "Annual report, p.147, p.148",
// "Screener financials", "Web research — https://…", or "Not retrieved". Split the
// document label from the page references so the UI can render a clean citation
// ("Annual report · pp.147, 148") instead of a comma-joined run-on. Page tokens
// must carry a dot ("p.147" / "pp.147") so URLs and stray letters aren't mistaken
// for pages.
export function formatSource(raw: string): { doc: string; pages: string[] } {
  const pages: string[] = [];
  const doc = (raw ?? "")
    .replace(/\bpp?\.\s*(\d+)/gi, (_m, n: string) => {
      pages.push(n);
      return "";
    })
    .replace(/[\s,;·|]+/g, " ")
    .trim();
  return { doc, pages: Array.from(new Set(pages)) };
}
