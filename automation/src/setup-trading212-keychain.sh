#!/bin/zsh
set -euo pipefail

save_secret() {
  local service="$1"
  local label="$2"

  echo "$label eingeben:"
  security add-generic-password -U -s "$service" -a "$USER" -w
}

echo "Trading-212-API-Zugangsdaten werden lokal im macOS-Schluesselbund gespeichert."
echo "Die Eingaben werden nicht angezeigt und nicht in Dateien geschrieben."
echo
echo "Hinweis: Der Finanztool-Agent nutzt nur lesende GET-Endpunkte."
echo "Der Trading-212-Key selbst bleibt trotzdem sensibel und gehoert nicht ins Git."
echo

save_secret "finanztool-trading212-api-key" "Trading 212 API-Key"
save_secret "finanztool-trading212-api-secret" "Trading 212 API-Secret"

echo
echo "[ok] Trading-212-Zugangsdaten wurden im Schluesselbund gespeichert."
