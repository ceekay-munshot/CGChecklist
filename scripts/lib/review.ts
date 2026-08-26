// FINAL self-audit of a completed run — the automated version of the manual
// report review, ported from cgchecklist2.0's lib/engine/review.ts and adapted
// to our framework (0 / 0.25 / 0.5 scores, full Excel-cell remarks). After all
// 51 questions are answered in isolation, this reads the WHOLE report back and
// catches the bug classes each question can't see on its own:
//   1. a remark that contradicts its own verdict,
//   2. an impossible / mis-scaled number (a raw ₹ amount fed into a %/ratio, a
//      lakh↔crore slip, a 10× decimal shift — inferred from the fact sheet and
//      the other rows),
//   3. a figure that contradicts another row (board size, promoter %, a P&L
//      line stated two different ways).
//
// It corrects only FIGURES in the remark text and NEVER changes a score — the
// per-question consensus judge owns scoring. (An earlier "soften-only" version
// could raise a false-alarm 0, but the ambiguous Yes/No verdict made it clear
// genuine red flags — a forensic tool's worst failure — so score edits were
// removed.) Any model or parse failure is a no-op that leaves the report exactly
// as answered.

import { completeJSON } from "@/lib/engine/llm";
import type { GovernanceRow } from "@/lib/types/governance";
import type { HalfScore } from "./answer";

interface QaFinding {
  question_id?: string;
  issue?: string;
  corrected_remark?: string;
}

export interface QaCorrection {
  questionId: string;
  issue: string;
  scoreFrom: HalfScore;
  scoreTo: HalfScore;
  remarkChanged: boolean;
}

const SYSTEM =
  "You are a senior forensic governance analyst doing the FINAL audit of a " +
  "completed checklist before it reaches the client. You correct only CLEAR, " +
  "defensible errors and never re-litigate borderline matters of degree.";

const QA_PROMPT =
  `Below is a completed corporate-governance checklist for one company: each row is ` +
  `question_id | particulars | SCORE (0 / 0.25 / 0.5) | verdict | the finding text. A ` +
  `VERIFIED FACT SHEET (board size, 3-year P&L, promoter holding — all in INR mn) may ` +
  `precede the rows; treat its figures as ground truth.\n\n` +
  `You may ONLY correct wrong FIGURES in the finding text. You must NOT change any ` +
  `score, verdict, or the thrust of any finding — a 0 stays a 0. Find ONLY these:\n` +
  `1. IMPOSSIBLE / MIS-SCALED NUMBER — a figure ~10× or ~100× off (e.g. a net loss of ` +
  `740 where the fact sheet and other rows say 74; a lakh labelled crore; a raw ₹ amount ` +
  `stated as a "% of net worth / PBT"). Correct the figure(s) in the remark to the right ` +
  `scale, inferring it from the fact sheet and the other rows.\n` +
  `2. CONTRADICTS ANOTHER ROW — the same fact given two ways (board of 12 in one row, 13 in ` +
  `another; promoter holding 66% vs 70% for the same date). Correct the outlier to match the ` +
  `fact sheet / the majority of rows.\n\n` +
  `HARD RULES — safety first:\n` +
  `- Change ONLY numbers. Never rewrite the analysis, never flip a red flag to benign, never ` +
  `touch a row whose figures are already right.\n` +
  `- When you fix a figure, return the FULL corrected remark, preserving every other ` +
  `sentence and all correct detail verbatim — change only the wrong number(s).\n` +
  `- Only CLEAR, defensible figure errors. If a row's numbers are sound, do not include it.\n\n` +
  `Return STRICT JSON only: {"findings":[{"question_id":"<id>","issue":"<one line>",` +
  `"corrected_remark":"<full corrected remark with the fixed number(s)>"}]}\n\n`;

/**
 * Audit the assembled rows and apply only safe FIGURE corrections in the remark
 * text (a mis-scaled or cross-row-contradictory number). Never changes a score.
 * Mutates and returns the rows plus the list of corrections. Best-effort — never
 * throws.
 */
export async function reviewRun(
  rows: GovernanceRow[],
  facts: string,
  company: string,
): Promise<{ rows: GovernanceRow[]; corrections: QaCorrection[] }> {
  if (rows.length < 20) return { rows, corrections: [] };

  const view = rows
    .map(
      (r) =>
        `${r.questionId} | ${r.particulars} | SCORE=${r.score} | ${r.response} | ${(r.remarks ?? "")
          .replace(/\s+/g, " ")
          .slice(0, 700)}`,
    )
    .join("\n");
  const prompt =
    QA_PROMPT +
    (facts ? `${facts}\n\n` : "") +
    `COMPANY: ${company}\n\nCHECKLIST ROWS:\n${view}`;

  let findings: QaFinding[];
  try {
    const out = await completeJSON<{ findings?: QaFinding[] }>({
      prompt,
      system: SYSTEM,
      maxTokens: 4000,
    });
    findings = Array.isArray(out.findings) ? out.findings : [];
  } catch {
    return { rows, corrections: [] };
  }

  const byId = new Map(rows.map((r) => [r.questionId, r]));
  const corrections: QaCorrection[] = [];

  for (const f of findings) {
    const r = f.question_id ? byId.get(f.question_id) : undefined;
    if (!r) continue;

    const before = r.score;
    let remarkChanged = false;

    // The review NEVER changes a score. It ran as "soften-only" (raise a
    // false-alarm 0), but the Yes/No verdict word is ambiguous — "Yes, red flags
    // exist" scored 0 looks to the auditor like a benign 0 to raise — so it was
    // silently clearing genuine red flags (a forensic tool's worst failure). The
    // per-question consensus judge owns the score; the review only fixes a
    // mis-scaled or contradictory FIGURE in the remark text.

    // Remark: apply a corrected figure only when it preserves the answer's length
    // (a full rewrite that shrinks the text is a red flag for the QA hallucinating,
    // so we reject it — a real figure fix keeps the sentence intact).
    const fix = (f.corrected_remark ?? "").trim();
    if (
      fix &&
      fix !== (r.remarks ?? "").trim() &&
      fix.length >= (r.remarks ?? "").length * 0.6
    ) {
      r.remarks = fix;
      remarkChanged = true;
    }

    if (r.score !== before || remarkChanged) {
      corrections.push({
        questionId: r.questionId,
        issue: (f.issue ?? "").slice(0, 200),
        scoreFrom: before,
        scoreTo: r.score,
        remarkChanged,
      });
    }
  }

  return { rows, corrections };
}
