#!/usr/bin/env bash
# Tiny Firecrawl-credit smoke test for the MUNS "auto data" fix.
#
# Sends 3 annual-report questions for ONE company in ONE chat session with the
# fix ON (autoAddUpcoming + GET_ANNOUNCEMENTS_ENABLED = true). If the backend
# caches correctly, the annual report is read ONCE (question 1) and reused for
# questions 2 & 3, so Firecrawl credits barely move. If it is still broken, each
# question re-reads the same document and credits climb per question.
#
# Compare the Firecrawl dashboard credits before/after this run:
#   few hundred credits  -> fixed
#   ~1k+ / grows each Q  -> not fixed
#
# Usage: credit-smoke-test.sh <TICKER> "<Company Name>"
# Token: MUNS_TOKEN (CI) or TEMPORARY_TOKEN env var.
set -uo pipefail

TICKER="${1:?Usage: $0 <TICKER> \"Company Name\"}"; shift
COMPANY="${*:?Usage: $0 <TICKER> \"Company Name\"}"

CHAT_API="https://birdnest.muns.io/chat/chat-muns"
TODAY=$(date +%Y-%m-%d)
FROM_DATE=$(date -d '2 years ago' +%Y-%m-%d 2>/dev/null || date -v-2y +%Y-%m-%d)

TOKEN="${MUNS_TOKEN:-${TEMPORARY_TOKEN:-}}"
[[ -z "$TOKEN" ]] && { echo "No token: set MUNS_TOKEN or TEMPORARY_TOKEN"; exit 1; }
command -v curl    >/dev/null || { echo "curl is required";    exit 1; }
command -v python3 >/dev/null || { echo "python3 is required"; exit 1; }

SUFFIX=" Answer in THREE BULLET POINTS ONLY STRICTLY."
QUESTIONS=(
  "From the latest annual report: does the board consist of >50% independent directors?"
  "From the latest annual report: is the chairman non-executive?"
  "From the latest annual report: what remuneration was paid to the auditors?"
)

echo "=== Credit smoke test: $COMPANY ($TICKER) — 3 questions, 1 session, auto-data ON ==="
CHAT_ID=""
for i in "${!QUESTIONS[@]}"; do
  task="${QUESTIONS[$i]}${SUFFIX}"
  payload=$(TASK="$task" TICKER="$TICKER" COMPANY="$COMPANY" FROM_DATE="$FROM_DATE" TODAY="$TODAY" CHAT_ID="$CHAT_ID" python3 - <<'PY'
import json, os
p = {
  "user_index": 1,
  "tasks": [os.environ["TASK"]],
  "query_context": {
    "TICKER_SYMBOL": [os.environ["TICKER"]],
    "FROM_DATE": os.environ["FROM_DATE"], "TO_DATE": os.environ["TODAY"],
    "ANNOUNCEMENT_FORM_TYPE": "all", "DOCUMENT_IDS": [], "CATEGORIES": [],
    "WEB_SEARCH_ENABLED": True, "COUNTRY": [],
    "CONTEXT_EMAIL": "ceekay@muns.io", "CONTEXT_COMPANY_NAME": [os.environ["COMPANY"]],
    "GET_ANNOUNCEMENTS_ENABLED": True,   # the fix
    "chatHistory": [], "mode": "expert",
  },
  "autoAddUpcoming": True,               # the fix
}
cid = os.environ.get("CHAT_ID")
if cid:
    p["chat_id"] = cid
print(json.dumps(p))
PY
)
  hdr=$(mktemp)
  start=$(date +%s)
  code=$(curl -sS --max-time 300 -o /dev/null -w '%{http_code}' -D "$hdr" \
    -X POST "$CHAT_API" -H "accept: */*" -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" -d "$payload" || echo 000)
  end=$(date +%s)
  nid=$(grep -i '^x-chat-id:' "$hdr" | tail -1 | tr -d '\r' | sed 's/^[^:]*: *//')
  [[ -n "$nid" ]] && CHAT_ID="$nid"
  rm -f "$hdr"
  echo "Q$((i+1)): HTTP $code in $((end-start))s (session ${CHAT_ID:-none})"
done
echo "=== Done. Compare Firecrawl credits before/after: few hundred = fixed; ~1k+ = not. ==="
