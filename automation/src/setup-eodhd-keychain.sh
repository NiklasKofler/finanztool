#!/bin/zsh
set -euo pipefail

echo "EODHD API-Key wird lokal im macOS-Schluesselbund gespeichert."
echo "Die Eingabe wird nicht angezeigt und nicht in Dateien geschrieben."
echo

echo "EODHD API-Key eingeben:"
security add-generic-password -U -s "finanztool-eodhd-api-key" -a "$USER" -w

echo
echo "[ok] EODHD API-Key wurde im Schluesselbund gespeichert."
