import {
  GOVERNANCE_CHECKLIST,
  GOVERNANCE_TOTAL_ITEMS,
} from "@/lib/governance/checklist";
import type {
  GovernanceRating,
  GovernanceRow,
  GovernanceSectionId,
  GovernanceSectionSummary,
  GovernanceTotals,
} from "@/lib/types/governance";

const SECTION_ORDER: GovernanceSectionId[] = GOVERNANCE_CHECKLIST.map(
  (section) => section.sectionId,
);

const SECTION_TITLES: Record<GovernanceSectionId, string> =
  GOVERNANCE_CHECKLIST.reduce(
    (acc, section) => {
      acc[section.sectionId] = section.title;
      return acc;
    },
    {} as Record<GovernanceSectionId, string>,
  );

let warned = false;
function warnIfWrongCount(rows: GovernanceRow[]) {
  if (warned) return;
  if (rows.length !== GOVERNANCE_TOTAL_ITEMS) {
    warned = true;
    if (typeof console !== "undefined") {
      console.warn(
        `[governanceCalc] Expected ${GOVERNANCE_TOTAL_ITEMS} checklist rows, received ${rows.length}. ` +
          `The denominator is computed from the rows passed in and is not silently corrected.`,
      );
    }
  }
}

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export function classifyGovernanceScore(
  scorePercent: number,
): GovernanceRating {
  if (scorePercent >= 80) return "Strong";
  if (scorePercent >= 65) return "Good";
  if (scorePercent >= 50) return "Moderate";
  return "Weak";
}

export function calculateGovernanceScore(
  rows: GovernanceRow[],
): GovernanceTotals {
  warnIfWrongCount(rows);

  let totalScore = 0;
  let totalMaxScore = 0;
  let redFlagRows = 0;
  let lowConfidenceRows = 0;

  for (const row of rows) {
    totalScore += row.score;
    totalMaxScore += row.maxScore;
    if (row.score === 0) redFlagRows += 1;
    if (row.confidence === "Low") lowConfidenceRows += 1;
  }

  const overallScorePercent =
    totalMaxScore > 0 ? roundOneDecimal((totalScore / totalMaxScore) * 100) : 0;

  return {
    totalScore,
    totalMaxScore,
    overallScorePercent,
    rating: classifyGovernanceScore(overallScorePercent),
    redFlagRows,
    lowConfidenceRows,
    rowCount: rows.length,
  };
}

export function getGovernanceSectionSummaries(
  rows: GovernanceRow[],
): GovernanceSectionSummary[] {
  warnIfWrongCount(rows);

  const buckets = new Map<
    GovernanceSectionId,
    {
      score: number;
      maxScore: number;
      redFlags: number;
      lowConfidence: number;
    }
  >();

  for (const row of rows) {
    const bucket = buckets.get(row.sectionId) ?? {
      score: 0,
      maxScore: 0,
      redFlags: 0,
      lowConfidence: 0,
    };
    bucket.score += row.score;
    bucket.maxScore += row.maxScore;
    if (row.score === 0) bucket.redFlags += 1;
    if (row.confidence === "Low") bucket.lowConfidence += 1;
    buckets.set(row.sectionId, bucket);
  }

  return SECTION_ORDER.filter((id) => buckets.has(id)).map((id) => {
    const bucket = buckets.get(id)!;
    const scorePercent =
      bucket.maxScore > 0
        ? roundOneDecimal((bucket.score / bucket.maxScore) * 100)
        : 0;
    return {
      sectionId: id,
      title: SECTION_TITLES[id],
      score: bucket.score,
      maxScore: bucket.maxScore,
      scorePercent,
      rating: classifyGovernanceScore(scorePercent),
      redFlags: bucket.redFlags,
      lowConfidence: bucket.lowConfidence,
    };
  });
}
