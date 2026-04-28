import type { Exchange } from "@/lib/types/company";

export const EXCHANGES: Exchange[] = [
  { code: "NSE", label: "National Stock Exchange of India", country: "IN" },
  { code: "BSE", label: "Bombay Stock Exchange", country: "IN" },
  { code: "NYSE", label: "New York Stock Exchange", country: "US" },
  { code: "NASDAQ", label: "Nasdaq", country: "US" },
  { code: "LSE", label: "London Stock Exchange", country: "GB" },
  { code: "HKEX", label: "Hong Kong Exchange", country: "HK" },
  { code: "TSE", label: "Tokyo Stock Exchange", country: "JP" },
  { code: "ASX", label: "Australian Securities Exchange", country: "AU" },
  { code: "OTHER", label: "Other / Not listed", country: "OTHER" },
];
