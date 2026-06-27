#!/bin/zsh
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo_root/automation"

deactivate_obsolete_agent() {
  local label="$1"
  launchctl bootout "gui/$UID/$label" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/$label.plist"
}

deactivate_obsolete_agent "com.niklas.finanztool.capitalcom-import"
deactivate_obsolete_agent "com.niklas.finanztool.traderepublic-mail"
deactivate_obsolete_agent "com.niklas.finanztool.traderepublic-manual-exports"

npm run install:bitget-agent
npm run install:bitget-ledger-agent
npm run install:flatex-agent
npm run install:ginmon-agent
npm run install:bank-accounts-agent
npm run install:credit-card-agents
npm run install:intergold-agent
npm run install:vbv-agent
npm run install:quote-agent
npm run install:command-runner
npm run install:health-agent
npm run install:document-server

echo "[ok] Alle Finanztool-LaunchAgents wurden installiert."
