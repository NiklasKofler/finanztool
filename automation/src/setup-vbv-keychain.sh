#!/bin/zsh
set -euo pipefail

echo "VBV Zugangsdaten werden lokal im macOS-Schluesselbund gespeichert."
echo "Sie werden nicht ins Projekt, Git oder Firestore geschrieben."
echo

read "email?VBV E-Mail: "
read -s "password?VBV Passwort: "
echo

security add-generic-password -U -s "finanztool-vbv-email" -a "$USER" -w "$email"
security add-generic-password -U -s "finanztool-vbv-password" -a "$USER" -w "$password"

echo "[ok] VBV-Zugangsdaten im Schluesselbund gespeichert."
