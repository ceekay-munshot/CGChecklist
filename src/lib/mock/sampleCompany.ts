import type { CompanyQuery } from "@/lib/types/company";

/**
 * Default placeholder query rendered before the user submits anything.
 * Strings are intentionally empty — the dashboard must not pretend to
 * know any real company until the user enters one and clicks Refresh.
 */
export const EMPTY_COMPANY_QUERY: CompanyQuery = {
  name: "",
  ticker: "",
  exchangeCode: "",
  countryCode: "",
};

/**
 * Sample placeholder for design-time previews only.
 * Never shipped to the rendered UI — kept here so future
 * mocks/tests can import a deterministic fixture.
 */
export const PREVIEW_COMPANY_QUERY: CompanyQuery = {
  name: "Sample Industries Ltd.",
  ticker: "SAMPLE",
  exchangeCode: "NSE",
  countryCode: "IN",
};
