#!/bin/zsh
set -euo pipefail

SERVICE="finanztool-traderepublic-pdf-password"
ACCOUNT="${USER:-niklaskofler}"

echo "Trade-Republic PDF-Passwort fuer verschluesselte Duplicate-PDFs speichern."
echo "Der Wert wird nur lokal im macOS-Schluesselbund abgelegt."
printf "PDF-Passwort: "
read -rs PASSWORD
printf "\n"

if [[ -z "$PASSWORD" ]]; then
  echo "Abgebrochen: Passwort ist leer." >&2
  exit 1
fi

security add-generic-password -U -a "$ACCOUNT" -s "$SERVICE" -w "$PASSWORD"
echo "[ok] Passwort im Schluesselbund gespeichert: $SERVICE"
