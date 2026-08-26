import type {
  GovernanceConfidence,
  GovernanceResponse,
  GovernanceRow,
  GovernanceScoreValue,
  GovernanceSectionId,
} from "@/lib/types/governance";
import { GOVERNANCE_CHECKLIST } from "@/lib/governance/checklist";
import { parseMunsResponse } from "@/lib/munsParse";

const responseToConfidence = (response: string): GovernanceConfidence => {
  const v = response.toLowerCase().trim();

  // Could-not-establish or failed-fetch answers carry the least certainty.
  if (
    ["", "unclear", "n/a", "na", "not established", "not retrieved"].includes(v)
  ) {
    return "Low";
  }

  // A mixed / partial finding sits in the middle.
  if (["neutral", "average", "moderate", "medium"].includes(v)) {
    return "Medium";
  }

  // Any clear directional verdict — positive or negative — is a confident read.
  return "High";
};

// The scorers reason on a 0/1/2 scale (0 = red, 1 = partial, 2 = clean); the
// report is presented on Beas Capital's 0/0.25/0.5 scale. Convert here, at the
// single row-building boundary, snapping anything in between to the nearest step.
const toHalfScale = (n: number): GovernanceScoreValue => {
  if (n >= 1.5) return 0.5;
  if (n >= 0.5) return 0.25;
  return 0;
};

const findColumn = (headers: string[], needles: string[]): string | undefined =>
  headers.find((h) => needles.some((n) => h.toLowerCase().includes(n)));

// Map a MUNS table title to one of our canonical sections, so an answer can be
// matched preferentially within its own section (longest keyword wins).
const SECTION_TITLE_KEYWORDS: Array<[string, GovernanceSectionId]> = [
  ["industry and promoter", "INDUSTRY_PROMOTER"],
  ["other regulatory", "OTHER_REGULATORY"],
  ["stock exchange", "STOCK_EXCHANGE"],
  ["board", "BOARD"],
  ["audit", "AUDIT"],
  ["stakeholder", "STAKEHOLDERS"],
  ["employee", "EMPLOYEE"],
  ["promoter", "INDUSTRY_PROMOTER"],
  ["exchange", "STOCK_EXCHANGE"],
  ["regulatory", "OTHER_REGULATORY"],
  ["financial", "FINANCIALS"],
].sort((a, b) => b[0].length - a[0].length) as Array<
  [string, GovernanceSectionId]
>;

const sectionFromTitle = (title: string): GovernanceSectionId | undefined => {
  const t = title.toLowerCase();
  for (const [keyword, id] of SECTION_TITLE_KEYWORDS) {
    if (t.includes(keyword)) return id;
  }
  return undefined;
};

// One answer MUNS returned, before it is matched to a canonical checklist item.
interface MunsCandidate {
  response: string;
  score: number;
  remarks: string;
  tokens: Set<string>;
  sectionId?: GovernanceSectionId;
}

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "of", "to", "in", "on", "and", "or", "for",
  "with", "by", "as", "at", "any", "all", "does", "do", "has", "have", "been",
  "over", "last", "than", "that", "this", "its", "vs", "per",
]);

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));

const jaccard = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
};

// Require a meaningful token overlap so unrelated questions never cross-match.
const MATCH_THRESHOLD = 0.34;
// Nudge an answer toward a question in its own MUNS section, so e.g. an
// audit-remuneration answer is not stolen by a board-remuneration question.
const SAME_SECTION_BONUS = 0.1;

const collectCandidates = (raw: string): MunsCandidate[] => {
  const parsed = parseMunsResponse(raw);
  const candidates: MunsCandidate[] = [];

  for (const table of parsed.tables) {
    const particularsCol = findColumn(table.headers, ["particular"]);
    const responseCol = findColumn(table.headers, ["response"]);
    const scoreCol = table.headers.find(
      (h) => h.toLowerCase().trim() === "score",
    );
    const remarksCol = findColumn(table.headers, ["remark"]);
    const sectionId = sectionFromTitle(table.title);

    if (!particularsCol) continue;

    for (const row of table.rows) {
      const particulars = (row[particularsCol] || "").trim();
      if (!particulars) continue;
      candidates.push({
        response: responseCol ? row[responseCol] || "" : "",
        score: scoreCol ? parseInt(row[scoreCol], 10) || 0 : 0,
        remarks: remarksCol ? row[remarksCol] || "" : "",
        tokens: new Set(tokenize(particulars)),
        sectionId,
      });
    }
  }

  return candidates;
};

interface CanonicalItem {
  sectionId: GovernanceSectionId;
  questionId: string;
  particulars: string;
  tokens: Set<string>;
}

const flattenChecklist = (): CanonicalItem[] => {
  const items: CanonicalItem[] = [];
  for (const section of GOVERNANCE_CHECKLIST) {
    for (const item of section.items) {
      items.push({
        sectionId: section.sectionId,
        questionId: item.questionId,
        particulars: item.particulars,
        tokens: new Set(tokenize(item.particulars)),
      });
    }
  }
  return items;
};

// Globally assign each MUNS answer to the ONE canonical question it fits best,
// best-match-first, so a stronger claim always wins the answer. A greedy pass in
// checklist order would let an earlier question (e.g. BOARD-4 "disclosures to
// the remuneration paid") consume a later question's answer (AUDIT-4
// "remuneration paid to the auditors") purely because it is reached first.
const assignMatches = (
  items: CanonicalItem[],
  candidates: MunsCandidate[],
): Array<MunsCandidate | undefined> => {
  const pairs: Array<{ item: number; candidate: number; score: number }> = [];

  for (let i = 0; i < items.length; i += 1) {
    for (let c = 0; c < candidates.length; c += 1) {
      const overlap = jaccard(items[i].tokens, candidates[c].tokens);
      if (overlap < MATCH_THRESHOLD) continue;
      const sameSection =
        candidates[c].sectionId !== undefined &&
        candidates[c].sectionId === items[i].sectionId;
      pairs.push({
        item: i,
        candidate: c,
        score: overlap + (sameSection ? SAME_SECTION_BONUS : 0),
      });
    }
  }

  pairs.sort((a, b) => b.score - a.score);

  const assigned: Array<MunsCandidate | undefined> = new Array(items.length);
  const candidateUsed = new Array(candidates.length).fill(false);

  for (const pair of pairs) {
    if (assigned[pair.item] || candidateUsed[pair.candidate]) continue;
    assigned[pair.item] = candidates[pair.candidate];
    candidateUsed[pair.candidate] = true;
  }

  return assigned;
};

/**
 * Assemble governance rows by iterating the CANONICAL 51-item checklist and
 * matching each item to the MUNS answer it fits best (global best-first
 * assignment, with a same-section preference). Every checklist item always
 * produces exactly one row, in canonical order, with the canonical question
 * text — so a question can never silently go missing (client feedback #1), and
 * an answer can never be assigned to the wrong question. An item MUNS did not
 * answer becomes an explicit "Not retrieved" row (a backfill target).
 */
export const munsHtmlToGovernanceRows = (raw: string): GovernanceRow[] => {
  const candidates = collectCandidates(raw);
  const items = flattenChecklist();
  const matches = assignMatches(items, candidates);

  return items.map((item, index) => {
    const match = matches[index];

    if (match) {
      return {
        sectionId: item.sectionId,
        questionId: item.questionId,
        particulars: item.particulars,
        response: (match.response || "Unclear") as GovernanceResponse,
        score: toHalfScale(match.score),
        maxScore: 0.5,
        remarks: match.remarks || match.response || "",
        source: "MUNS Analysis",
        confidence: responseToConfidence(match.response),
      };
    }

    return {
      sectionId: item.sectionId,
      questionId: item.questionId,
      particulars: item.particulars,
      response: "Not retrieved" as GovernanceResponse,
      score: 0,
      maxScore: 0.5,
      remarks: "",
      source: "MUNS Analysis",
      confidence: "Low",
    };
  });
};
