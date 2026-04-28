import type { DataQualityReport, SourceRef } from "@/lib/types/sources";

export function emptyDataQualityReport(): DataQualityReport {
  return { completeness: 0, flags: [], sources: [] };
}

export async function assessDataQuality(
  _sources: SourceRef[],
): Promise<DataQualityReport> {
  throw new Error(
    "assessDataQuality is not implemented yet. It will validate field coverage, source recency, and conflicting values once adapters return data.",
  );
}
