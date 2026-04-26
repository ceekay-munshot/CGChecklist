/**
 * Source descriptors used by the discovery + adapter layers.
 * The dashboard never fetches directly from third parties; everything
 * routes through the adapter contracts defined here so individual
 * sources can be swapped or composed without UI churn.
 */

export type SourceKind =
  | "screener"
  | "annual-report"
  | "exchange-filing"
  | "ir-page"
  | "news"
  | "other";

export type SourceDescriptor = {
  kind: SourceKind;
  url: string;
  title: string;
  /** ISO date string when the source was published or last updated. */
  publishedAt: string | null;
  /** Confidence between 0–1 from the discovery layer. */
  confidence: number;
};

export type SourcePack = {
  resolvedAt: string;
  sources: SourceDescriptor[];
};
