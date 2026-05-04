#!/usr/bin/env node
/**
 * Reads "Company data.xlsx" at repo root, normalises it, and writes
 * src/lib/data/companiesIndex.json — a sorted, deduped list of Indian
 * listings with NSE / BSE tickers and industry, used by /api/search
 * for instant local lookup.
 *
 * Run: node scripts/build-company-index.mjs
 */

import XLSX from "xlsx";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const xlsxPath = resolve(repoRoot, "Company data.xlsx");
const outDir = resolve(repoRoot, "src/lib/data");
const outPath = resolve(outDir, "companiesIndex.json");

const wb = XLSX.readFile(xlsxPath);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

const cleanTicker = (raw) =>
  String(raw || "")
    .trim()
    .toUpperCase();

const cleaned = rows
  .map((r) => ({
    name: String(r.COMPANY_NAME || "").trim(),
    nse: cleanTicker(r.NSE),
    bse: String(r.BSE || "").trim(),
    industry: String(r.Industry || "").trim(),
  }))
  .filter((r) => r.name && (r.nse || r.bse));

// Dedupe by lower-case name. When duplicates exist, prefer the entry
// whose NSE ticker is purely alphanumeric (legacy entries often have
// parentheses or odd characters from older listings).
const isClean = (t) => t.length > 0 && /^[A-Z0-9]+$/.test(t);
const seen = new Map();
for (const r of cleaned) {
  const key = r.name.toLowerCase();
  const prev = seen.get(key);
  if (!prev) {
    seen.set(key, r);
    continue;
  }
  const prevClean = isClean(prev.nse);
  const currClean = isClean(r.nse);
  if (currClean && !prevClean) seen.set(key, r);
}

const out = Array.from(seen.values()).sort((a, b) =>
  a.name.localeCompare(b.name),
);

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, JSON.stringify(out));

console.log(`Wrote ${out.length} companies to ${outPath}`);
