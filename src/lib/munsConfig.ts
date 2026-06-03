export const MUNS_API_BASE = "https://birdnest.muns.io";

export const GOVERNANCE_AGENT_UUID = "80e60362-47d9-4077-95ac-41b1a609c0cc";

// Claude Code routines API — used server-side by /api/verify/start to fire the
// remark-verification routine. The fire endpoint only returns a session id/url;
// the routine delivers its JSON result back via the /api/verify/callback POST.
export const ROUTINES_API_BASE = "https://api.anthropic.com";

export const ROUTINES_BETA_HEADER = "experimental-cc-routine-2026-04-01";

export const ROUTINES_API_VERSION = "2023-06-01";

export const routineFireUrl = (triggerId: string): string =>
  `${ROUTINES_API_BASE}/v1/claude_code/routines/${triggerId}/fire`;
