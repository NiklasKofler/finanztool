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
- Bitget
- Capital.com
- VBV Vorsorgekasse
- EquatePlus

## Aktueller Produktivstand

- Firebase-Projekt: `finanzperformance-tool`
- Hosting URL: `https://finanzperformance-tool.web.app`
- Letzter Deploy: 2026-06-13 09:20 CEST, Hosting und Firestore Rules
- Firestore Database ist erstellt
- Firebase Hosting ist konfiguriert
- Die App liest Live-Daten aus Firestore
- App-Login ist auf `niklas.kofler@gmail.com` begrenzt
- App darf nur `automationCommands/sync_quotes_manual` schreiben
- Finanzdaten werden lokal durch Agents geschrieben, nicht direkt aus der App
- Mac Studio ist der Zielort fuer Dauerbetrieb

## Fachlich bereits umgesetzt

### Flatex

- Browser-Export-Agent ist gebaut
- Zugangsdaten liegen im macOS-Schluesselbund
- Session-TAN bleibt deaktiviert
- Exportzeitraum: `zwei Wochen`
- Zeitplan: taeglich 08:00, 10:00, 13:00, 17:00, 22:00
- Bestand und Cash werden aus Konto-/Depotumsaetzen berechnet
- Broker-Dashboardzahlen werden nicht als Bewertungsquelle importiert
- Wertpapierkurse kommen aus Boerse Frankfurt

### Trade Republic

- Mail-Agent fuer passwortgeschuetzte `Securities Settlement` PDFs ist gebaut
- PDF-Passwort liegt lokal im macOS-Schluesselbund
- Bei Transaktionen kommt am Tagesende automatisch eine Trade-Republic-Mail
- Agent laedt, entsperrt, archiviert und verarbeitet neue PDFs idempotent
- Private Equity `LU3176111881` bleibt dokumentbasiert, weil keine stabile
  Boerse-Frankfurt-Quelle gefunden wurde
- PDF-Passwort bleibt lokal im macOS-Schluesselbund und wird nie in App, Firestore oder Git gespeichert

### Ginmon

- Browser/API-Agent ist gebaut
- Login funktioniert ohne 2FA
- Mehrere Portfolios/Konten werden dynamisch verarbeitet
- Positionsdaten werden in `sourcePositions` geschrieben
- Summary wird in `sourceSummaries/ginmon` geschrieben
- Kosten-/Steuerdetails muessen spaeter vertieft werden

### Intergold

- Preisimport ist gebaut
- Bestandsbewertung aus Belegen ist gebaut
- Preisimport und Belegimport bleiben getrennt
- Kurzfassung liegt in [intergold_preisimport_kurzfassung.md](/Users/niklaskofler/Documents/Finanztool/docs/intergold_preisimport_kurzfassung.md)

### EquatePlus

- Ordner ist im Drive-Scan enthalten
- PDF-Dateien werden importiert und archiviert
- Fachlicher Parser ist noch offen
- E-Mail-Benachrichtigungen wurden aktiviert
- Naechste Entscheidung erst nach Analyse der ersten eingehenden Benachrichtigung

### Betriebliche Altersvorsorge

- VBV Vorsorgekasse ist als eigene Quelle gebaut
- Keine Einzelpositionen
- Nur Summary/Karte `sourceSummaries/vbv`
- Quartalsweise Aktualisierung reicht aus

### Bitget

- Read-only API funktioniert
- API-Key, Secret und Passphrase liegen lokal im macOS-Schluesselbund
- Spot- und Earn-Bestand werden in `sourcePositions` geschrieben
- `sourceSummaries/bitget` nutzt Bitgets kontenuebergreifende Bewertung
- `agentStatus/bitget` dokumentiert den letzten erfolgreichen Lauf
- Automatischer Import laeuft auf dem MacBook alle 15 Minuten
- Firestore erhaelt hoechstens ein Bitget-Importdokument pro Kalendertag
- Historische Self-Service-Exporte von 13.06.2024 bis 13.06.2026 liegen in
  `My Drive/Depot/01_Originale/Bitget/API_Exports/`
- Verifizierte Einstandswerte:
  - TRUMP: `990,80114 USDT` fuer aktuell `20,20977 TRUMP`
  - MELANIA: `289,53119 USDT` fuer aktuell `66,20373 MELANIA`
- Persistente Kostenbasis liegt in Firestore unter `sourceCostBasis` und wird
  bei jedem Bitget-Import zugemischt
- Coins ohne aktuellen Bitget-Ticker werden fuer die Bewertung ueber einen
  CoinGecko-Fallback bepreist; aktuell betrifft das MELANIA
- BTC-Einstand wurde vom Nutzer mit insgesamt `3.000 EUR` fuer den Earn-Bestand
  von `0,066856 BTC` bestaetigt; rechnerischer Einstandskurs:
  `44.872,561924 EUR/BTC`
- EUR-Einstandswerte fuer TRUMP und MELANIA bleiben bis zum Abgleich mit Bank-
  oder Kreditkartenbuchungen bewusst leer
- Bekannte Health-Warnung: kleine Abweichung zwischen Positionssumme und
  Bitget-Summary ist noch zu klaeren

### Capital.com

- API funktioniert
- API-Key und Custom Password liegen lokal im macOS-Schluesselbund
- Capital.com bietet laut Plattform nur `Read & Trade`, keinen echten Read-only-Key
- Agent nutzt trotzdem nur lesende API-Endpunkte
- Letzter Test: Live-Konto, EUR, `0,00 EUR`, 0 offene Positionen
- CFD-Positionen werden angezeigt, aber nicht zur Vermoegenssumme addiert
- Kontowert kommt aus `GET /accounts`

## Aktueller Firestore-/Health-Stand

- Capital.com: `OK`, `0,00 EUR`, 0 Positionen
- VBV: `OK`, `1.815,86 EUR`, Stichtag `2026-05-31`
- Health: `WARNUNG` wegen `summary_mismatch_bitget`

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

- [Import Masterplan](/Users/niklaskofler/Documents/Finanztool/docs/import_masterplan.md)
- [Arbeitsstand](/Users/niklaskofler/Documents/Finanztool/docs/arbeitsstand_2026-05-25.md)
- [Mac Studio Runbook](/Users/niklaskofler/Documents/Finanztool/docs/export_import_runbook_mac_studio.md)
- [Mac Studio Handoff 2026-06-13](/Users/niklaskofler/Documents/Finanztool/docs/mac_studio_handoff_2026-06-13.md)
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
firebase deploy --only hosting,firestore:rules

cd automation
npm run secrets:export
npm run secrets:import
npm run secrets:list
npm run install:all-agents
npm run sync:health
```

## Offene Punkte

1. Secrets verschluesselt vom MacBook auf den Mac Studio uebertragen
2. Mac-Studio-Agents mit `npm run install:all-agents` installieren
3. Bitget-Summary-Abweichung klaeren
4. Flatex nach einigen automatischen Exportlaeufen gegen Broker pruefen
5. Ginmon-Kostenlogik vertiefen
6. EquatePlus Parser nach erster Benachrichtigung ergaenzen
7. Open-Banking-Anbieter fuer Sparkasse George, Amazon Visa und TF Bank pruefen
8. UI weiter ausbauen: Filter, Sortierung, Detailansichten, Charts

## Naechster empfohlener Schritt

Aktuelle Version auf GitHub pullen, Secrets importieren und alle Agents auf dem
Mac Studio installieren. Danach App-Warnkarte und `agentStatus/*` kontrollieren.

## Letzte Aktualisierung

- Datum: 2026-06-13 09:20 CEST
- Quelle: MacBook-Session vor Mac-Studio-Uebergabe
- Status: Bitget, Capital.com, Flatex, Ginmon, Trade Republic Mail, Intergold,
  VBV, Boerse-Frankfurt-Kurse und Health-System dokumentiert; Mac-Studio-Agents
  bereit fuer Installation
