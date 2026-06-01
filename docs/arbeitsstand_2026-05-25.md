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
- Firebase Hosting ist konfiguriert; kein erneuter Public Deploy mit Finanzwerten ohne Auth-Grenze
- Firestore Database ist erstellt
- Firebase Storage ist im Spark-Tarif nicht verfuegbar und bleibt bis Billing-Entscheidung deaktiviert
- Erster Flatex-CSV-Import ist in der App vorhanden
- Lokaler Import-Agent ist vorbereitet in `automation/`
- Drive-Ordnerstruktur wurde als Ziel fuer automatische Ablage definiert
- Import-Agent laeuft als `launchd` Dienst
- Backfill-Summaries fuer Flatex, Trade Republic, Ginmon und Intergold sind in Firestore geschrieben

## Importierter Finanzstand

- Flatex: `23.234,18 EUR`
- Trade Republic: `2.254,30 EUR`
- Ginmon: `8.029,81 EUR`
- Intergold: `31.289,53 EUR` konservativ mit Intergold-Ankaufspreisen
- Gesamt: `64.807,82 EUR`

## Wichtige Dateien

- `app/src/App.tsx`
- `app/src/firebase/client.ts`
- `app/src/firebase/importFlatex.ts`
- `app/src/imports/flatex.ts`
- `automation/src/drive-watcher.mjs`
- `automation/src/flatex-parser.mjs`

## Git Stand

- Initialer Commit wurde lokal erstellt
- GitHub-Remote ist verbunden: `origin` -> `https://github.com/NiklasKofler/finanztool.git`
- `main` trackt `origin/main`

## Naechste Schritte

1. Projekt auf Mac Studio identisch aufsetzen
2. `app/.env.local` und `automation/.env` auf Mac Studio anlegen
3. Service Account JSON fuer Firebase erstellen
4. Import-Agent auf Mac Studio starten
5. Flatex, Trade Republic, Ginmon und Intergold automatisieren
6. Auth-Konzept fuer oeffentliches Hosting entscheiden, bevor Finanzwerte deployed werden

## Wichtige Hinweise

- Keine manuellen Imports mehr in der App als Zielzustand
- Dateien sollen automatisch aus dem Drive-Ordner eingelesen werden
- Originaldateien bleiben erhalten
- Firestore dient als zentrale App-Datenbank
