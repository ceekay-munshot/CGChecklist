export const MUNS_API_BASE = "https://birdnest.muns.io";

export const GOVERNANCE_AGENT_UUID = "80e60362-47d9-4077-95ac-41b1a609c0cc";

export const MUNS_CHAT_API_URL = "https://birdnest.muns.io/chat/chat-muns";

export const MUNS_CHAT_CONTEXT_EMAIL = "ceekay@muns.io";

/**
 * Number of independent chat sessions the checklist is split across. Each lane
 * runs as its own /api/muns/run invocation (the browser fans them out), so each
 * gets its own Cloudflare 50-subrequest budget. Shared by client and server so
 * the fan-out count and the server-side split agree.
 */
export const PARALLEL_LANES = 2;
