#!/bin/zsh
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo_root/automation"

npm run install:bitget-agent
npm run install:capitalcom-agent
npm run install:flatex-agent
npm run install:ginmon-agent
npm run install:intergold-agent
npm run install:traderepublic-mail-agent
npm run install:vbv-agent
npm run install:quote-agent
npm run install:command-runner

echo "[ok] Alle Finanztool-LaunchAgents wurden installiert."
