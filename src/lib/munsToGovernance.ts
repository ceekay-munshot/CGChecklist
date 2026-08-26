import type {
  GovernanceConfidence,
  GovernanceResponse,
  GovernanceRow,
  GovernanceScoreValue,
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

// One answer MUNS returned, before it is matched to a canonical checklist item.
interface MunsCandidate {
  particulars: string;
  response: string;
  score: number;
  remarks: string;
  used: boolean;
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

// Fuzzy-match a canonical question to the closest unused MUNS answer by
// token overlap (Jaccard). MUNS often rewords the question, so an exact match
// is unreliable; this tolerates rewording while staying specific enough not to
// cross-match different questions.
const bestMatch = (
  question: string,
  candidates: MunsCandidate[],
): MunsCandidate | undefined => {
  const qTokens = new Set(tokenize(question));
  if (qTokens.size === 0) return undefined;

  let best: MunsCandidate | undefined;
  let bestScore = 0;

  for (const candidate of candidates) {
    if (candidate.used) continue;
    const cTokens = new Set(tokenize(candidate.particulars));
    if (cTokens.size === 0) continue;

    let intersection = 0;
    for (const token of qTokens) if (cTokens.has(token)) intersection += 1;
    const union = qTokens.size + cTokens.size - intersection;
    const jaccard = union > 0 ? intersection / union : 0;

    if (jaccard > bestScore) {
      bestScore = jaccard;
      best = candidate;
    }
  }

  // Require a meaningful overlap so unrelated questions never cross-match.
  return bestScore >= 0.34 ? best : undefined;
};

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

    if (!particularsCol) continue;

    for (const row of table.rows) {
      const particulars = (row[particularsCol] || "").trim();
      if (!particulars) continue;
      candidates.push({
        particulars,
        response: responseCol ? row[responseCol] || "" : "",
        score: scoreCol ? parseInt(row[scoreCol], 10) || 0 : 0,
        remarks: remarksCol ? row[remarksCol] || "" : "",
        used: false,
      });
    }
  }

  return candidates;
};

/**
 * Assemble governance rows by iterating the CANONICAL 51-item checklist and
 * matching each item to the closest answer MUNS returned. Every checklist item
 * always produces exactly one row, in canonical order, with the canonical
 * question text — so a question can never silently go missing (client feedback
 * #1). An item MUNS did not answer becomes an explicit "Not retrieved" row
 * rather than vanishing, which is what a real backfill pass then targets.
 */
export const munsHtmlToGovernanceRows = (raw: string): GovernanceRow[] => {
  const candidates = collectCandidates(raw);
  const rows: GovernanceRow[] = [];

  for (const section of GOVERNANCE_CHECKLIST) {
    for (const item of section.items) {
      const match = bestMatch(item.particulars, candidates);

      if (match) {
        match.used = true;
        rows.push({
          sectionId: section.sectionId,
          questionId: item.questionId,
          particulars: item.particulars,
          response: (match.response || "Unclear") as GovernanceResponse,
          score: toHalfScale(match.score),
          maxScore: 0.5,
          remarks: match.remarks || match.response || "",
          source: "MUNS Analysis",
          confidence: responseToConfidence(match.response),
        });
      } else {
        rows.push({
          sectionId: section.sectionId,
          questionId: item.questionId,
          particulars: item.particulars,
          response: "Not retrieved" as GovernanceResponse,
          score: 0,
          maxScore: 0.5,
          remarks: "",
          source: "MUNS Analysis",
          confidence: "Low",
        });
      }
    }
  }

  return rows;
};
