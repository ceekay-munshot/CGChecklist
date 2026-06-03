// Legacy MUNS settings — still used by /api/search for company resolution.
export const MUNS_API_BASE = "https://birdnest.muns.io";

export const GOVERNANCE_AGENT_UUID = "80e60362-47d9-4077-95ac-41b1a609c0cc";

// Claude governance routine — replaces the MUNS governance agent for
// /api/muns/run. Model is env-overridable (GOVERNANCE_MODEL) without a redeploy.
export const ANTHROPIC_API_BASE = "https://api.anthropic.com";

export const ANTHROPIC_VERSION = "2023-06-01";

export const GOVERNANCE_MODEL =
  process.env.GOVERNANCE_MODEL || "claude-sonnet-4-6";

// Upper bound on web searches Claude may run per governance report.
export const GOVERNANCE_WEB_SEARCH_MAX_USES = 15;

// Token budget for the completed 51-row checklist.
export const GOVERNANCE_MAX_TOKENS = 16000;
