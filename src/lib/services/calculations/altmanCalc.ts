import { EMPTY_ALTMAN } from "@/lib/mock/altmanMock";
import type { AltmanModule } from "@/lib/types/scores";

/**
 * Altman Z-Score — placeholder.
 *
 * Future implementation will support three model variants:
 *   - Z  (manufacturing, public): X1..X5 with original 1968 weights
 *   - Z' (private / non-manufacturing)
 *   - Z" (emerging markets, services)
 *
 * Variant selection happens upstream in the calculation pipeline based
 * on the resolved company's classification (sector + listing status).
 */
export async function computeAltman(): Promise<AltmanModule> {
  return EMPTY_ALTMAN;
}
