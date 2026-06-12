#!/bin/zsh
set -euo pipefail

save_secret() {
  local service="$1"
  local label="$2"

  echo "$label eingeben:"
  security add-generic-password -U -s "$service" -a "$USER" -w
}

echo "Bitget-Zugangsdaten werden lokal im macOS-Schluesselbund gespeichert."
echo "Die Eingaben werden nicht angezeigt und nicht in Dateien geschrieben."
echo

save_secret "finanztool-bitget-api-key" "API-Key"
save_secret "finanztool-bitget-api-secret" "API-Secret"
save_secret "finanztool-bitget-api-passphrase" "API-Passphrase"

echo
echo "[ok] Bitget-Zugangsdaten wurden im Schluesselbund gespeichert."
