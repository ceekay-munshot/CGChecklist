// Credit + answer-quality test for the MUNS "auto data" fix.
//
// Runs COUNT governance questions for ONE company across LANES parallel chat
// sessions (each lane reuses its own chat_id, like the dashboard's lanes), with
// autoAddUpcoming + GET_ANNOUNCEMENTS_ENABLED = true (the fix). It streams each
// response and stops as soon as the <ans>...</ans> answer arrives, so it is far
// faster than waiting for the server to close the connection.
//
// It prints each answer (so output QUALITY can be reviewed in the logs) plus the
// per-question HTTP + time, and writes out/answers.{json,txt}. Watch the Firecrawl
// dashboard credits before/after: with the fix, each document is read ~once per
// lane (not once per question), so credits stay low.
//
// Usage: node credit-quality-test.mjs <COUNT> <TICKER> "<Company>" [LANES]
// Token: MUNS_TOKEN (CI) or TEMPORARY_TOKEN.

import { writeFileSync, mkdirSync } from "node:fs";

const [COUNT = "20", TICKER = "", COMPANY = "", LANES = "4"] = process.argv.slice(2);
const token = process.env.MUNS_TOKEN || process.env.TEMPORARY_TOKEN;
if (!token) { console.error("Set MUNS_TOKEN or TEMPORARY_TOKEN"); process.exit(1); }
if (!TICKER || !COMPANY) {
  console.error('Usage: node credit-quality-test.mjs <COUNT> <TICKER> "<Company>" [LANES]');
  process.exit(1);
}

const CHAT_API = "https://birdnest.muns.io/chat/chat-muns";
const today = new Date().toISOString().slice(0, 10);
const from = new Date(Date.now() - 2 * 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
const INSTRUCT = "Answer specifically for this company with exact figures, names and dates. State the finding directly, no hedging.";
const SUFFIX = " Answer in THREE BULLET POINTS ONLY STRICTLY.";
const PER_Q_TIMEOUT_MS = 360_000;

const ALL_QUESTIONS = [
  "Does the board consist of >50% independent directors?",
  "Is the chairman non-executive?",
  "Are all relationships or transactions of non-executive directors disclosed in the annual report?",
  "What are the disclosures on remuneration paid to directors?",
  "What is the reputation of the directors?",
  "Are the company's auditors a Big 4 firm?",
  "Are subsidiary accounts audited by a Big 4 auditor?",
  "Are there any qualifications in the auditor's report?",
  "What remuneration was paid to the auditors?",
  "When was the last change in auditors and the reason for the change?",
  "Is the free float in the market high or low?",
  "Any recent entry or exit by PE funds or HNIs?",
  "What is the employee attrition rate?",
  "How does employee remuneration compare to industry standards?",
  "What is the ESOP pool?",
  "What is the promoter stake (% — above or below 50)?",
  "What is the promoter stake trend over the last 8 quarters?",
  "Does the promoter have other material businesses?",
  "Is the business run by a professional CEO?",
  "What is the view on the CEO?",
];
const QUESTIONS = ALL_QUESTIONS.slice(0, Number(COUNT));

function payloadFor(task, chatId) {
  const p = {
    user_index: 1,
    tasks: [`${INSTRUCT} ${task}${SUFFIX}`],
    query_context: {
      TICKER_SYMBOL: [TICKER], FROM_DATE: from, TO_DATE: today,
      ANNOUNCEMENT_FORM_TYPE: "all", DOCUMENT_IDS: [], CATEGORIES: [],
      WEB_SEARCH_ENABLED: true, COUNTRY: [],
      CONTEXT_EMAIL: "ceekay@muns.io", CONTEXT_COMPANY_NAME: [COMPANY],
      GET_ANNOUNCEMENTS_ENABLED: true, // the fix
      chatHistory: [], mode: "expert",
    },
    autoAddUpcoming: true, // the fix
  };
  if (chatId) p.chat_id = chatId;
  return p;
}

function extractAns(body) {
  const blocks = [...body.matchAll(/<ans>([\s\S]*?)<\/ans>/gi)].map((m) => m[1].trim()).filter(Boolean);
  if (blocks.length) return decode(blocks.join("\n\n"));
  const i = body.search(/<ans\b[^>]*>/i);
  if (i !== -1) return decode(body.slice(i).replace(/<ans\b[^>]*>/i, "").replace(/<\/?[a-z0-9_:]+\/?>/gi, "").trim());
  return "";
}
function decode(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&apos;/g, "'");
}

async function ask(task, chatId) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PER_Q_TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(CHAT_API, {
      method: "POST",
      headers: { accept: "*/*", Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payloadFor(task, chatId)),
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
    } else {
      body = await res.text();
    }
    clearTimeout(timer);
    return { ok: res.ok, status: res.status, chatId: cid, answer: extractAns(body), ms: Date.now() - start };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, status: 0, chatId, answer: "", ms: Date.now() - start, error: String((e && e.message) || e) };
  }
}

const n = QUESTIONS.length;
const laneCount = Math.max(1, Math.min(Number(LANES), n));
const lanes = Array.from({ length: laneCount }, () => []);
QUESTIONS.forEach((_, i) => lanes[i % laneCount].push(i));
console.log(`=== ${COMPANY} (${TICKER}) — ${n} questions across ${laneCount} lanes, auto-data ON ===`);

const results = new Array(n);
await Promise.all(lanes.map(async (idxs) => {
  let chatId = "";
  for (const i of idxs) {
    const r = await ask(QUESTIONS[i], chatId);
    chatId = r.chatId || chatId;
    results[i] = { q: QUESTIONS[i], ...r };
    console.log(`\n===== Q${i + 1}: ${QUESTIONS[i]}  (HTTP ${r.status}, ${Math.round(r.ms / 1000)}s) =====\n${r.answer || `[no answer${r.error ? ": " + r.error : ""}]`}`);
  }
}));

mkdirSync("out", { recursive: true });
writeFileSync("out/answers.json", JSON.stringify({ ticker: TICKER, company: COMPANY, count: n, lanes: laneCount, results }, null, 2));
writeFileSync("out/answers.txt", results.map((r, i) => `### Q${i + 1}: ${r.q}\n(HTTP ${r.status}, ${Math.round(r.ms / 1000)}s)\n${r.answer || "[no answer]"}\n`).join("\n"));

const ok = results.filter((r) => r && r.answer).length;
console.log(`\n=== Done: ${ok}/${n} questions returned an answer. Wrote out/answers.json + out/answers.txt ===`);
console.log("Now compare Firecrawl credits before/after: a few hundred = fixed; thousands = re-reading.");
