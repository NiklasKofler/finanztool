#!/bin/zsh
set -euo pipefail

ACCOUNT="${USER:-niklaskofler}"
PDF_SERVICE="finanztool-traderepublic-pdf-password"
PHONE_SERVICE="finanztool-traderepublic-phone"
PIN_SERVICE="finanztool-traderepublic-pin"

store_secret() {
  local service="$1"
  local label="$2"
  local secret="$3"
  if [[ -z "$secret" ]]; then
    echo "[skip] $label bleibt unveraendert."
    return
  fi
  security add-generic-password -U -a "$ACCOUNT" -s "$service" -w "$secret"
  echo "[ok] $label im Schluesselbund gespeichert: $service"
}

echo "Trade-Republic-Zugangsdaten lokal im macOS-Schluesselbund speichern."
echo "Leer lassen, wenn ein Wert unveraendert bleiben soll."
echo ""

printf "Telefonnummer im internationalen Format (+43...): "
read -r PHONE
store_secret "$PHONE_SERVICE" "Telefonnummer" "$PHONE"

printf "Trade-Republic PIN: "
read -rs PIN
printf "\n"
store_secret "$PIN_SERVICE" "PIN" "$PIN"

printf "PDF-Passwort fuer Duplicate-PDFs: "
read -rs PASSWORD
printf "\n"
store_secret "$PDF_SERVICE" "PDF-Passwort" "$PASSWORD"
