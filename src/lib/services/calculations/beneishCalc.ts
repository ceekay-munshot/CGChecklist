import { EMPTY_BENEISH } from "@/lib/mock/beneishMock";
import type { BeneishModule } from "@/lib/types/scores";

/**
 * Beneish M-Score — placeholder.
 *
 * Future implementation will compute the eight-variable M-Score:
 *   M = -4.84 + 0.92·DSRI + 0.528·GMI + 0.404·AQI + 0.892·SGI
 *       + 0.115·DEPI - 0.172·SGAI + 4.679·TATA - 0.327·LVGI
 *
 * Source data: two consecutive annual financials (current vs prior).
 * Adapter inputs: screenerAdapter (preferred for IN), with fallbacks to
 * annual report extraction for missing line items.
 */
export async function computeBeneish(): Promise<BeneishModule> {
  return EMPTY_BENEISH;
}
