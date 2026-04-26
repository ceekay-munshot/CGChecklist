import { EMPTY_GOVERNANCE } from "@/lib/mock/governanceMock";
import type { GovernanceModule } from "@/lib/types/scores";

/**
 * Corporate Governance score — placeholder.
 *
 * Future implementation will produce a weighted 0–100 score across
 * categories such as: board independence, audit quality, related-party
 * transactions, promoter pledging, disclosure quality, capital
 * allocation discipline, and regulatory standing.
 *
 * Inputs will arrive from the annual-report and exchange-filing
 * adapters; the scoring rubric lives here so it can be unit-tested
 * independently of the scrape layer.
 */
export async function computeGovernance(): Promise<GovernanceModule> {
  return EMPTY_GOVERNANCE;
}
