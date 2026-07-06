export const MUNS_API_BASE = "https://birdnest.muns.io";

export const GOVERNANCE_AGENT_UUID = "80e60362-47d9-4077-95ac-41b1a609c0cc";

export const MUNS_CHAT_API_URL = "https://birdnest.muns.io/chat/chat-muns";

export const MUNS_CHAT_CONTEXT_EMAIL = "ceekay@muns.io";

/**
 * Number of independent chat sessions the checklist is split across. Each lane
 * runs as its own /api/muns/run invocation (fanned out by the server-side
 * coordinator), so each gets its own Cloudflare 50-subrequest budget. Shared by
 * client and server so the fan-out count and the server-side split agree.
 */
export const PARALLEL_LANES = 2;

// ---------------------------------------------------------------------------
// Country handling
//
// A run is keyed by a canonical country NAME ("INDIA"), while the UI carries
// short codes ("IN"). Centralised here so every route that builds a run- or
// job-key (run, assemble, start, status) resolves a country identically —
// otherwise a run started under one key could never be found under another.
// ---------------------------------------------------------------------------
export const COUNTRY_CODE_TO_NAME: Record<string, string> = {
  IN: "INDIA",
  US: "UNITED STATES",
  GB: "UNITED KINGDOM",
  HK: "HONG KONG",
  JP: "JAPAN",
  AU: "AUSTRALIA",
  SG: "SINGAPORE",
};

/** Map a UI country code (or raw name) to the canonical run-key country name. */
export const resolveCountry = (country?: string | null): string => {
  if (!country) return "INDIA";
  return COUNTRY_CODE_TO_NAME[country] || country.toUpperCase();
};
