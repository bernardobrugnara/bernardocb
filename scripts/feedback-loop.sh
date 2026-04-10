#!/usr/bin/env bash
set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
API_BASE="https://bernardocb-chat.bernardocb.workers.dev"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOOP_INTERVAL=120  # seconds between iterations

# Find jq (winget installs to a non-PATH location for Git Bash)
if command -v jq &>/dev/null; then
  JQ="jq"
elif [[ -f "/c/Users/${USER:-${USERNAME:-desktop}}/AppData/Local/Microsoft/WinGet/Links/jq.exe" ]]; then
  JQ="/c/Users/${USER:-${USERNAME:-desktop}}/AppData/Local/Microsoft/WinGet/Links/jq.exe"
else
  echo "ERROR: jq not found. Install with: winget install jqlang.jq"
  exit 1
fi

if [[ -z "${WORKSHOP_ADMIN_TOKEN:-}" ]]; then
  echo "ERROR: WORKSHOP_ADMIN_TOKEN not set. Run: export WORKSHOP_ADMIN_TOKEN=your_token"
  exit 1
fi

echo "=== Feedback Loop Started ==="
echo "    Project: $PROJECT_DIR"
echo "    Checking every ${LOOP_INTERVAL}s for approved feedback"
echo ""

# ── Main Loop ────────────────────────────────────────────────────────────────
while true; do
  echo "[$(date '+%H:%M:%S')] Checking for approved feedback..."

  # 1. Fetch approved feedbacks
  FEEDBACK_RESPONSE=$(curl -s "${API_BASE}/workshop/feedback?token=${WORKSHOP_ADMIN_TOKEN}&status=approved")
  FEEDBACK_COUNT=$(echo "$FEEDBACK_RESPONSE" | "$JQ" '.feedbacks | length')

  if [[ "$FEEDBACK_COUNT" == "0" || "$FEEDBACK_COUNT" == "null" ]]; then
    echo "[$(date '+%H:%M:%S')] No approved feedback. Sleeping ${LOOP_INTERVAL}s..."
    sleep "$LOOP_INTERVAL"
    continue
  fi

  echo "[$(date '+%H:%M:%S')] Found $FEEDBACK_COUNT approved feedback(s)!"

  # 2. Extract feedback messages and keys
  FEEDBACK_MESSAGES=$(echo "$FEEDBACK_RESPONSE" | "$JQ" -r '.feedbacks[] | "- " + .message')
  FEEDBACK_KEYS=$(echo "$FEEDBACK_RESPONSE" | "$JQ" -r '.feedbacks[].key')

  echo ""
  echo "Feedbacks to implement:"
  echo "$FEEDBACK_MESSAGES"
  echo ""

  # 3. Run Claude Code to implement the feedbacks
  echo "[$(date '+%H:%M:%S')] Handing off to Claude Code..."

  CLAUDE_PROMPT="Voce esta num loop autonomo de melhoria continua. Usuarios do workshop enviaram feedbacks sobre a pagina workshop-resumo/index.html.

Feedbacks aprovados para implementar:
$FEEDBACK_MESSAGES

Instrucoes:
1. Leia o arquivo workshop-resumo/index.html
2. Implemente as melhorias pedidas nos feedbacks
3. Mantenha TODA funcionalidade existente intacta (auth, summary generation, feedback button/modal, breakdown bars, markdown rendering)
4. Mantenha o estilo visual dark terminal (background #0a0a0a, texto #f0f0f0, accent #93c5fd, fonte monospace)
5. Mantenha TODAS as URLs de API e logica JavaScript funcionando
6. Faca commit e push com mensagem descrevendo as melhorias
7. Se um feedback for impossivel ou sem sentido, ignore-o

Nao pergunte nada, apenas implemente e faca deploy."

  cd "$PROJECT_DIR"
  echo "$CLAUDE_PROMPT" | claude --dangerously-skip-permissions -p

  echo ""
  echo "[$(date '+%H:%M:%S')] Claude Code finished!"

  # 4. Mark feedbacks as done
  for KEY in $FEEDBACK_KEYS; do
    curl -s -X POST "${API_BASE}/workshop/feedback/resolve" \
      -H "Content-Type: application/json" \
      -d "$("$JQ" -n --arg token "$WORKSHOP_ADMIN_TOKEN" --arg key "$KEY" '{token: $token, key: $key, status: "done"}')" > /dev/null
    echo "[$(date '+%H:%M:%S')] Marked $KEY as done"
  done

  echo ""
  echo "[$(date '+%H:%M:%S')] === Cycle complete! Sleeping ${LOOP_INTERVAL}s... ==="
  echo ""
  sleep "$LOOP_INTERVAL"
done
