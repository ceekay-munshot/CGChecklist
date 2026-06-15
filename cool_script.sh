#!/usr/bin/env bash
# Muns Chat — run the 51-question governance checklist sequentially, live.
# Usage: ./cool_script.sh TICKER "Company Name"
#        TEMPORARY_TOKEN=xxx ./cool_script.sh INFY "Infosys Ltd"
set -uo pipefail

TICKER="${1:?Usage: $0 <TICKER> \"Company Name\"}"; shift
COMPANY="${*:?Usage: $0 <TICKER> \"Company Name\"}"

CHAT_API="https://devde.muns.io/chat/chat-muns"
TODAY=$(date +%Y-%m-%d)
FROM_DATE=$(date -v-2y +%Y-%m-%d 2>/dev/null || date -d '2 years ago' +%Y-%m-%d)

# ── Config: env first, else .dev.vars ──────────────────────────────────────
read_dev_var(){
  local key="$1"
  [[ -f .dev.vars ]] || return 1
  grep "^${key}=" .dev.vars | head -1 | sed "s/^${key}=//; s/^[\"']//; s/[\"']$//"
}

TOKEN="${TEMPORARY_TOKEN:-}"
if [[ -z "$TOKEN" ]]; then
  TOKEN=$(read_dev_var TEMPORARY_TOKEN)
fi
USER_INDEX="${USER_INDEX:-}"
if [[ -z "$USER_INDEX" ]]; then
  USER_INDEX=$(read_dev_var USER_INDEX)
fi
USER_INDEX="${USER_INDEX:-1}"
[[ -z "$TOKEN" ]] && { printf '\033[31mSet TEMPORARY_TOKEN or add it to .dev.vars\033[0m\n'; exit 1; }
command -v curl >/dev/null || { printf '\033[31mcurl is required\033[0m\n'; exit 1; }
command -v python3 >/dev/null || { printf '\033[31mpython3 is required\033[0m\n'; exit 1; }

# ── Colours ────────────────────────────────────────────────────────────────
HDR=$'\033[1;36m'; QST=$'\033[0;33m'; ANS=$'\033[0;37m'
OK=$'\033[0;32m'; ERR=$'\033[0;31m'; DIM=$'\033[2m'; NC=$'\033[0m'

ONE_LINE_ONLY=" Answer in 1 LINE ONLY STRICTLY."
MEGA="Make structured tables answering the below questions for the company . If an answer is Not established or Not available in the annual report - Quickly Websearch and find it . keep answers for each question detailed and non generic , specifically suited for the company. keep remarks more numerical stating exact problems instead of being concise. use exact name of the ceo/company/elements in each answer only.  DOUBLE CHECK AND VERIFY EACH ANSWER BEFORE ANSWERING.${ONE_LINE_ONLY}"

# ── Questions: parallel arrays (section | prompt), 51 items ────────────────
SECT=(); PROMPT=()
add(){ SECT+=("$1"); PROMPT+=("$2${ONE_LINE_ONLY}"); }
add BOARD             $'1\tBoard of directors\n\n\ta)Does the board consist of >50% independent directors?'
add BOARD             $'\tb)\tIs chairman non-executive?'
add BOARD             $'\tc)\tAll relationship or transaction of non-exec directors disclosed in AR?'
add BOARD             $'\td)\tDisclosures to the remuneration paid'
add BOARD             $'\te)\tReputation of the directors'
add AUDIT             $'2\tAudit\n\n\ta)Auditors to the company - big 4?'
add AUDIT             $'\tb)\tSubsidiary accounts audited by a big-4 auditor?'
add AUDIT             $'\tc)\tQualifications in the Auditor Report?'
add AUDIT             $'\td)\tRemuneration paid to the auditors'
add AUDIT             $'\te)\tLast change in auditors, reason for change'
add STAKEHOLDERS      $'3\tStakeholders\n\n\ta)Free float in the market - high / low'
add STAKEHOLDERS      $'\tb)\tRecent entry and exit by PE Funds/ HNIs'
add EMPLOYEE          $'4\tEmployee\n\n\ta)Employee attrition'
add EMPLOYEE          $'\tb)\tRemuneration compared to industry standards'
add EMPLOYEE          $'\tc)\tESOP Pool'
add INDUSTRY_PROMOTER $'5\tIndustry and Promoter\n\n\ta)Promoter stake (%) (above 50 or below)'
add INDUSTRY_PROMOTER $'\tb)\tPromoter stake trend over the last 8 quarters'
add INDUSTRY_PROMOTER $'\tc)\tDoes the promoter have other material businesses ?'
add INDUSTRY_PROMOTER $'\td)\tIs the business run by a professional CEO?'
add INDUSTRY_PROMOTER $'\te)\tView on CEO'
add INDUSTRY_PROMOTER $'\tf)\tPromoter vintage and involvment in business'
add INDUSTRY_PROMOTER $'\tg)\tVintage of the top mgmt. team in the company'
add INDUSTRY_PROMOTER $'\th)\tQuality of second level team'
add INDUSTRY_PROMOTER $'\ti)\tFamily Dynamics - is there any fight?'
add INDUSTRY_PROMOTER $'\tj)\tDealing with the government?'
add INDUSTRY_PROMOTER $'\tk)\tCases from ED, SEBI, other institutions'
add INDUSTRY_PROMOTER $'\tl)\tPolitical connect'
add INDUSTRY_PROMOTER $'\tm)\tTransparency on analyst calls'
add INDUSTRY_PROMOTER $'\tn)\tShareholding pledge?'
add INDUSTRY_PROMOTER $'\to)\tLeverage'
add STOCK_EXCHANGE    $'6\tStock Exchange\n\n\ta)Adequate disclosures and compliance to SEBI Guidelines'
add STOCK_EXCHANGE    $'\tb)\tVolatility in the stock'
add STOCK_EXCHANGE    $'\tc)\tVolume and liquidity in the stock - high / low?'
add STOCK_EXCHANGE    $'\td)\tCovered by domestic / mnc coverage'
add OTHER_REGULATORY  $'7\tOther Regulatory\n\n\ta)Contingent tax or liability - if material'
add FINANCIALS        $'8\tFinancials\n\n\ta)Material red flags in notes to accounts and contingent liabilities'
add FINANCIALS        $'\tb)\tDebt & Advances - high / low?'
add FINANCIALS        $'\tc)\tReceivables > 6 months as a % of revenues'
add FINANCIALS        $'\td)\tBankers? Top pvt/psu or not?'
add FINANCIALS        $'\te)\tConsistent Dividend payout'
add FINANCIALS        $'\tf)\tCash EPS vs Accounting EPS - Low or high'
add FINANCIALS        $'\tg)\tDisclosure on all related party transaction'
add FINANCIALS        $'\th)\tCFO / EBITDA'
add FINANCIALS        $'\ti)\tProvisioning'
add FINANCIALS        $'\tj)\tFluctuating depreciation rates'
add FINANCIALS        $'\tk)\tOther noteable red flags'
add FINANCIALS        $'\tl)\tWorking capital cycle'
add FINANCIALS        $'\tm)\tAre auditor fees transparently disclosed?'
add FINANCIALS        $'\tn)\tIs asset growth significantly outpacing revenue growth?'
add FINANCIALS        $'\to)\tAre contingent liabilities greater than 20x net worth?'
add FINANCIALS        $'\tp)\tIs provisioning coverage below industry norms or falling?'

# ── State ──────────────────────────────────────────────────────────────────
CHAT_ID=""
MEGA_HIST=()      # "User: …", "AI: …"  (mega prompt exchange, never reset)
SECT_HIST=()      # current section's exchanges (reset on section change)

# Build chatHistory JSON array from MEGA_HIST + SECT_HIST
build_history(){
  local all=("${MEGA_HIST[@]}" "${SECT_HIST[@]}")
  if [[ ${#all[@]} -eq 0 ]]; then printf '[]\n'; return; fi
  python3 -c 'import json, sys; print(json.dumps(sys.argv[1:]))' "${all[@]}"
}

# send_chat <task>  →  streams raw response, sets REPLY + CHAT_ID
send_chat(){
  local task="$1" hist payload hdrfile bodyfile body curl_status
  hist=$(build_history)
  payload=$(TASK="$task" TICKER="$TICKER" COMPANY="$COMPANY" FROM_DATE="$FROM_DATE" TODAY="$TODAY" HIST="$hist" CHAT_ID="$CHAT_ID" USER_INDEX="$USER_INDEX" python3 <<'PY'
import json
import os

payload = {
    "user_index": int(os.environ["USER_INDEX"]),
    "tasks": [os.environ["TASK"]],
    "query_context": {
        "TICKER_SYMBOL": [os.environ["TICKER"]],
        "FROM_DATE": os.environ["FROM_DATE"],
        "TO_DATE": os.environ["TODAY"],
        "ANNOUNCEMENT_FORM_TYPE": "all",
        "DOCUMENT_IDS": [],
        "CATEGORIES": [],
        "WEB_SEARCH_ENABLED": True,
        "COUNTRY": [],
        "CONTEXT_EMAIL": "ceekay@muns.io",
        "CONTEXT_COMPANY_NAME": [os.environ["COMPANY"]],
        "GET_ANNOUNCEMENTS_ENABLED": False,
        "chatHistory": json.loads(os.environ["HIST"]),
        "mode": "fast",
    },
    "autoAddUpcoming": False,
    "urls": [],
}

if os.environ.get("CHAT_ID"):
    payload["chat_id"] = os.environ["CHAT_ID"]

print(json.dumps(payload))
PY
)

  hdrfile=$(mktemp)
  bodyfile=$(mktemp)
  printf '%s' "${ANS}"
  curl --no-buffer -sS -D "$hdrfile" \
    -X POST "$CHAT_API" \
    -H "accept: */*" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    -o >(tee "$bodyfile")
  curl_status=$?
  printf '%s\n' "${NC}"

  body=$(<"$bodyfile")
  rm -f "$bodyfile"

  if (( curl_status != 0 )); then
    REPLY="Error: curl failed with status ${curl_status}"
    rm -f "$hdrfile"
    return
  fi

  # Capture chat id from the x-chat-id response header (first call only really)
  local newid
  newid=$(grep -i '^x-chat-id:' "$hdrfile" | tail -1 | tr -d '\r' | sed 's/^[^:]*: *//')
  [[ -n "$newid" ]] && CHAT_ID="$newid"
  rm -f "$hdrfile"

  # Try to pull a text field out of JSON; fall back to raw body
  REPLY=$(BODY="$body" python3 <<'PY'
import html
import json
import os
import re

body = os.environ["BODY"]

answers = re.findall(r"<ans>(.*?)</ans>", body, flags=re.DOTALL)
if answers:
    print("\n\n".join(html.unescape(answer.strip()) for answer in answers if answer.strip()), end="")
    raise SystemExit

try:
    data = json.loads(body)
except Exception:
    print(body, end="")
    raise SystemExit

for key in ("response", "answer", "text", "content", "message"):
    value = data.get(key)
    if isinstance(value, str) and value:
        print(value, end="")
        break
else:
    print(body, end="")
PY
)
}

# ── Run ────────────────────────────────────────────────────────────────────
printf '%s\n' "${HDR}━━ Muns Chat governance run · ${COMPANY} (${TICKER}) ━━${NC}"
printf '%s\n\n' "${DIM}Date window ${FROM_DATE} → ${TODAY}${NC}"

# Step 1: mega prompt → seeds chat_id
printf '%s\n' "${HDR}[init] Mega prompt${NC}"
send_chat "$MEGA"
printf '%s\n' "${DIM}chat_id = ${CHAT_ID:-<none returned>}${NC}"
printf '\n'
MEGA_HIST=("User: $MEGA" "AI: $REPLY")

# Step 2: 51 questions, history reset per section
CUR=""
for i in "${!PROMPT[@]}"; do
  s="${SECT[$i]}"; q="${PROMPT[$i]}"
  if [[ "$s" != "$CUR" ]]; then
    CUR="$s"; SECT_HIST=()
    printf '%s\n' "${HDR}── Section: ${s} (history reset) ──${NC}"
  fi
  printf '%s\n' "${QST}Q$((i+1))/51:${NC} ${q//$'\t'/ }"
  send_chat "$q"
  if [[ "$REPLY" == Error:* || -z "$REPLY" ]]; then
    printf '%s\n\n' "${ERR}${REPLY:-<empty response>}${NC}"
  else
    printf '\n'
  fi
  SECT_HIST+=("User: $q" "AI: $REPLY")
done

printf '%s\n' "${OK}✓ Done — 1 mega prompt + 51 questions sent sequentially.${NC}"
