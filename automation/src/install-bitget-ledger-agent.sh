#!/bin/zsh
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
node_path="$(command -v node)"
firebase_path="$(command -v firebase || true)"
bin_path="$(dirname "$node_path"):/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
if [[ -n "$firebase_path" ]]; then
  bin_path="$(dirname "$firebase_path"):$bin_path"
fi
plist_path="$HOME/Library/LaunchAgents/com.niklas.finanztool.bitget-ledger.plist"

mkdir -p "$HOME/Library/LaunchAgents"

sed \
  -e "s|__NODE_PATH__|$node_path|g" \
  -e "s|__WORKING_DIRECTORY__|$repo_root/automation|g" \
  -e "s|__PATH__|$bin_path|g" \
  "$repo_root/automation/launchd/com.niklas.finanztool.bitget-ledger.plist.template" \
  > "$plist_path"

launchctl bootout "gui/$UID/com.niklas.finanztool.bitget-ledger" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$plist_path"
launchctl kickstart -k "gui/$UID/com.niklas.finanztool.bitget-ledger"

echo "[ok] Bitget-Ledger-Agent laeuft stuendlich."
