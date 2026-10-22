#!/usr/bin/env bash
# Runs the governance engine (scripts/analyze.ts) with an AUTOMATIC Firecrawl
# credit meter + hard cap — so credit usage is visible and self-limited with no
# human watching:
#   * prints the Firecrawl balance BEFORE and AFTER (the cost shows in the log),
#   * polls during the run and KILLS it if usage crosses CREDIT_CAP.
#
# Usage: metered-run.sh <TICKER> "<Company>"
# Env: FIRECRAWL_API_KEY (for the credit check), CREDIT_CAP (default 3000),
#      plus the engine's own secrets (same as analyze.yml).
set -uo pipefail

TICKER="${1:?ticker required}"; COMPANY="${2:-}"
CAP="${CREDIT_CAP:-3000}"
FC_KEY="${FIRECRAWL_API_KEY:-}"

# Firecrawl team credit balance (integer) or empty if the API didn't cooperate.
remaining() {
  [[ -z "$FC_KEY" ]] && { echo ""; return; }
  curl -s --max-time 20 -H "Authorization: Bearer $FC_KEY" \
    "https://api.firecrawl.dev/v1/team/credit-usage" 2>/dev/null \
  | python3 -c 'import sys,json
try:
    d=json.load(sys.stdin); x=d.get("data",d) if isinstance(d,dict) else {}
    v=x.get("remaining_credits", x.get("remainingCredits"))
    print(int(v) if v is not None else "")
except Exception:
    print("")' 2>/dev/null
}

BEFORE=$(remaining)
echo "=== CREDIT METER: before = ${BEFORE:-unknown}  (auto-kill if usage > $CAP) ==="

# Launch the engine in its own process group so we can stop the whole tree.
setsid npx tsx --tsconfig tsconfig.json scripts/analyze.ts "$TICKER" "$COMPANY" &
ENGINE=$!
KILLED=0

while kill -0 "$ENGINE" 2>/dev/null; do
  sleep 60
  CUR=$(remaining)
  if [[ -n "$BEFORE" && -n "$CUR" ]]; then
    USED=$(( BEFORE - CUR ))
    echo "=== CREDIT METER: used so far = $USED  (remaining $CUR) ==="
    if (( USED > CAP )); then
      echo "!!! CREDIT CAP $CAP EXCEEDED (used $USED) — killing the run to protect your credits !!!"
      kill -TERM -- "-$ENGINE" 2>/dev/null; pkill -f analyze.ts 2>/dev/null; KILLED=1; break
    fi
  fi
done

wait "$ENGINE" 2>/dev/null; STATUS=$?
AFTER=$(remaining)
if [[ -n "$BEFORE" && -n "$AFTER" ]]; then
  echo "=== CREDIT METER: before=$BEFORE  after=$AFTER  USED=$(( BEFORE - AFTER )) credits ==="
else
  echo "=== CREDIT METER: credit API unavailable (before=${BEFORE:-?} after=${AFTER:-?}); engine still ran, and the read-once engine is bounded by design ==="
fi
(( KILLED == 1 )) && { echo "Run stopped by the credit cap."; exit 2; }
exit $STATUS
