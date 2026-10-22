// Governance checklist runner — mirrors the real dashboard's chat flow so
// answers come out COMPLETE (no cut-offs).
//
// Per session (lane) it first sends the dashboard's MEGA prompt to warm the
// session + load the company's "auto data" ONCE, then asks each question on the
// same chat_id with the running chatHistory — exactly like munsChatService /
// cool_script. autoAddUpcoming + GET_ANNOUNCEMENTS_ENABLED are on (the fix), so
// documents are read once and reused.
//
// Runs a SLICE of the 51 questions (offset..offset+count) so the checklist can
// be completed in credit-watched batches. Captures every answer and writes
// out/answers.json (keyed by global question number) + out/answers.txt.
//
// Usage: node run-governance.mjs <TICKER> "<Company>" <offset> <count> [lanes]
// Token: MUNS_TOKEN (CI) or TEMPORARY_TOKEN.

import { writeFileSync, mkdirSync } from "node:fs";

const [TICKER = "", COMPANY = "", OFFSET = "0", COUNT = "51", LANES = "1"] = process.argv.slice(2);
const token = process.env.MUNS_TOKEN || process.env.TEMPORARY_TOKEN;
if (!token) { console.error("Set MUNS_TOKEN or TEMPORARY_TOKEN"); process.exit(1); }
if (!TICKER || !COMPANY) { console.error('Usage: node run-governance.mjs <TICKER> "<Company>" <offset> <count> [lanes]'); process.exit(1); }

const CHAT_API = "https://birdnest.muns.io/chat/chat-muns";
const today = new Date().toISOString().slice(0, 10);
const from = new Date(Date.now() - 2 * 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
const ONE_LINE = " Answer in THREE BULLET POINTS ONLY STRICTLY.";
const MEGA =
  "Make structured tables answering the below questions for the company . If an answer is Not established or Not available in the annual report - Quickly Websearch and find it . Keep each answer specific to the company with exact figures, names and dates - never generic . State the finding directly and crisply : give the fact itself with the key number(s) . Do NOT narrate the evidence, the sources or the search process, and do NOT say what a report 'does or does not disclose' - just answer . No hedging, no filler . Use the exact name of the ceo/company/elements in each answer only . DOUBLE CHECK AND VERIFY EACH ANSWER BEFORE ANSWERING." + ONE_LINE;
const Q_TIMEOUT_MS = 480_000;
const MEGA_TIMEOUT_MS = 300_000;

// The 51 governance questions, in order, with their section (matches cool_script.sh).
const CHECKLIST = [
  ["Board of Directors", "Does the board consist of >50% independent directors?"],
  ["Board of Directors", "Is the chairman non-executive?"],
  ["Board of Directors", "Are all relationships or transactions of non-executive directors disclosed in the annual report?"],
  ["Board of Directors", "What are the disclosures on remuneration paid to directors?"],
  ["Board of Directors", "What is the reputation of the directors?"],
  ["Audit", "Are the company's auditors a Big 4 firm?"],
  ["Audit", "Are subsidiary accounts audited by a Big 4 auditor?"],
  ["Audit", "Are there any qualifications in the auditor's report?"],
  ["Audit", "What remuneration was paid to the auditors?"],
  ["Audit", "When was the last change in auditors and the reason for the change?"],
  ["Stakeholders", "Is the free float in the market high or low?"],
  ["Stakeholders", "Any recent entry and exit by PE funds or HNIs?"],
  ["Employee", "What is the employee attrition rate?"],
  ["Employee", "How does employee remuneration compare to industry standards?"],
  ["Employee", "What is the ESOP pool?"],
  ["Industry and Promoter", "What is the promoter stake (%) — above or below 50?"],
  ["Industry and Promoter", "What is the promoter stake trend over the last 8 quarters?"],
  ["Industry and Promoter", "Does the promoter have other material businesses?"],
  ["Industry and Promoter", "Is the business run by a professional CEO?"],
  ["Industry and Promoter", "What is the view on the CEO?"],
  ["Industry and Promoter", "What is the promoter's vintage and involvement in the business?"],
  ["Industry and Promoter", "What is the vintage of the top management team in the company?"],
  ["Industry and Promoter", "What is the quality of the second-level management team?"],
  ["Industry and Promoter", "Family dynamics — is there any fight?"],
  ["Industry and Promoter", "How does the company deal with the government?"],
  ["Industry and Promoter", "Any cases from ED, SEBI or other institutions?"],
  ["Industry and Promoter", "Does the promoter have political connections?"],
  ["Industry and Promoter", "Is there transparency on analyst calls?"],
  ["Industry and Promoter", "Is there any shareholding pledge?"],
  ["Industry and Promoter", "What is the leverage?"],
  ["Stock Exchange", "Are there adequate disclosures and compliance to SEBI guidelines?"],
  ["Stock Exchange", "What is the volatility in the stock?"],
  ["Stock Exchange", "Is the volume and liquidity in the stock high or low?"],
  ["Stock Exchange", "Is the stock covered by domestic / MNC analyst coverage?"],
  ["Other Regulatory", "Any contingent tax or liability — if material?"],
  ["Financials", "Any material red flags in notes to accounts and contingent liabilities?"],
  ["Financials", "Debt & advances — high or low?"],
  ["Financials", "Receivables greater than 6 months as a % of revenues?"],
  ["Financials", "Who are the bankers — top private/PSU or not?"],
  ["Financials", "Is there a consistent dividend payout?"],
  ["Financials", "Cash EPS vs accounting EPS — low or high?"],
  ["Financials", "Disclosure on all related party transactions?"],
  ["Financials", "What is CFO / EBITDA?"],
  ["Financials", "What is the provisioning?"],
  ["Financials", "Are there fluctuating depreciation rates?"],
  ["Financials", "Any other notable red flags?"],
  ["Financials", "What is the working capital cycle?"],
  ["Financials", "Are auditor fees transparently disclosed?"],
  ["Financials", "Is asset growth significantly outpacing revenue growth?"],
  ["Financials", "Are contingent liabilities greater than 20x net worth?"],
  ["Financials", "Is provisioning coverage below industry norms or falling?"],
];

const offset = Number(OFFSET);
const count = Number(COUNT);
const slice = CHECKLIST.slice(offset, offset + count).map(([section, q], k) => ({ n: offset + k + 1, section, q }));

function payloadFor(task, chatId, chatHistory) {
  const p = {
    user_index: 1,
    tasks: [task],
    query_context: {
      TICKER_SYMBOL: [TICKER], FROM_DATE: from, TO_DATE: today,
      ANNOUNCEMENT_FORM_TYPE: "all", DOCUMENT_IDS: [], CATEGORIES: [],
      WEB_SEARCH_ENABLED: true, COUNTRY: [],
      CONTEXT_EMAIL: "ceekay@muns.io", CONTEXT_COMPANY_NAME: [COMPANY],
      GET_ANNOUNCEMENTS_ENABLED: true, // the fix
      chatHistory, mode: "expert",
    },
    autoAddUpcoming: true, // the fix
  };
  if (chatId) p.chat_id = chatId;
  return p;
}

function decode(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&apos;/g, "'");
}
function extractAns(body) {
  const blocks = [...body.matchAll(/<ans>([\s\S]*?)<\/ans>/gi)].map((m) => m[1].trim()).filter(Boolean);
  if (blocks.length) return decode(blocks.join("\n\n"));
  const i = body.search(/<ans\b[^>]*>/i);
  if (i !== -1) return decode(body.slice(i).replace(/<ans\b[^>]*>/i, "").replace(/<tool\b[\s\S]*?<\/tool>/gi, "").replace(/<\/?[a-z0-9_:]+\/?>/gi, "").trim());
  return "";
}

async function ask(task, chatId, chatHistory, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(CHAT_API, {
      method: "POST",
      headers: { accept: "*/*", Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payloadFor(task, chatId, chatHistory)),
      signal: ctrl.signal,
    });
    const cid = res.headers.get("x-chat-id") || chatId;
    let body = "";
    if (res.body) {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        body += dec.decode(value, { stream: true });
        if (/<\/ans>/i.test(body) || /<eos/i.test(body)) { try { await reader.cancel(); } catch {} break; }
      }
    } else { body = await res.text(); }
    clearTimeout(timer);
    return { ok: res.ok, status: res.status, chatId: cid, answer: extractAns(body), ms: Date.now() - start };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, status: 0, chatId, answer: "", ms: Date.now() - start, error: String((e && e.message) || e) };
  }
}

const laneCount = Math.max(1, Math.min(Number(LANES), slice.length));
const lanes = Array.from({ length: laneCount }, () => []);
slice.forEach((item, i) => lanes[i % laneCount].push(item));
console.log(`=== ${COMPANY} (${TICKER}) — questions ${offset + 1}..${offset + slice.length} across ${laneCount} lane(s), auto-data ON ===`);

const results = [];
await Promise.all(lanes.map(async (items, lane) => {
  // Warm the session with the MEGA prompt first (loads auto-data once).
  const mega = await ask(MEGA, "", [], MEGA_TIMEOUT_MS);
  let chatId = mega.chatId;
  const history = [`User: ${MEGA}`, `AI: ${(mega.answer || "").slice(0, 800)}`];
  console.log(`[lane ${lane}] mega primed: HTTP ${mega.status}, ${Math.round(mega.ms / 1000)}s, chat_id=${chatId || "none"}`);
  for (const item of items) {
    const r = await ask(`${item.q}${ONE_LINE}`, chatId, history, Q_TIMEOUT_MS);
    chatId = r.chatId || chatId;
    history.push(`User: ${item.q}`, `AI: ${(r.answer || "").slice(0, 800)}`);
    while (history.length > 18) history.splice(2, 2); // keep MEGA + recent context
    results.push({ ...item, status: r.status, ms: r.ms, answer: r.answer, error: r.error });
    console.log(`\n===== Q${item.n} [${item.section}]: ${item.q}  (HTTP ${r.status}, ${Math.round(r.ms / 1000)}s) =====\n${r.answer || `[no answer${r.error ? ": " + r.error : ""}]`}`);
  }
}));

results.sort((a, b) => a.n - b.n);
mkdirSync("out", { recursive: true });
writeFileSync(`out/answers-${offset + 1}-${offset + slice.length}.json`, JSON.stringify({ ticker: TICKER, company: COMPANY, offset, count: slice.length, results }, null, 2));
writeFileSync(`out/answers-${offset + 1}-${offset + slice.length}.txt`, results.map((r) => `### Q${r.n} [${r.section}]: ${r.q}\n(HTTP ${r.status}, ${Math.round(r.ms / 1000)}s)\n${r.answer || "[no answer]"}\n`).join("\n"));

const ok = results.filter((r) => r.answer).length;
console.log(`\n=== Done: ${ok}/${slice.length} answered. Wrote out/answers-${offset + 1}-${offset + slice.length}.{json,txt} ===`);
console.log("Compare Firecrawl credits before/after this slot.");
