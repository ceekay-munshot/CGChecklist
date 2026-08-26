// Source-first analysis run: harvest a company's filings, answer all 51
// checklist questions from them (MUNS backfill for the gaps), score 0/0.25/0.5,
// and write the Beas-format Excel + a results JSON. Runs in GitHub Actions.
//
//   tsx scripts/analyze.ts <TICKER> ["Company Name"]

import { mkdirSync, writeFileSync } from "node:fs";
import { GOVERNANCE_CHECKLIST } from "@/lib/governance/checklist";
import type { GovernanceConfidence, GovernanceResponse, GovernanceRow } from "@/lib/types/governance";
import { buildBeasChecklistWorkbook } from "@/lib/services/exports/beasChecklistWorkbook";
import { preflight, activeModelId, activeRegion } from "@/lib/engine/llm";
import { harvestCompany, type HarvestResult } from "./lib/harvest";
import { answerFromFilings, type EngineAnswer } from "./lib/answer";
import { backfillQuestion } from "./lib/backfill";
import { buildCompanyFacts } from "./lib/facts";
import { reviewRun } from "./lib/review";

const CONCURRENCY = Number(process.env.ANALYZE_CONCURRENCY) || 4;
const OUT_DIR = "report-output";

// Run `tasks` through a fixed-size worker pool, preserving input order.
async function pool<T, R>(items: T[], size: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

function confidenceFor(a: EngineAnswer): GovernanceConfidence {
  if (!a.available) return "Low";
  const v = a.verdict.toLowerCase();
  if (v.startsWith("unclear") || v.includes("n/a")) return "Low";
  return "High";
}

// The link a source citation should open: the web result's own URL, the
// annual-report PDF, a concall transcript, or the Screener company page.
function sourceUrlFor(source: string, harvest: HarvestResult): string | undefined {
  const web = source.match(/https?:\/\/\S+/);
  if (web) return web[0];
  if (/^screener/i.test(source)) return harvest.url;
  if (/^annual report/i.test(source)) {
    return harvest.annualReportUrl ?? harvest.documents.find((d) => d.kind === "annual_report")?.url;
  }
  if (/^concall/i.test(source)) {
    const label = source.split(/[,·]/)[0].replace(/^concall\s*/i, "").trim().toLowerCase();
    const doc =
      harvest.documents.find((d) => d.kind === "concall" && label && d.name.toLowerCase().includes(label)) ??
      harvest.documents.find((d) => d.kind === "concall");
    return doc?.url;
  }
  if (/^investor presentation/i.test(source)) {
    return harvest.documents.find((d) => d.kind === "presentation")?.url;
  }
  return undefined;
}

async function main() {
  const ticker = (process.argv[2] || "").trim().toUpperCase();
  const companyArg = (process.argv[3] || "").trim();
  if (!ticker) {
    console.error("Usage: tsx scripts/analyze.ts <TICKER> [\"Company Name\"]");
    process.exit(1);
  }

  console.log(`\n=== CG Checklist analysis: ${ticker} ===`);
  console.log(`LLM: ${activeModelId()} @ ${activeRegion()}`);
  const pf = await preflight();
  console.log(`Preflight: ${pf.ok ? "OK" : "FAILED"} — ${pf.detail}`);
  if (!pf.ok) {
    console.error("Aborting: the Claude/Bedrock model is not reachable. Fix CLAUDE_BEDROCK_* and retry.");
    process.exit(1);
  }

  console.log("Harvesting Screener + annual report…");
  const harvest = await harvestCompany(ticker);
  const company = companyArg || harvest.name || ticker;
  console.log(`  company: ${company} | loggedIn: ${harvest.loggedIn} | screener: ${harvest.screenerText.length} chars | AR: ${harvest.annualReportText.length} chars`);
  console.log(`  documents (${harvest.documents.length}): ${harvest.documents.map((d) => `${d.name} [${(d.text.length / 1000).toFixed(0)}k]`).join(", ") || "none"}`);
  if (harvest.note) console.log(`  note: ${harvest.note}`);

  // Extract one verified fact sheet (board, 3-yr P&L, promoter holding — all in
  // INR mn) and inject it into every question so figures stay consistent and
  // never get re-scaled per answer.
  console.log("Building company fact sheet…");
  const facts = await buildCompanyFacts(company, harvest).catch((e) => {
    console.warn(`  fact sheet failed: ${(e as Error).message}`);
    return "";
  });
  console.log(facts ? `  fact sheet: ${facts.split("\n").length} lines` : "  fact sheet: (none)");

  const questions = GOVERNANCE_CHECKLIST.flatMap((s) =>
    s.items.map((item) => ({ sectionId: s.sectionId, questionId: item.questionId, particulars: item.particulars })),
  );

  let filled = 0;
  let backfilled = 0;
  let missing = 0;

  const rows = await pool(questions, CONCURRENCY, async (q) => {
    let ans: EngineAnswer;
    let source = "Annual report / Screener";
    try {
      ans = await answerFromFilings(q.questionId, q.particulars, company, harvest, facts);
    } catch (e) {
      ans = { excelAnswer: "Not retrieved", score: 0, verdict: "Unclear", available: false, source: "Not retrieved" };
      console.warn(`  [${q.questionId}] filings error: ${(e as Error).message}`);
    }
    if (!ans.available) {
      try {
        const bf = await backfillQuestion(q.questionId, q.particulars, company, ticker, facts);
        if (bf.available) {
          ans = bf;
          source = "Web research";
        }
      } catch (e) {
        console.warn(`  [${q.questionId}] backfill error: ${(e as Error).message}`);
      }
    }

    if (ans.available && source === "Web research") backfilled++;
    else if (ans.available) filled++;
    else missing++;
    // ans.source carries the specific citation (e.g. "Annual report, p.147");
    // fall back to the coarse routing label if the answer path didn't set one.
    const citation = ans.available ? (ans.source || source) : "Not retrieved";
    console.log(`  [${q.questionId}] ${ans.available ? citation : "NOT RETRIEVED"} → ${ans.verdict} (${ans.score})`);

    const row: GovernanceRow = {
      sectionId: q.sectionId,
      questionId: q.questionId,
      particulars: q.particulars,
      response: (ans.verdict || "Unclear") as GovernanceResponse,
      score: ans.score,
      maxScore: 0.5,
      remarks: ans.excelAnswer,
      source: citation,
      sourceUrl: ans.available ? sourceUrlFor(citation, harvest) : undefined,
      confidence: confidenceFor(ans),
    };
    return row;
  });

  // Final self-audit (ported from cgchecklist2.0): read the whole report back
  // and safely correct cross-question contradictions, mis-scaled figures, and
  // false-alarm zeros that the isolated per-question pass can't see. Softening
  // only — it can raise a false-alarm score or fix a wrong figure, never lower a
  // score, so a correct answer is never regressed.
  console.log("Reviewing report for consistency…");
  try {
    const reviewed = await reviewRun(rows, facts, company);
    for (const c of reviewed.corrections) {
      console.log(
        `  [QA ${c.questionId}] ${c.scoreFrom}→${c.scoreTo}${c.remarkChanged ? " +remark" : ""}: ${c.issue}`,
      );
    }
    console.log(`Review: ${reviewed.corrections.length} correction(s).`);
  } catch (e) {
    console.warn(`  review error: ${(e as Error).message}`);
  }

  const total = rows.reduce((s, r) => s + r.score, 0);
  const max = rows.reduce((s, r) => s + r.maxScore, 0);
  console.log(`\nCoverage: ${filled} from filings, ${backfilled} from web, ${missing} not retrieved.`);
  console.log(`Score: ${total.toFixed(2)} / ${max.toFixed(1)} (${((total / max) * 100).toFixed(1)}%)`);

  mkdirSync(OUT_DIR, { recursive: true });
  const buffer = await buildBeasChecklistWorkbook({ rows, company });
  writeFileSync(`${OUT_DIR}/${ticker}-cg-report.xlsx`, Buffer.from(buffer as ArrayBuffer));
  writeFileSync(
    `${OUT_DIR}/${ticker}-results.json`,
    JSON.stringify({ ticker, company, total, max, harvestNote: harvest.note, rows }, null, 2),
  );
  console.log(`Wrote ${OUT_DIR}/${ticker}-cg-report.xlsx and ${ticker}-results.json`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
