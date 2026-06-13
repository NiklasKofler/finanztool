#!/bin/zsh
set -euo pipefail

echo "Ginmon Zugangsdaten werden lokal im macOS-Schluesselbund gespeichert."
echo "Sie werden nicht ins Projekt, Git oder Firestore geschrieben."
echo

read "email?Ginmon E-Mail: "
read -s "password?Ginmon Passwort: "
echo

security add-generic-password -U -s "finanztool-ginmon-email" -a "$USER" -w "$email"
security add-generic-password -U -s "finanztool-ginmon-password" -a "$USER" -w "$password"

echo "[ok] Ginmon-Zugangsdaten im Schluesselbund gespeichert."
