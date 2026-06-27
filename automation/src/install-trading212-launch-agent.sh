#!/bin/zsh
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
node_path="$(command -v node)"
firebase_path="$(command -v firebase || true)"
bin_path="$(dirname "$node_path"):/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
if [[ -n "$firebase_path" ]]; then
  bin_path="$(dirname "$firebase_path"):$bin_path"
fi

mkdir -p "$HOME/Library/LaunchAgents"

install_agent() {
  local label="$1"
  local template="$2"
  local plist_path="$HOME/Library/LaunchAgents/$label.plist"

  sed \
    -e "s|__NODE_PATH__|$node_path|g" \
    -e "s|__WORKING_DIRECTORY__|$repo_root/automation|g" \
    -e "s|__PATH__|$bin_path|g" \
    "$repo_root/automation/launchd/$template" \
    > "$plist_path"

  launchctl bootout "gui/$UID/$label" 2>/dev/null || true
  launchctl bootstrap "gui/$UID" "$plist_path"
}

install_agent "com.niklas.finanztool.trading212-sync" "com.niklas.finanztool.trading212-sync.plist.template"
install_agent "com.niklas.finanztool.trading212-history" "com.niklas.finanztool.trading212-history.plist.template"

echo "[ok] Trading-212-Agenten installiert: Snapshot alle 5 Minuten, History stuendlich."
echo "[hinweis] Kein Kickstart: erster Lauf erfolgt automatisch nach dem Intervall oder manuell per npm run sync:trading212."
