# Arbeitsstand 2026-05-25

## Ziel

Persoenliches Finanzperformance-Tool fuer:

- Flatex
- Trade Republic
- Ginmon
- Intergold
- Bitget spaeter

## Aktueller Stand

- Lokale React/Firebase-App steht in `app/`
- Firebase Hosting ist konfiguriert
- Firebase Deploy funktioniert
- Erster Flatex-CSV-Import ist in der App vorhanden
- Lokaler Import-Agent ist vorbereitet in `automation/`
- Drive-Ordnerstruktur wurde als Ziel fuer automatische Ablage definiert

## Wichtige Dateien

- `app/src/App.tsx`
- `app/src/firebase/client.ts`
- `app/src/firebase/importFlatex.ts`
- `app/src/imports/flatex.ts`
- `automation/src/drive-watcher.mjs`
- `automation/src/flatex-parser.mjs`

## Git Stand

- Initialer Commit wurde lokal erstellt
- Remote existiert noch nicht
- GitHub-Repo muss noch angelegt oder verknuepft werden

## Naechste Schritte

1. GitHub-Repo anlegen und als `origin` verbinden
2. Projekt auf Mac Studio identisch aufsetzen
3. `app/.env.local` und `automation/.env` auf Mac Studio anlegen
4. Service Account JSON fuer Firebase erstellen
5. Import-Agent auf Mac Studio starten
6. Flatex, Trade Republic, Ginmon und Intergold automatisieren

## Wichtige Hinweise

- Keine manuellen Imports mehr in der App als Zielzustand
- Dateien sollen automatisch aus dem Drive-Ordner eingelesen werden
- Originaldateien bleiben erhalten
- Firestore dient als zentrale App-Datenbank
