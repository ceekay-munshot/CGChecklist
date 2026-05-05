export function stripCitations(text: string): string {
  return text.replace(/<doc_source>[^<]*<\/doc_source>/g, "").replace(/,\s*,/g, ",").trim();
}
