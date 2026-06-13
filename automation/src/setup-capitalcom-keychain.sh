#!/bin/zsh
set -euo pipefail

save_secret() {
  local service="$1"
  local label="$2"

  echo "$label eingeben:"
  security add-generic-password -U -s "$service" -a "$USER" -w
}

echo "Capital.com API-Zugangsdaten werden lokal im macOS-Schluesselbund gespeichert."
echo "Die Eingaben werden nicht angezeigt und nicht in Dateien geschrieben."
echo
echo "Hinweis: Capital.com API-Keys sind laut Doku nicht Read-only."
echo "Unser Agent nutzt nur lesende GET-Endpunkte, der Key selbst bleibt trotzdem sensibel."
echo

save_secret "finanztool-capitalcom-identifier" "Capital.com Login/E-Mail"
save_secret "finanztool-capitalcom-api-key" "Capital.com API-Key"
save_secret "finanztool-capitalcom-api-password" "Capital.com API-Key Custom Password"

echo
echo "[ok] Capital.com-Zugangsdaten wurden im Schluesselbund gespeichert."
