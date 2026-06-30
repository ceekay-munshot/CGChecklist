# MUNS Chat API — Exact Calling Convention

Paste this as the system prompt (or first message) for any AI coding agent
that needs to call the **MUNS Chat API** the way this governance scorecard
does — or read it as the authoritative spec for what the app sends over the
wire. It describes, in exact detail, the **mega prompt**, the **per‑question
requests**, and the **limited (per‑section) chat history** mechanism.

This is the contract implemented in `src/lib/munsChatService.ts` and mirrored
by the reference `cool_script.sh`. The two must stay byte‑for‑byte equivalent
in everything that reaches the API.

---

## 0. TL;DR of the mechanism

1. Open one chat session by sending a single **mega prompt** (a standing
   instruction on *how* to answer). Its request carries an **empty**
   `chatHistory`. The response's `x-chat-id` header is the session's `chat_id`.
2. Keep that `chat_id` for the whole run, but **do not** rely on the server's
   memory. The client decides the model's context every turn by passing an
   explicit `chatHistory` array.
3. For every checklist question, send the question text with
   `chatHistory = megaHistory + sectionHistory`, i.e. **only** the mega prompt
   exchange plus the Q&A from the **current section**.
4. At each new section, **reset** `sectionHistory` to empty. The mega prompt
   exchange (`megaHistory`) is **never** reset. So a question never sees the
   answers from any other section — only its own section's prior turns.
5. The 51 questions are split across **2 parallel lanes** at section
   boundaries. Each lane is a fully independent session (its own mega prompt,
   its own `chat_id`, its own history). No section is ever split across lanes,
   which is what keeps a parallel run's answers identical to a serial run.

Everything below is the exact detail.

---

## 1. Endpoint, auth, headers

```
POST https://birdnest.muns.io/chat/chat-muns
accept: */*
Authorization: Bearer <TEMPORARY_TOKEN>
Content-Type: application/json
```

- The bearer is the `TEMPORARY_TOKEN` secret (Cloudflare `wrangler secret put
  TEMPORARY_TOKEN` in prod, `.dev.vars` locally). A `401`/`403` means it is
  missing, expired, or invalid — surface that, do not retry blindly.
- The response is read as a **single text body** (see §6). It is *not* reliably
  SSE‑framed despite sometimes carrying a `text/event-stream` content‑type.
- The session id comes back in the **`x-chat-id` response header**, not the body.

Source of truth for these constants: `src/lib/munsConfig.ts`
(`MUNS_CHAT_API_URL`, `MUNS_CHAT_CONTEXT_EMAIL`, `PARALLEL_LANES`).

---

## 2. Request body — exact shape

Every call (mega prompt and every question) POSTs this JSON:

```json
{
  "user_index": 1,
  "tasks": ["<the single message text for this turn>"],
  "chat_id": "<session id from x-chat-id; OMITTED on the very first call>",
  "query_context": {
    "TICKER_SYMBOL": ["INFY"],
    "FROM_DATE": "2024-06-30",
    "TO_DATE": "2026-06-30",
    "ANNOUNCEMENT_FORM_TYPE": "all",
    "DOCUMENT_IDS": [],
    "CATEGORIES": [],
    "WEB_SEARCH_ENABLED": true,
    "COUNTRY": [],
    "CONTEXT_EMAIL": "ceekay@muns.io",
    "CONTEXT_COMPANY_NAME": ["Infosys Ltd"],
    "GET_ANNOUNCEMENTS_ENABLED": false,
    "chatHistory": ["User: …", "AI: …", "User: …", "AI: …"],
    "mode": "expert"
  },
  "autoAddUpcoming": false
}
```

Field‑by‑field, exactly as the code builds it:

| Field | Value / rule |
|---|---|
| `user_index` | `Number(process.env.USER_INDEX) || 1` — i.e. `USER_INDEX` env or `1`. |
| `tasks` | A **single‑element array** containing this turn's message text only. Never the history. |
| `chat_id` | **Omitted entirely** on the first (mega) call. On every later call it is the `chat_id` captured from the first response's `x-chat-id` header. Same value for the whole lane. |
| `query_context.TICKER_SYMBOL` | `[ticker]` if a ticker is given, else `[]`. |
| `query_context.FROM_DATE` | Today **minus exactly 2 calendar years**, UTC, `YYYY-MM-DD`. Calendar‑accurate (`setUTCFullYear(-2)`), not a flat 730‑day subtraction. |
| `query_context.TO_DATE` | **Today**, UTC, `YYYY-MM-DD`. |
| `query_context.ANNOUNCEMENT_FORM_TYPE` | Constant `"all"`. |
| `query_context.DOCUMENT_IDS` | Constant `[]`. |
| `query_context.CATEGORIES` | Constant `[]`. |
| `query_context.WEB_SEARCH_ENABLED` | Constant `true` (the mega prompt tells the model to web‑search gaps). |
| `query_context.COUNTRY` | Constant `[]` — **always empty**, even though the surrounding app resolves a country name elsewhere. Matches `cool_script.sh`. |
| `query_context.CONTEXT_EMAIL` | Constant `"ceekay@muns.io"` (`MUNS_CHAT_CONTEXT_EMAIL`). |
| `query_context.CONTEXT_COMPANY_NAME` | `[companyName]` — single‑element array. |
| `query_context.GET_ANNOUNCEMENTS_ENABLED` | Constant `false`. |
| `query_context.chatHistory` | The **limited history** for this turn (see §4). This is the crux of the whole design. |
| `query_context.mode` | Constant `"expert"`. |
| `autoAddUpcoming` | Constant `false`. |

> The same `query_context` template is rebuilt for **every** call; only
> `tasks[0]` and `chatHistory` change turn to turn.

---

## 3. The mega prompt (verbatim)

The very first message of every session is the **mega prompt**. It establishes
*how* to answer for the rest of the session and is the same constant for every
company and every lane. Send it exactly:

```
Make structured tables answering the below questions for the company . If an answer is Not established or Not available in the annual report - Quickly Websearch and find it . Keep each answer specific to the company with exact figures, names and dates - never generic . State the finding directly and crisply : give the fact itself with the key number(s) . Do NOT narrate the evidence, the sources or the search process, and do NOT say what a report 'does or does not disclose' - just answer . No hedging, no filler . Use the exact name of the ceo/company/elements in each answer only . DOUBLE CHECK AND VERIFY EACH ANSWER BEFORE ANSWERING. Answer in THREE BULLET POINTS ONLY STRICTLY.
```

Construction detail (`munsChatService.ts`):

- A shared suffix is appended to the mega prompt **and** to every question:
  ```
  ONE_LINE_ONLY = " Answer in THREE BULLET POINTS ONLY STRICTLY."
  ```
  (Note the leading space — it joins onto the preceding sentence.)
- `MEGA_PROMPT = <the long instruction above without the suffix> + ONE_LINE_ONLY`.

The mega call:

- `tasks[0]` = `MEGA_PROMPT`.
- `chat_id` is **omitted** (this is what opens a new session).
- `chatHistory` is **`[]`** (empty — nothing precedes the mega prompt).
- The response body is the mega answer; the `x-chat-id` header is the session id.

After it returns, seed the standing history (this is the only thing that
persists across sections):

```
megaHistory = [ "User: " + MEGA_PROMPT, "AI: " + megaResponse ]
```

`megaHistory` is **never reset** for the life of the lane.

---

## 4. The limited history — the core idea

Each later turn sends a `chatHistory` that is **deliberately trimmed**:

```
chatHistory (for this turn) = megaHistory + sectionHistory
```

- `megaHistory` — the 2 strings from §3. Constant for the whole lane.
- `sectionHistory` — the running `User:`/`AI:` pairs for **only the section
  currently being answered**. It starts empty and **resets to empty at every
  section boundary**.

So the model's visible context on any given question is:

```
[ User: <MEGA_PROMPT>,
  AI:   <mega answer>,
  User: <section's question 1>,  AI: <answer 1>,
  User: <section's question 2>,  AI: <answer 2>,
  …earlier questions of THIS section only…,
  (then tasks[0] = the current question) ]
```

It is **never** shown questions or answers from other sections. A 51‑question
run therefore never grows an unbounded transcript — at most one section's worth
of Q&A rides along with the standing mega exchange.

History strings use the exact prefixes `"User: "` and `"AI: "`. On a failed
question, the placeholder pair appended is `"User: <prompt>"` and `"AI: [Error]"`
so positional alignment is preserved even when a turn errored.

### Why `chat_id` stays but history is re‑sent

The same `chat_id` is reused across all of a lane's turns, but the client does
**not** trust the server's accumulated memory to define context. The explicit
`chatHistory` array is what the model is given each turn. The "reset between
sections" is implemented purely client‑side by clearing `sectionHistory` — the
`chat_id` is unchanged. This makes the context fully deterministic and
independent of server‑side session retention.

---

## 5. Question message format

Questions come from `GOVERNANCE_CHECKLIST` (`src/lib/governance/checklist.ts`),
in order. Each section's items are lettered `a, b, c, …`. Two formats:

**First question of a section** (carries the section number + title header):

```
<SECTION_NUMBER>\t<Section Title>\n\n\t<letter>)<particulars><ONE_LINE_ONLY>
```

Example (BOARD, item a):

```
1	Board of directors

	a)Does the board consist of >50% independent directors? Answer in THREE BULLET POINTS ONLY STRICTLY.
```

**Every subsequent question of that section**:

```
\t<letter>)\t<particulars><ONE_LINE_ONLY>
```

Example (BOARD, item b):

```
	b)	Is chairman non-executive? Answer in THREE BULLET POINTS ONLY STRICTLY.
```

Section numbers (`SECTION_NUMBERS`): BOARD=1, AUDIT=2, STAKEHOLDERS=3,
EMPLOYEE=4, INDUSTRY_PROMOTER=5, STOCK_EXCHANGE=6, OTHER_REGULATORY=7,
FINANCIALS=8. The literal `\t` (tab) and `\n\n` (blank line) are part of the
wire text — they are sent, not rendered.

That exact `tasks[0]` string is also what gets stored into `sectionHistory` as
`"User: " + prompt`.

---

## 6. Reading the response

The body is the MUNS envelope:

```
<task><1><tool>…</tool><ans>…the answer…</ans></1></task><sources>…</sources><eos/>
```

Extraction (`extractText` → `stripMunsTags`), in priority order:

1. **Primary** — if the raw body contains `<ans>`, collect **every**
   `<ans>…</ans>` block, trim each, join with `\n\n`. This is the normal path.
2. **Fallback A** — genuine SSE: if lines start with `data:`, concatenate the
   `content` / `text` / `delta.text` fields (or the raw `data:` payload),
   skipping `[DONE]`, then look for `<ans>` in the reconstruction.
3. **Fallback B** — plain JSON envelope: parse and take the first present of
   `response`, `answer`, `text`, `content`, `message`.

Then clean: drop `<doc_source>…</doc_source>` citation blocks, strip **all**
remaining XML‑ish tags, and unescape HTML entities (`&amp; &lt; &gt; &quot;
&apos; &#x27; &#NN;`). The result is plain answer prose (typically the three
bullets requested).

`chat_id` for the session is taken from the **`x-chat-id`** response header
(falling back to the previously known id, else `""`).

---

## 7. Parallel lanes (the fan‑out)

`PARALLEL_LANES = 2`. The checklist is split across 2 independent sessions:

- **Split unit is a whole section.** `splitSectionsIntoLanes` greedily
  bin‑packs sections by question count: process sections **largest first**, and
  drop each onto whichever lane currently has the fewest questions. A section is
  **never** divided across lanes — that's the invariant that makes the
  per‑section history identical to a serial run.
- Each lane runs as its **own** `/api/muns/run` invocation (a separate
  Cloudflare Worker invocation → its own ~50‑subrequest budget). The browser
  (`munsClient.ts`) fans out one `fetch("/api/muns/run", { lane })` per lane,
  in parallel.
- Each lane does the **full** §3→§5 dance independently: its own mega prompt,
  its own `chat_id`, its own `megaHistory`, and per‑section `sectionHistory`
  resets — but only over the sections assigned to that lane.
- Lanes are labelled `A` (lane 0) and `B` (lane 1) for the progress UI only;
  the label changes nothing sent to MUNS.

Worked split for the current 51‑question checklist (counts: FINANCIALS 16,
INDUSTRY_PROMOTER 15, BOARD 5, AUDIT 5, STOCK_EXCHANGE 4, EMPLOYEE 3,
STAKEHOLDERS 2, OTHER_REGULATORY 1):

- **Lane A (0):** FINANCIALS(16) → AUDIT(5) → EMPLOYEE(3) → STAKEHOLDERS(2) = **26 q**
- **Lane B (1):** INDUSTRY_PROMOTER(15) → BOARD(5) → STOCK_EXCHANGE(4) → OTHER_REGULATORY(1) = **25 q**

(Sections inside a lane are visited in that largest‑first order; the final
assembly re‑sorts everything back to canonical checklist order, so output order
is unaffected.) Per lane: **1 mega call + that lane's question calls.** Across
both lanes: 2 mega calls + 51 question calls = 53 POSTs total.

After both lanes return their per‑question results, the client merges them and
POSTs to `/api/muns/assemble`, which re‑orders to checklist order, infers a
0/1/2 score per answer, and caches a fully‑successful run. Assembly makes **no**
MUNS calls.

---

## 8. Exact per‑lane algorithm (pseudocode)

```
function runLane(sections, ticker, companyName, token):
    toDate   = todayUTC()                      # YYYY-MM-DD
    fromDate = todayUTC() minus 2 calendar years

    # ── seed: mega prompt, no chat_id, empty history ──
    res = POST(chat-muns, {
        tasks: [MEGA_PROMPT],
        # no chat_id
        query_context: ctx(ticker, companyName, fromDate, toDate, chatHistory=[]),
    })
    chatId      = res.header["x-chat-id"]
    megaAnswer  = extractAns(res.body)
    megaHistory = ["User: " + MEGA_PROMPT, "AI: " + megaAnswer]   # never reset

    results = []
    for section in sections:                   # lane's sections, in split order
        sectionHistory = []                    # RESET at every section boundary
        for q in section.questions:            # checklist order within section
            history = megaHistory + sectionHistory          # ← the limited history
            res = POST(chat-muns, {
                tasks: [q.prompt],             # §5 formatted string
                chat_id: chatId,               # reuse same session id
                query_context: ctx(ticker, companyName, fromDate, toDate, history),
            })
            answer = extractAns(res.body)
            results.push({ q.questionId, q.sectionId, answer })
            sectionHistory += ["User: " + q.prompt, "AI: " + answer]   # grows within section only
    return results
```

`ctx(...)` is the constant `query_context` template from §2 with `chatHistory`
filled in. On a thrown question, record `"Error: <msg>"` as the answer and push
`["User: " + q.prompt, "AI: [Error]"]` into `sectionHistory`, then continue.

---

## 9. Invariants to preserve (do not break these)

- **Mega prompt is the first message** of every session, with **empty**
  `chatHistory` and **no** `chat_id`. The session id comes from `x-chat-id`.
- **`megaHistory` never resets.** `sectionHistory` resets at every section
  boundary. A turn's `chatHistory` is exactly `megaHistory + sectionHistory` —
  no other section's turns ever leak in.
- **`tasks` carries one message**, never the history. History lives only in
  `query_context.chatHistory`.
- **History prefixes are literally `"User: "` and `"AI: "`.** Errored turns use
  `"AI: [Error]"`.
- **Sections are the atomic split unit** across lanes; never split a section.
- **`COUNTRY` is always `[]`** and **`mode` is always `"expert"`** on the chat
  endpoint, regardless of what the UI shows.
- Keep `src/lib/munsChatService.ts` and `cool_script.sh` equivalent in every
  field that reaches the API (prompt text, suffix, payload shape, date window,
  history rules).
```
