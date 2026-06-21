#!/bin/zsh
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
node_path="$(command -v node)"
firebase_path="$(command -v firebase)"
bin_path="$(dirname "$node_path"):$(dirname "$firebase_path"):/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
plist_path="$HOME/Library/LaunchAgents/com.niklas.finanztool.bitget-import.plist"

mkdir -p "$HOME/Library/LaunchAgents"

sed \
  -e "s|__NODE_PATH__|$node_path|g" \
  -e "s|__WORKING_DIRECTORY__|$repo_root/automation|g" \
  -e "s|__PATH__|$bin_path|g" \
  "$repo_root/automation/launchd/com.niklas.finanztool.bitget-import.plist.template" \
  > "$plist_path"

launchctl bootout "gui/$UID/com.niklas.finanztool.bitget-import" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$plist_path"
launchctl kickstart -k "gui/$UID/com.niklas.finanztool.bitget-import"

echo "[ok] Bitget-Import laeuft alle 5 Minuten."
