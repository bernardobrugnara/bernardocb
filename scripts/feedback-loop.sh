#!/usr/bin/env bash
set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
API_BASE="https://bernardocb-chat.bernardocb.workers.dev"
RESUMO_FILE="$(cd "$(dirname "$0")/.." && pwd)/workshop-resumo/index.html"
LOOP_INTERVAL=120  # seconds between iterations

# Read API key from worker/.dev.vars
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEV_VARS="$SCRIPT_DIR/../worker/.dev.vars"
if [[ -f "$DEV_VARS" ]]; then
  ANTHROPIC_API_KEY=$(grep '^ANTHROPIC_API_KEY=' "$DEV_VARS" | cut -d'=' -f2-)
fi

if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "ERROR: ANTHROPIC_API_KEY not found. Set it or check worker/.dev.vars"
  exit 1
fi

if [[ -z "${WORKSHOP_ADMIN_TOKEN:-}" ]]; then
  echo "ERROR: WORKSHOP_ADMIN_TOKEN not set. Run: export WORKSHOP_ADMIN_TOKEN=your_token"
  exit 1
fi

echo "=== Feedback Loop Started ==="
echo "    Resumo file: $RESUMO_FILE"
echo "    Checking every ${LOOP_INTERVAL}s for new feedback"
echo ""

# ── Main Loop ────────────────────────────────────────────────────────────────
while true; do
  echo "[$(date '+%H:%M:%S')] Checking for approved feedback..."

  # 1. Fetch approved feedbacks (approved by admin in /workshop-backlog)
  FEEDBACK_RESPONSE=$(curl -s "${API_BASE}/workshop/feedback?token=${WORKSHOP_ADMIN_TOKEN}&status=approved")

  # Check if there are feedbacks
  FEEDBACK_COUNT=$(echo "$FEEDBACK_RESPONSE" | jq '.feedbacks | length')

  if [[ "$FEEDBACK_COUNT" == "0" || "$FEEDBACK_COUNT" == "null" ]]; then
    echo "[$(date '+%H:%M:%S')] No approved feedback. Sleeping ${LOOP_INTERVAL}s..."
    sleep "$LOOP_INTERVAL"
    continue
  fi

  echo "[$(date '+%H:%M:%S')] Found $FEEDBACK_COUNT pending feedback(s)!"

  # 2. Extract feedback messages and keys
  FEEDBACK_MESSAGES=$(echo "$FEEDBACK_RESPONSE" | jq -r '.feedbacks[] | "- " + .message')
  FEEDBACK_KEYS=$(echo "$FEEDBACK_RESPONSE" | jq -r '.feedbacks[].key')

  echo ""
  echo "Feedbacks:"
  echo "$FEEDBACK_MESSAGES"
  echo ""

  # 3. Read current HTML
  CURRENT_HTML=$(cat "$RESUMO_FILE")

  # 4. Call Claude API to generate improved HTML
  echo "[$(date '+%H:%M:%S')] Asking Claude to implement improvements..."

  # Build the prompt as a JSON-safe string
  USER_PROMPT=$(jq -n --arg html "$CURRENT_HTML" --arg feedback "$FEEDBACK_MESSAGES" '{
    prompt: ("Here is the current HTML of a workshop summary page:\n\n```html\n" + $html + "\n```\n\nHere are user feedbacks requesting improvements:\n" + $feedback + "\n\nPlease implement the requested improvements. Rules:\n- Return ONLY the complete HTML file, nothing else. No markdown fences, no explanations.\n- Keep ALL existing functionality intact (auth, summary generation, feedback button/modal, breakdown bars, markdown rendering)\n- Keep the same dark terminal visual style (background #0a0a0a, text #f0f0f0, accent #93c5fd, monospace font)\n- Keep ALL API URLs and JavaScript logic working\n- Make thoughtful improvements based on the feedback\n- If a feedback is unclear or impossible, skip it\n- The output must be a valid, complete, self-contained HTML file")
  }' | jq -r '.prompt')

  API_RESPONSE=$(curl -s "https://api.anthropic.com/v1/messages" \
    -H "Content-Type: application/json" \
    -H "x-api-key: ${ANTHROPIC_API_KEY}" \
    -H "anthropic-version: 2023-06-01" \
    -d "$(jq -n \
      --arg prompt "$USER_PROMPT" \
      '{
        model: "claude-sonnet-4-6-20250514",
        max_tokens: 16000,
        messages: [{ role: "user", content: $prompt }]
      }')")

  # Extract the text content from Claude's response
  NEW_HTML=$(echo "$API_RESPONSE" | jq -r '.content[0].text // empty')

  if [[ -z "$NEW_HTML" ]]; then
    echo "[$(date '+%H:%M:%S')] ERROR: Claude returned empty response. Skipping this cycle."
    echo "API response: $(echo "$API_RESPONSE" | jq -r '.error // "unknown error"')"
    sleep "$LOOP_INTERVAL"
    continue
  fi

  # Strip markdown fences if Claude included them
  NEW_HTML=$(echo "$NEW_HTML" | sed '/^```html$/d' | sed '/^```$/d')

  # Validate it looks like HTML
  if ! echo "$NEW_HTML" | grep -q '<!DOCTYPE html>'; then
    echo "[$(date '+%H:%M:%S')] ERROR: Response doesn't look like valid HTML. Skipping."
    sleep "$LOOP_INTERVAL"
    continue
  fi

  # 5. Write the new HTML
  echo "$NEW_HTML" > "$RESUMO_FILE"
  echo "[$(date '+%H:%M:%S')] Updated $RESUMO_FILE"

  # 6. Git commit + push
  cd "$(dirname "$RESUMO_FILE")/.."
  git add workshop-resumo/index.html
  COMMIT_MSG="Auto-improve workshop-resumo based on user feedback

Feedbacks implemented:
$FEEDBACK_MESSAGES

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

  git commit -m "$COMMIT_MSG"
  git push origin master

  echo "[$(date '+%H:%M:%S')] Committed and pushed!"

  # 7. Mark feedbacks as resolved
  for KEY in $FEEDBACK_KEYS; do
    curl -s -X POST "${API_BASE}/workshop/feedback/resolve" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg token "$WORKSHOP_ADMIN_TOKEN" --arg key "$KEY" '{token: $token, key: $key}')" > /dev/null
    echo "[$(date '+%H:%M:%S')] Marked $KEY as done"
  done

  echo ""
  echo "[$(date '+%H:%M:%S')] === Cycle complete! Sleeping ${LOOP_INTERVAL}s... ==="
  echo ""
  sleep "$LOOP_INTERVAL"
done
