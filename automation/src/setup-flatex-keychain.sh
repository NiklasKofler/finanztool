#!/bin/zsh
set -euo pipefail

save_secret() {
  local service="$1"
  local label="$2"

  echo "$label eingeben:"
  security add-generic-password -U -s "$service" -a "$USER" -w
}

echo "Flatex-Zugangsdaten werden lokal im macOS-Schluesselbund gespeichert."
echo "Die Eingaben werden nicht angezeigt und nicht in Dateien geschrieben."
echo "Der Agent meldet sich immer ohne Session-TAN an."
echo

save_secret "finanztool-flatex-user-id" "Kundennummer / Benutzername"
save_secret "finanztool-flatex-password" "Passwort"

echo
echo "[ok] Flatex-Zugangsdaten wurden im Schluesselbund gespeichert."
