import type { Exchange } from "@/lib/types/company";

export const EXCHANGES: Exchange[] = [
  { code: "NSE", label: "NSE — National Stock Exchange of India", countryCode: "IN" },
  { code: "BSE", label: "BSE — Bombay Stock Exchange", countryCode: "IN" },
  { code: "NASDAQ", label: "NASDAQ", countryCode: "US" },
  { code: "NYSE", label: "NYSE — New York Stock Exchange", countryCode: "US" },
  { code: "LSE", label: "LSE — London Stock Exchange", countryCode: "GB" },
  { code: "HKEX", label: "HKEX — Hong Kong Exchange", countryCode: "HK" },
  { code: "TSE", label: "TSE — Tokyo Stock Exchange", countryCode: "JP" },
  { code: "SGX", label: "SGX — Singapore Exchange", countryCode: "SG" },
];
