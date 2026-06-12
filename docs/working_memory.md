# Working Memory

Dieses Dokument ist das gemeinsame Projektgedaechtnis fuer Codex auf MacBook Pro und Mac Studio.
Es ersetzt nicht den Chat, aber es bewahrt die wichtigen Entscheidungen, den letzten Stand und die naechsten Schritte.

## Nutzung

Vor jeder neuen Session:

1. `git pull`
2. dieses Dokument lesen
3. dann erst mit Codex weiterarbeiten

Nach jeder wichtigen Session:

1. dieses Dokument aktualisieren
2. `git add`, `git commit`, `git push`

## Projektziel

Eine persoenliche Finanzperformance-App, die Vermoegenswerte aus mehreren Quellen moeglichst automatisiert sammelt, vereinheitlicht, bewertet und spaeter fuer KI-gestuetzte Entscheidungen nutzbar macht.

## Gemeinsamer Arbeitsmodus

- Das Repo ist die gemeinsame Wahrheit
- Der Chat ist hilfreich, aber nicht der verlaessliche geraeteuebergreifende Speicher
- Wichtige Entscheidungen und offener Stand muessen im Repo dokumentiert werden
- MacBook Pro und Mac Studio arbeiten auf demselben Branch `main`

## Rollen der Geraete

### MacBook Pro

- aktive Entwicklung
- UI, Parser, Architektur, Debugging, Review

### Mac Studio

- Dauerbetrieb
- Import-Agent
- Dateiueberwachung
- Backfills und spaeter Automationen

## Wichtige Architekturentscheidungen

- Frontend: React + Vite in `app/`
- Datenhaltung: Firestore
- Hosting: Firebase Hosting
- Regeln: `firestore.rules`, `storage.rules`
- Import-Automation: lokaler Agent in `automation/`
- Originaldokumente kommen aus Google Drive
- Importierte Dokumente koennen nach `02_Archiviert` verschoben werden

## Wichtige Quellen

- Flatex
- Trade Republic
- Ginmon
- Intergold
- EquatePlus
- Bitget

## Aktueller Produktivstand

- Firebase-Projekt: `finanzperformance-tool`
- Firestore Database ist erstellt
- Firebase Hosting ist konfiguriert
- Die App liest Live-Daten aus Firestore
- Der Import-Agent verarbeitet vorhandene und neue Dateien aus dem Drive-Ordner
- Importierte Dateien werden dokumentiert und koennen archiviert werden
- Duplikate werden per SHA-256 erkannt

## Fachlich bereits umgesetzt

### Flatex

- CSV-Import fachlich umgesetzt
- Daten schreiben nach:
  - `imports`
  - `rawDocuments`
  - `imports/{id}/rawRows`
  - `ledgerEntries`
  - `transactions`
  - `costEvents`
  - `positions`
  - `snapshots`
  - `sourcePositions`

### Trade Republic

- `Transaction export.csv` wird fachlich geparst
- Einstandswerte werden aus Trades berechnet
- `Net Worth.pdf` liefert aktuelle Positionswerte
- Gewinn/Verlust je Position wird berechnet

### Ginmon

- PDF-/Reportdaten werden importiert
- Positionsdaten werden in `sourcePositions` geschrieben
- Kosten-/Steuerdetails muessen noch vertieft werden

### Intergold

- Preisimport ist vorbereitet
- Bestandsbewertung aus Belegen ist vorbereitet
- Preisimport und Belegimport bleiben getrennt
- Kurzfassung liegt in [intergold_preisimport_kurzfassung.md](/Users/niklaskofler/Documents/Finanztool/docs/intergold_preisimport_kurzfassung.md)

### EquatePlus

- Ordner ist im Drive-Scan enthalten
- PDF-Dateien werden importiert und archiviert
- Fachlicher Parser ist noch offen

### Bitget

- API-Client ist vorbereitet
- Importskript ist vorhanden
- Aktueller Blocker: `sign signature error` bei privaten API-Requests

## Importierter Finanzstand laut letzter Studio-Zusammenfassung

- Flatex: `23.234,18 EUR`
- Trade Republic: `2.254,30 EUR`
- Ginmon: `8.029,81 EUR`
- Intergold: `31.289,53 EUR`
- Gesamt: `64.807,82 EUR`

## Wichtige lokale Pfade

- Projekt:
  - `/Users/niklaskofler/Documents/finanztool` auf dem Mac Studio
  - `/Users/niklaskofler/Documents/Finanztool` auf diesem MacBook
- Automation:
  - `automation/`
- Drive Originale:
  - `/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/01_Originale`
- Drive Archiv:
  - `/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/02_Archiviert`
- Service Account lokal:
  - `secrets/firebase-service-account.json`

## Lokale Dateien, die nicht in Git sind

- `app/.env.local`
- `automation/.env`
- `secrets/firebase-service-account.json`

Diese Dateien muessen pro Geraet lokal vorhanden sein.

## Wichtige Dokumente im Repo

- [Arbeitsstand](/Users/niklaskofler/Documents/Finanztool/docs/arbeitsstand_2026-05-25.md)
- [Mac Studio Runbook](/Users/niklaskofler/Documents/Finanztool/docs/export_import_runbook_mac_studio.md)
- [README](/Users/niklaskofler/Documents/Finanztool/README.md)
- [Intergold Kurzfassung](/Users/niklaskofler/Documents/Finanztool/docs/intergold_preisimport_kurzfassung.md)
- [Trade Republic Strategie](/Users/niklaskofler/Documents/Finanztool/docs/traderepublic_import_strategie.md)
- [Ginmon Konzept](/Users/niklaskofler/Documents/Finanztool/docs/ginmon_import_konzept.md)

## Wichtige Befehle

```bash
nvm install
nvm use
npm run install:all
npm run dev
npm run agent
npm run backfill:summaries
npx firebase-tools deploy --project finanzperformance-tool
```

## Offene Punkte

1. `working_memory.md` kuenftig nach wichtigen Sessions wirklich pflegen
2. Bitget API-Key/Secret/Passphrase sauber korrigieren
3. UI weiter ausbauen: Filter, Sortierung, Detailansichten
4. EquatePlus Parser ergaenzen
5. Ginmon Kosten-/Steuerdetails vertiefen
6. Intergold Belegparser und Preisbewertung sauber zusammenfuehren

## Naechster empfohlener Schritt

Immer zuerst dieses Dokument und [README](/Users/niklaskofler/Documents/Finanztool/README.md) lesen, dann erst eine neue Arbeitsaufgabe anfangen. Fachlich waere der naechste groessere Schritt aktuell entweder Bitget reparieren oder die App-UI auf die bereits importierten Live-Daten weiter auszubauen.

## Letzte Aktualisierung

- Datum: 2026-06-12
- Quelle: Stand vom Mac Studio nach Pull auf das MacBook uebernommen
