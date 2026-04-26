import type { DataStatus } from "@/lib/types/company";

/**
 * Data quality checks — placeholder.
 *
 * Future responsibilities:
 *  - Cross-source consistency (does Screener match the annual report?)
 *  - Completeness of line items required by each module
 *  - Recency (is the latest filing within the freshness window?)
 *  - Outlier detection on raw financials before they reach calculations
 *
 * Output drives the data-status badge in the header and per-module
 * "data quality" callouts on each tab.
 */
export type DataQualityReport = {
  overall: DataStatus;
  notes: string[];
};

export async function runDataQuality(): Promise<DataQualityReport> {
  return {
    overall: "idle",
    notes: [],
  };
}
