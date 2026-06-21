# Prompt: FT-Kurzbefehle auf dem Mac Studio einrichten

Diesen Prompt auf dem Mac Studio in Codex einfuegen, wenn die Kurzbefehle
`ftd`, `fts` und `ftu` dort eingerichtet werden sollen.

```text
Bitte richte die Finanztool-Kurzbefehle auf diesem Geraet ein.

Arbeite im Standardpfad:
/Users/niklaskofler/Documents/finanztool

Falls das Projekt dort fehlt, clone es von:
https://github.com/NiklasKofler/finanztool.git

Fuehre dann aus:

cd /Users/niklaskofler/Documents/finanztool
git status --short
git fetch origin --prune
git pull --ff-only origin main
npm run ft:install
source ~/.zshrc
ftd

Wichtig:
- lokale Aenderungen nicht ueberschreiben
- auf dem Mac Studio duerfen produktive Agents nach `ftd` installiert und
  Health geprueft werden
- danach kurz melden:
  1. ob `ftd`, `fts`, `ftu` verfuegbar sind
  2. welcher Commit aktiv ist
  3. ob lokale Secrets vorhanden sind
  4. welche LaunchAgents laufen
  5. ob `sync:health` OK ist
```
