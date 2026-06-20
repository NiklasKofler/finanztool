# Working Memory

Dieses Dokument ist das gemeinsame Projektgedaechtnis fuer Codex auf MacBook Pro und Mac Studio.
Es ersetzt nicht den Chat, aber es bewahrt die wichtigen Entscheidungen, den letzten Stand und die naechsten Schritte.

## Nutzung

Vor jeder neuen Session:

1. Wenn das Projekt vom anderen Geraet uebernommen werden soll: `1111`
2. `docs/device_workflow.md` lesen
3. `docs/device_switch_log.md` lesen
4. dieses Dokument lesen
5. dann erst mit Codex weiterarbeiten

Nach `1111` muss Codex im Chat kurz melden:

- auf welchem Geraet gearbeitet wird
- welcher Stand/Commit aktiv ist
- wo am alten Geraet aufgehoert wurde
- welche naechsten Schritte geplant sind
- ob Wechselprobleme, fehlende Secrets oder lokale Abweichungen bestehen

Nach jeder wichtigen Session:

1. dieses Dokument aktualisieren
2. bei Geraetewechseln oder Problemen `docs/device_switch_log.md`
   aktualisieren
3. lokal sichern mit `2222` oder uebergeben/deployen mit `3333`

## Projektziel

Eine persoenliche Finanzperformance-App, die Vermoegenswerte aus mehreren Quellen moeglichst automatisiert sammelt, vereinheitlicht, bewertet und spaeter fuer KI-gestuetzte Entscheidungen nutzbar macht.

## Gemeinsamer Arbeitsmodus

- Das Repo ist die gemeinsame Wahrheit
- Der Chat ist hilfreich, aber nicht der verlaessliche geraeteuebergreifende Speicher
- Wichtige Entscheidungen, Beschluesse und offener Stand muessen waehrend der
  Arbeit im Repo dokumentiert werden, vor allem in dieser Datei
- MacBook Pro und Mac Studio arbeiten auf demselben Branch `main`
- Der gemeinsame Standardpfad auf beiden Geraeten ist
  `/Users/niklaskofler/Documents/finanztool`
- Waehrend aktiver Entwicklung wird nicht automatisch gepusht oder deployed.
  Lokal wird ueber `localhost:5173` gearbeitet. GitHub/Firebase erst am Ende
  oder wenn der Nutzer es ausdruecklich verlangt.
- Wenn Codex mit dem Nutzer etwas fachlich oder technisch festlegt, muss Codex
  die Entscheidung direkt in `docs/working_memory.md` nachziehen, damit ein
  Geraetewechsel nicht den Kontext verliert.
- Wenn beim Wechsel zwischen Mac Studio und MacBook Pro ein Problem auftritt,
  muss Codex es in `docs/device_switch_log.md` festhalten.

## Rollen der Geraete

### MacBook Pro

- aktive Entwicklung
- UI, Parser, Architektur, Debugging, Review
- keine produktiven Studio-LaunchAgents starten

### Mac Studio

- Dauerbetrieb
- produktive Import-/API-/Kurs-Agents
- Dateiueberwachung und Google-Drive-Sync
- Backfills und Automationen

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
- Bankkonten/Kreditkarten, noch offen:
  - Sparkasse/George
  - Amazon Visa
  - TF Bank Kreditkarte
  - Revolut, derzeit inaktiv
- Trading 212, derzeit inaktiv/offen

## Aktueller Produktivstand

- Firebase-Projekt: `finanzperformance-tool`
- Hosting URL: `https://finanzperformance-tool.web.app`
- Letzter Deploy: 2026-06-13 20:30 CEST, Hosting, Firestore Rules/Indexes
  und Storage Rules
- Firestore Database ist erstellt
- Firebase Hosting ist konfiguriert
- Die App liest Live-Daten aus Firestore
- App-Login ist auf `niklas.kofler@gmail.com` begrenzt
- App darf nur `automationCommands/sync_quotes_manual` schreiben
- Finanzdaten werden lokal durch Agents geschrieben, nicht direkt aus der App
- Mac Studio ist der Zielort fuer Dauerbetrieb

## Aktueller Geraete-Handoff

- Stand: 2026-06-20 17:47 CEST
- Aktion: `3333` vom Mac Studio Richtung MacBook Pro
- Ausgangscommit: `0c65ab4`
- Inhalt: Geraetewechsel-Regeln, Zahlencodes, Wechselprotokoll und
  Startprompt fuer neue Codex-Sessions dokumentiert
- Naechster Schritt auf dem MacBook Pro: Projekt mit dem Erstprompt aus
  `docs/device_workflow.md` starten und `1111` ausfuehren lassen
- Wichtig: Codex muss nach `1111` kurz melden, welcher Commit aktiv ist, wo
  am Mac Studio aufgehoert wurde und ob lokale Secrets/Agents fehlen oder
  bewusst nicht laufen

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
- Flatex-Postfach inklusive PDFs ist jetzt als generischer Dokumentfaktenlayer
  in Firestore abgebildet:
  - Parser: `automation/src/flatex-document-parser.mjs`
  - Reconcile/Sync: `automation/src/reconcile-flatex-documents-local.mjs`
  - Firestore-Collections: `sourceDocuments`, `sourceDocumentFacts`
  - Stabile Dokument-IDs: bevorzugt `flatex_doc_<PostboxDocumentId>`,
    sonst Hash-Fallback
  - Verifizierter Stand 2026-06-13:
    - `sourceDocuments`: 283 Flatex-Dokumente
    - `PARSED`: 283
    - `UNKNOWN`: 0
    - `sourceDocumentFacts`: 401 Flatex-Fakten
- Flatex-Faktentypen:
  - Wertpapierabrechnungen/Kaeufe: `security_trade`
  - Dividenden/Ausschuettungen: `income_distribution`
  - Thesaurierungen: `fund_accumulation`
  - Kontoauszuege: `account_statement`,
    `account_position_market_value`
  - Depotauszuege: `depot_statement`, `depot_position_snapshot`
  - Steuerbescheinigungen: `tax_certificate`, `tax_certificate_entry`
  - Kapitalmassnahmen/Info-/Order-/SEPA-/CFD-/Kosten-/Saldo-Dokumente als
    eigene generische Faktentypen
- Falls kuenftig ein Flatex-Dokument nicht klassifiziert werden kann, erzeugt
  `systemHealth/current` eine Warnung `Flatex-Dokument nicht klassifiziert`.

### Trade Republic

- Mail-Agent fuer passwortgeschuetzte `Securities Settlement` PDFs ist gebaut
- PDF-Passwort liegt lokal im macOS-Schluesselbund
- Bei Transaktionen kommt am Tagesende automatisch eine Trade-Republic-Mail
- Agent laedt, entsperrt, archiviert und verarbeitet neue PDFs idempotent
- Wichtige Baseline-Entscheidung 2026-06-13:
  - Die am 2026-06-13 frisch exportierten Dateien sind ab jetzt der neue
    Trade-Republic-Status-Quo
  - alte Mail-Duplikate und fruehere Trade-Republic-Imports sind fachlich
    obsolet und wurden in Firestore entsprechend ersetzt/markiert
  - ab dem Baseline-Datum veraendert der Mail-Agent den Stand nur noch mit
    neuen E-Mail-Abrechnungen nach `2026-06-13`
- Neue Baseline-Dateien:
  - `Transaction export.csv`: komplette Transaktions-/Positionsbasis
  - `Account statement.pdf`: Cashkonto-Abgleich, Periodenende `2026-06-12`
  - `Tax Report 2025.pdf`: Jahressteuerbeleg
- Baseline-Sync:
  - Script: `automation/src/reconcile-traderepublic-baseline-local.mjs`
  - Befehl: `npm run sync:traderepublic-baseline`
  - archivierte Originale:
    `01_Originale/TradeRepublic/Baseline/2026-06-13/`
- Verifizierter Firestore-Stand nach Baseline:
  - `sourceDocuments`: 3 Trade-Republic-Baseline-Dokumente
  - `sourceDocumentFacts`: 198 Trade-Republic-Fakten
  - `transactions`: 106
  - `ledgerEntries`: 191
  - `costEvents`: 13
  - `sourcePositions`: 6 inklusive Cashkonto
  - `sourceSummaries/traderepublic.netValue`: `2.523,87 EUR`
  - `sourceSummaries/traderepublic.cashValue`: `149,49 EUR`
  - `sourceSummaries/traderepublic.depotValue`: `2.374,38 EUR`
- Trade-Republic-Positionen nach Baseline:
  - Stoxx Europe Defense EUR (Acc): `104,072579` Stk.,
    Einstand `590,95 EUR`
  - Core S&P 500 USD (Acc): `0,295609` Stk., Einstand `190,00 EUR`
  - NASDAQ100 USD (Acc): `0,267833` Stk., Einstand `340,00 EUR`
  - Netflix: `0,094` Stk., Einstand `10,06 EUR`; Split vom
    2025-11-17 ist eingerechnet
  - Private Equity `LU3176111881`: `11,178226` Stk.,
    Einstand `1.145,40 EUR`
  - Cashkonto: `149,49 EUR`
- Private Equity `LU3176111881` bleibt dokumentbasiert, weil keine stabile
  Boerse-Frankfurt-Quelle gefunden wurde
- PDF-Passwort bleibt lokal im macOS-Schluesselbund und wird nie in App, Firestore oder Git gespeichert
- PDF-Tooling-Entscheidung 2026-06-13:
  - `qpdf` ist fuer verschluesselte Trade-Republic-Duplicate-PDFs erforderlich
  - `pdftotext`/Poppler ist fuer robuste Textextraktion empfohlen
  - `automation/src/pdf-text.mjs` nutzt jetzt automatisch `pdftotext`, falls
    im `PATH` vorhanden, und faellt sonst auf `pdfjs-dist` zurueck
  - Auf dem aktuellen Shell-Pfad waren `qpdf`, `pdftotext` und `brew` nicht
    sichtbar; unverschluesselte PDFs wurden trotzdem erfolgreich per `pdfjs`
    extrahiert

### Ginmon

- Browser/API-Agent ist gebaut
- Login funktioniert ohne 2FA
- Mehrere Portfolios/Konten werden dynamisch verarbeitet
- Positionsdaten werden in `sourcePositions` geschrieben
- Summary wird in `sourceSummaries/ginmon` geschrieben
- Ginmon `Investment`, `Ginmon Top Zinsen` und `Risikoklasse 10 Global`
  werden als drei eigene Depots erkannt
- Positions-Quotes werden durch den lokalen Kurs-Sync ergaenzt, ohne den
  Ginmon-API-Gesamtwert zu ueberschreiben
- Falls Ginmon fuer eine Position keinen positionsgenauen Einstand liefert,
  wird aktuell anteilig `netInflow * allocation.ratio` als Arbeitswert
  verwendet; Steuerdetails muessen spaeter vertieft werden
- Wichtige Korrektur 2026-06-13: Die bisherige Ginmon-Datenhaltung ist noch
  nicht generisch genug. `sourcePositions` darf nur die aktuelle App-Ansicht
  sein, nicht die einzige Wahrheit.
- Verbindlicher Ginmon-Datenvertrag liegt in
  [Ginmon Konzept](/Users/niklaskofler/Documents/finanztool/docs/ginmon_import_konzept.md):
  - Dokumente liefern echte Stueckzahlen, Einstand, Kosten, Steuern,
    Transaktionen, Rechnungen und Strategie-/Risikoinformationen
  - API liefert fuer Ginmon nur noch aktuelle Werte und daraus abgeleitete
    aktuelle Ginmon-Kurse je ISIN
  - Boerse-Frankfurt-Kurs-Sync laeuft standardmaessig nicht mehr fuer Ginmon,
    sondern fuer Flatex und Trade Republic
  - Geschaetzte Stueckzahlen duerfen nur mit `quantityEstimated=true` und
    `ca.` angezeigt werden
- Lokale Dateianalyse: 369 Ginmon-Dateien vorhanden
- Ginmon-Portalabgleich am 2026-06-13:
  - Portal meldet 333 Dokumente
  - alle 333 Portal-Dokumente waren lokal bereits vorhanden
  - 0 neue Downloads
  - zusaetzliche lokale Dateien sind Vertrags-/Strategie-/Info-Unterlagen
- Firestore-Stand nach generischer Befuellung:
  - `sourceDocuments`: 369 Ginmon-Dokumente
  - `sourceDocumentFacts`: 663 Ginmon-Fakten
  - `docsWithExternalId`: 333
  - `parsedDocs`: 351
  - `unknownDocs`: 18
- Ginmon-Faktentypen in `sourceDocumentFacts`:
  - `position_snapshot`: 250
  - `trade`: 95
  - `invoice`: 88
  - `account_statement`: 77
  - `cash_ledger_entry`: 62
  - `earning`: 34
  - `quarterly_report`: 30
  - `account_snapshot`: 27
- Dedupe-Regel: Portal-Dokumente verwenden stabile Firestore-IDs
  `ginmon_doc_<portalDocumentId>`. Verschieben/Archivieren erzeugt dadurch
  keine neue fachliche Dokumentidentitaet.
- Ginmon-Betriebsregel ab 2026-06-13:
  - Dokumentimport taeglich um `02:00`
  - API-Sync stuendlich
  - beide LaunchAgents laufen mit `GINMON_HEADLESS=true`
  - installierte LaunchAgents:
    - `com.niklas.finanztool.ginmon-documents`
    - `com.niklas.finanztool.ginmon-sync`
  - frischer Headless-API-Kickstart wurde verifiziert:
    `last exit code = 0`, Error-Log leer

### Intergold

- Preisimport ist gebaut
- Bestandsbewertung aus Belegen ist gebaut
- Preisimport und Belegimport bleiben getrennt
- Kurzfassung liegt in [intergold_preisimport_kurzfassung.md](/Users/niklaskofler/Documents/finanztool/docs/intergold_preisimport_kurzfassung.md)

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

- Firestore enthaelt aktuelle Bitget-Positionen aus einem erfolgreichen Lauf
- API-Key, Secret und Passphrase liegen lokal im macOS-Schluesselbund
- Spot- und Earn-Bestand werden in `sourcePositions` geschrieben
- `sourceSummaries/bitget` wurde auf die Summe der sichtbaren, inkludierten
  Positionen korrigiert, damit die App keine doppelt gezaehlten Zusatzwerte zeigt
- `agentStatus/bitget` dokumentiert den letzten erfolgreichen Lauf
- Automatischer Import ist vorgesehen; aktueller lokaler Test auf dem MacBook
  meldet jedoch `Bitget API Fehler 400/40009 ... sign signature error`
- Naechster Bitget-Schritt: API-Key, Secret und Passphrase im Schluesselbund
  exakt gegen den Bitget-Key pruefen oder Key neu erzeugen
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
- Health-Warnung zur Bitget-Summary wurde am 2026-06-13 bereinigt

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
- Bitget: 6 Positionen, sichtbare inkludierte Positionssumme `3.807,42 EUR`
- Ginmon: 3 Depots, 26 Positionen, `9.380,62 EUR`
- Firestore Health: `OK`, 0 Fehler, 0 Warnungen
- Flatex-Dokumente: `OK`, 283 Dokumente, 401 Fakten, 0 unbekannte Dokumente
- `sourceAccounts` ist die zentrale Registry fuer erkannte Konten/Depots:
  - `flatex_default`
  - `traderepublic_Broker`
  - `ginmon_003397078001` / `Investment`
  - `ginmon_003429071008` / `Ginmon Top Zinsen`
  - `ginmon_003429072006` / `Risikoklasse 10 Global`
  - `intergold_default`
  - `bitget_spot`
  - `bitget_earn`
  - `capitalcom_130822818345538898`
  - `vbv_default`

## Wichtige lokale Pfade

- Projekt:
  - `/Users/niklaskofler/Documents/finanztool` auf Mac Studio und MacBook Pro
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

- [Geraetewechsel und Codex-Workflow](/Users/niklaskofler/Documents/finanztool/docs/device_workflow.md)
- [Geraetewechsel-Protokoll](/Users/niklaskofler/Documents/finanztool/docs/device_switch_log.md)
- [Import Masterplan](/Users/niklaskofler/Documents/finanztool/docs/import_masterplan.md)
- [Arbeitsstand](/Users/niklaskofler/Documents/finanztool/docs/arbeitsstand_2026-05-25.md)
- [Mac Studio Runbook](/Users/niklaskofler/Documents/finanztool/docs/export_import_runbook_mac_studio.md)
- [Mac Studio Handoff 2026-06-13](/Users/niklaskofler/Documents/finanztool/docs/mac_studio_handoff_2026-06-13.md)
- [README](/Users/niklaskofler/Documents/finanztool/README.md)
- [Intergold Kurzfassung](/Users/niklaskofler/Documents/finanztool/docs/intergold_preisimport_kurzfassung.md)
- [Trade Republic Strategie](/Users/niklaskofler/Documents/finanztool/docs/traderepublic_import_strategie.md)
- [Ginmon Konzept](/Users/niklaskofler/Documents/finanztool/docs/ginmon_import_konzept.md)

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
3. Bankkonten und Kreditkarten integrieren:
   Sparkasse/George, Amazon Visa, TF Bank Kreditkarte, spaeter Revolut
4. Trading 212 als eigene Quelle ergaenzen, sobald wieder relevant oder Daten
   vorliegen
5. Einheitliches Konto-/Depotmodell in Firestore ergaenzen, damit Broker,
   Bankkonten, Cash-Konten, Kreditkarten und Vorsorge sauber getrennt sind
6. Flatex nach einigen automatischen Exportlaeufen gegen Broker pruefen
7. Ginmon-Kostenlogik vertiefen: fuer die zwei kleinen Ginmon-Depots fehlen
   positionsgenaue Einstandswerte; Konto-Performance kommt aber aus der
   Ginmon-API
8. EquatePlus Parser nach erster Benachrichtigung ergaenzen
9. UI weiter ausbauen: Filter, Sortierung, Konto-/Depotansichten,
    Detailansichten, Charts

## Aktueller lokaler Entwicklungsstand

- Stand: 2026-06-13 11:55 CEST
- Aktive Entwicklungsregel: nicht pushen/deployen waehrend der lokalen
  UI-Entwicklung, sondern erst am Ende
- Lokaler Server: `localhost:5173` laeuft ueber LaunchAgent
  `com.niklas.finanztool.app` und serviert `app/dist`
- Lokaler Build wurde ausgefuehrt; Browser ggf. mit `Cmd + Shift + R` hart neu laden
- GUI-Entscheidung:
  - `Stichtag` ist in der Uebersicht nicht hilfreich und wurde aus den
    Quellkarten entfernt
  - `Import`, `Automatisierbar` und `Import bereit` sind fuer die GUI aktuell
    nicht hilfreich und wurden entfernt
  - Quellkarten zeigen stattdessen Agentstatus, `Aktualisiert` bzw. bei Fehler
    `Letzter Erfolg`, Statusmeldung und Positionsanzahl
  - Bei jeder Einzelposition soll sichtbar sein, wann sie zuletzt aktualisiert
    wurde; dafuer zeigt die Positionstabelle `sourcePositions.updatedAt`
- Bitget-Entscheidung:
  - Wenn der Bitget-API-Lauf fehlschlaegt, muss der Fehler in
    `agentStatus/bitget` und `systemHealth/current` sichtbar sein
  - Fehler `40009 sign signature error` wurde am 2026-06-13 lokal repariert
  - Ursache: `automation/.env` enthielt alte `BITGET_API_*`-Werte und hat damit
    die korrekten macOS-Schluesselbundwerte ueberschrieben
  - Fix: `BITGET_API_KEY`, `BITGET_API_SECRET` und `BITGET_API_PASSPHRASE`
    wurden aus `automation/.env` entfernt
  - Ein temporaeres Backup der alten `.env` wurde wegen Secret-Inhalt wieder
    geloescht
  - Bitget soll lokal aus dem macOS-Schluesselbund lesen, nicht aus `.env`
  - Nach dem Fix: `npm run check:bitget`, `npm run import:bitget:local` und
    `npm run sync:health` erfolgreich
  - Bei Bitget-Fehler soll die GUI nicht so wirken, als sei der Import
    erfolgreich gerade aktualisiert worden; daher `Letzter Erfolg`
- Ginmon-Agent-Fix am 2026-06-13:
  - Ursache: Der dokumentbasierte Ginmon-Abgleich hatte nur ein Depot sauber
    geschrieben, weil viele PDFs aus Google Drive mit `Unknown system error -11`
    nicht lesbar waren und bei archivierten Dateien die `customerId` fehlte
  - Fix: `sync-ginmon-current-api.mjs` erkennt `customerId` und Kontonummer
    jetzt aus allen vorhandenen Dateinamen und fragt die Ginmon-API fuer alle
    drei Depots ab
  - Automatischer Ginmon-LaunchAgent nutzt jetzt primaer den Live-Sync
    (`sync:ginmon-current` / API), nicht zuerst den alten Dokumentenstand
  - Verifizierter Stand: 3 Ginmon-Depots, 26 Live-Positionen,
    `9.380,62 EUR`, Bewertung per 2026-06-13
  - Korrektur: Der naechste Ginmon-Schritt ist nicht nur
    Einstandswert-Schaetzung, sondern zuerst die generische Dokumentfakten-
    Datenhaltung fuer alle Ginmon-Dokumente und alle drei Depots
  - Danach umgesetzt: `sourceDocuments` und `sourceDocumentFacts` wurden fuer
    369 Ginmon-Dateien befuellt; 663 Fakten wurden geschrieben
  - Danach umgesetzt: `sync-ginmon-current-api.mjs` schreibt
    `sourcePositions` fuer Ginmon aus Dokumentfakten plus aktuellem API-Wert.
    Die API wird nicht mehr fuer Stueckzahlen, Kosten oder Transaktionen
    verwendet.
  - Danach umgesetzt: Ginmon-Automation getrennt in stuendlichen headless
    API-Sync und taeglichen headless Dokumentimport um 02:00
- Trade-Republic-Agent-Fix am 2026-06-13:
  - Google-Drive-`mkdir`-Fehler `Unknown system error -11` wird beim Anlegen
    der Archivordner mit Retry abgefangen
  - Agent schreibt bei echten Fehlern `agentStatus/traderepublic_mail=FEHLER`
  - Verifiziert: 8 PDFs verarbeitet, 8 geparst, Private Equity hat in
    Firestore einen Einstandswert (`costValue 1.145,40 EUR`)
- VBV-Agent-Fix am 2026-06-13:
  - Login-Erkennung war zu breit und hat die Login-Seite wegen Marketingtext
    faelschlich als eingeloggten Zustand erkannt
  - Loginbutton-Erkennung wurde auf case-insensitiven DOM-Klick umgestellt
  - Agent schreibt bei echten Fehlern `agentStatus/vbv=FEHLER`
  - Verifiziert: `1.815,86 EUR` per 2026-05-31
- Kurs-Sync-Fix am 2026-06-13:
  - Boerse-Frankfurt-Sync darf Ginmon-Quote-Felder aktualisieren, aber nicht
    `currentValue`, `valuationMethod` oder `sourceSummaries/ginmon`
    ueberschreiben
  - Ginmon bleibt dadurch nach Kurs-Sync exakt auf dem API-Gesamtwert
    `9.380,62 EUR`
  - Wenn Ginmon fuer kleine Depots keine echte Stueckzahl liefert, berechnet
    der Kurs-Sync aus `currentValue / quotePriceEur` eine Naeherung und
    schreibt `quantityText` als `ca. ... Stk.` plus `quantityEstimated=true`
  - Verifiziert fuer `Risikoklasse 10 Global`: alle ETF-Positionen haben jetzt
    sichtbare geschaetzte Stueckzahlen; das Geldkonto bleibt `1 Konto`
- Depot-/Konto-Erkennungslogik am 2026-06-13:
  - `check-health-local.mjs` schreibt eine zentrale Firestore-Registry
    `sourceAccounts`
  - Neue Depots/Konten erzeugen nach bestehender Baseline eine Warnung
    `Neues Depot erkannt`
  - Bisher aktive, aber im aktuellen Lauf nicht mehr gefundene Depots/Konten
    werden als `MISSING` markiert und erzeugen `Depot nicht mehr gefunden`
  - Ginmon nutzt echte Kontonummern aus API/Dateinamen
  - Bitget wird in `spot` und `earn` getrennt
  - Trade Republic nutzt aktuell `Broker`; weitere Konten wie Private Markets
    muessen vom Agenten als eigenes `accountType`/`accountId` geliefert werden,
    sobald sie als eigenes Depot modelliert werden sollen
  - Quellen ohne Unterkonto-Information bekommen ein `default`-Depot; damit
    erkennt Health zumindest das komplette Verschwinden der Quelle, aber keine
    nicht extrahierten Unterdepots
- Agent-Audit am 2026-06-13:
  - `launchctl` nach Kickstart: Ginmon, Trade-Republic-Mail und VBV Exitcode 0
  - Firestore `agentStatus`: Bitget, Capital.com, Flatex, Ginmon, Intergold,
    Quotes, Trade-Republic-Mail und VBV alle `OK`
  - `systemHealth/current`: `OK`, `0` Fehler, `0` Warnungen
- Ginmon-Depotkarte am 2026-06-13:
  - Die App zeigt in der Ginmon-Quelle jetzt die Unterdepots aus
    `sourceSummaries/ginmon.accounts` an
  - Pro Unterdepot sichtbar: Name, Wert, Barwert, Gewinn/Verlust absolut und
    Prozent
  - Darstellung ist bewusst kompakt als Zeilenliste statt als grosse
    Zusatzkarten
  - Die Ginmon-Gesamtkarte zeigt zusaetzlich Einstand und G/V gesamt, sofern
    `costValue`, `performanceValue` und `performancePct` vorhanden sind
  - Verifizierter Firestore-Stand:
    - Investment: `9.146,61 EUR`, G/V `2.468,26 EUR`
    - Ginmon Top Zinsen: `104,23 EUR`, G/V `3,53 EUR`
    - Risikoklasse 10 Global: `129,79 EUR`, G/V `30,50 EUR`
    - Ginmon gesamt: `9.380,62 EUR`, Einstand `6.878,34 EUR`,
      G/V `2.502,28 EUR`
  - Der lokale Browser ohne Firestore-Login zeigt nur Seed-Daten; nach Login
    oder Reload im bereits angemeldeten Browser liest die App die Unterdepots
    aus Firestore
- Ginmon-Datenhaltungsaudit am 2026-06-13 14:34 CEST:
  - Aktuell in Firestore:
    - `sourceDocuments`: 369 Ginmon-Dokumente
    - `sourceDocumentFacts`: 663 strukturierte Ginmon-Fakten
    - `sourcePositions`: 26 aktuelle Ginmon-App-Positionen
    - `costEvents`: 3 Ginmon-Kostenereignisse
  - Dokumente nach Parserstatus:
    - `PARSED`: 351
    - `UNKNOWN`: 18
  - Fakten nach Typ:
    - `position_snapshot`: 250
    - `trade`: 95
    - `invoice`: 88
    - `account_statement`: 77
    - `cash_ledger_entry`: 62
    - `earning`: 34
    - `quarterly_report`: 30
    - `account_snapshot`: 27
  - Schlussfolgerung:
    - Alle aktuell per Ginmon-Portal sichtbaren Dokumente sind lokal vorhanden
      und in Firestore registriert
    - Der strukturierte Dokumentfaktenlayer ist produktiv befuellt
    - Noch nicht garantiert ist "alle Ginmon-Daten absolut vollstaendig",
      weil 18 Dokumente noch `UNKNOWN` sind und der vollstaendige
      Ginmon-API-Rohpayload noch nicht als eigener unveraenderter Snapshot in
      Firestore persistiert wird
    - Fuer revisionssichere Vollstaendigkeit fehlt deshalb noch eine Collection
      wie `sourceApiSnapshots/ginmon_*` bzw. ein Raw-Payload-Feld je API-Lauf
- Ginmon-Fachparser-Erweiterung am 2026-06-13 14:58 CEST:
  - `CORPORATE_ACTION` wird jetzt als `corporate_action` klassifiziert und
    geparst
  - `ANNUAL_STATEMENT`/Jahresdepotauszug wird jetzt als `annual_statement`
    klassifiziert und geparst
  - Firestore wurde mit `node automation/src/reconcile-ginmon-local.mjs
    --write-documents-only --pdf-timeout-ms=30000` aktualisiert
  - Neuer verifizierter Firestore-Stand:
    - `sourceDocuments`: 369 Ginmon-Dokumente
    - `PARSED`: 363
    - `UNKNOWN`: 6
    - `sourceDocumentFacts`: 698 Ginmon-Fakten
  - Neue Faktentypen:
    - `corporate_action`: 9
    - `annual_statement`: 3
    - `annual_position_snapshot`: 23
  - Beispiel verifiziert:
    - Corporate Action `IE00B95PGT31`, Bestand `7,0319`, Typ `fee_change`,
      Wirksamkeit `2025-10-07`
    - Annual Statement Depot `3397078001`, Stichtag `2025-12-31`,
      `13/13` Positionen geparst
  - Verbleibende 6 `UNKNOWN` sind nicht performance-/positionsrelevant:
    Welcome Letter, VL-Formular, Upvest-Datenschutz, Einlagensicherung
  - Health nach Update: `OK`, `0` Fehler, `0` Warnungen
- Ginmon-Unknown-Warnung am 2026-06-13 15:00 CEST:
  - `automation/src/check-health-local.mjs` laedt jetzt auch
    `sourceDocuments`
  - Falls kuenftig ein Ginmon-Dokument `documentType=unknown`,
    `parseStatus=UNKNOWN` oder `parseStatus=UNPARSED` hat und nicht zu den 6
    heute bekannten nicht-fachlichen Info-/Vertragsdokumenten gehoert, erzeugt
    `systemHealth/current` eine Warnung:
    `Ginmon-Dokument nicht klassifiziert`
  - Die Warnung enthaelt bis zu 10 betroffene Dokumente mit `id`, `fileName`,
    `documentType`, `parseStatus` und `customerId`
  - Verifiziert: aktuelle 6 bekannte Info-Dokumente sind erlaubt, Health bleibt
    `OK`, `0` Fehler, `0` Warnungen
- Flatex-Dokumentfakten am 2026-06-13 15:41 CEST:
  - `automation/src/flatex-document-parser.mjs` klassifiziert und parst die
    Flatex-PDFs aus Konto-/Depotbelegen und Postfach
  - `automation/src/reconcile-flatex-documents-local.mjs` schreibt die
    generischen Fakten nach Firestore
  - Sync ausgefuehrt mit:
    `npm run sync:flatex-documents -- --pdf-timeout-ms=30000`
  - Verifizierter Firestore-Stand:
    - `sourceDocuments`: 283 Flatex-Dokumente
    - `PARSED`: 283
    - `UNKNOWN`: 0
    - `sourceDocumentFacts`: 401 Flatex-Fakten
    - `agentStatus/flatex_documents`: `OK`
  - Typen/Fakten umfassen Wertpapierabrechnungen, Fondskaeufe,
    Dividenden/Ausschuettungen, Thesaurierungen, Kontoauszuege,
    Depotauszuege, Steuerbescheinigungen, Kapitalmassnahmen, Order-/Saldo-/
    Info-/SEPA-/CFD-/Kosten-Dokumente und ein fehlabgelegtes externes PDF
  - Neue unbekannte Flatex-Dokumente erzeugen ab jetzt eine Health-Warnung
    `Flatex-Dokument nicht klassifiziert`
  - `npm run sync:health` danach: `OK`, `0` Fehler, `0` Warnungen
- Flatex-Kursquelle am 2026-06-13:
  - Aktueller Kurs-Sync nutzt weiterhin den lokalen Boerse-Frankfurt/
    Deutsche-Boerse-Live-Provider in
    `automation/src/quote-provider-boerse-frankfurt.mjs`
  - Dry-Run mit 5 Instrumenten erfolgreich:
    `npm run reconcile:quotes -- --max-instruments=5 --delay-ms=50`
  - Ergebnis: 5/5 Kurse OK, keine Mapping-Warnung im Testlauf
  - Die Quelle ist technisch ein oeffentlicher Website-Endpunkt von
    `api.live.deutsche-boerse.com`; offizieller/API-Key-Fallback bleibt
    fachlich zu pruefen, falls die Website-API sich aendert
- Trade-Republic-Baseline am 2026-06-13 16:01 CEST:
  - Neue Basisdateien aus `/Users/niklaskofler/Downloads` verarbeitet:
    - `Account statement.pdf`
    - `Tax Report 2025.pdf`
    - `Transaction export.csv`
  - Dateien wurden nach
    `01_Originale/TradeRepublic/Baseline/2026-06-13/` archiviert
  - Firestore wurde als neuer Status-Quo neu aufgebaut:
    - alte `sourcePositions`, `transactions`, `ledgerEntries`,
      `costEvents` fuer Trade Republic geloescht und aus der Baseline neu
      geschrieben
    - alte Trade-Republic-`imports` und `rawDocuments` als `OBSOLETE`
      markiert
    - `agentStatus/traderepublic_mail.reconciliationCutoffDate` auf
      `2026-06-13` gesetzt
  - Neue Dokument-/Faktenbasis:
    - `sourceDocuments`: 3
    - `sourceDocumentFacts`: 198
    - Faktentypen: 106 `trade`, 51 `cash`, 19 `private_market_cash`,
      9 `interest`, 3 `bonus`, 2 `dividend`, 1 `corporate_action`,
      5 `position_snapshot`, 1 `cash_account_statement`, 1 `tax_report`
  - Positionsstand nach Kurs-Sync:
    - Trade Republic netto: `2.523,87 EUR`
    - Depotwert: `2.374,38 EUR`
    - Cash: `149,49 EUR`
    - Positionen: 5 Wertpapiere + Cash
  - Private Equity bleibt `MAPPING_REQUIRED`, wird aber bewusst ueber
    Dokument/Baseline bewertet und erzeugt keine Health-Warnung
  - Netflix-Split vom 2025-11-17 wird eingerechnet; Stueckzahl jetzt `0,094`
  - Neue unbekannte Trade-Republic-Dokumente erzeugen ab jetzt eine
    Health-Warnung `Trade-Republic-Dokument nicht klassifiziert`
  - `npm run sync:health` danach: `OK`, `0` Fehler, `0` Warnungen
- Trade-Republic-PDF-Textpfad am 2026-06-13:
  - `automation/src/pdf-text.mjs` wurde erweitert:
    - bevorzugt `pdftotext -layout`
    - bei fehlendem/fehlerhaftem `pdftotext` Fallback auf `pdfjs-dist`
  - Test mit `Account statement.pdf` und `Tax Report 2025.pdf` erfolgreich:
    - Account Statement: 30.059 Zeichen extrahiert
    - Tax Report 2025: 13.284 Zeichen extrahiert
  - Fuer verschluesselte Trade-Republic-Duplicate-PDFs bleibt `qpdf`
    erforderlich; fuer den Zielrechner installieren/pruefen:
    `command -v qpdf`, `command -v pdftotext`
- GUI-Privacy-Schalter am 2026-06-13:
  - Oben rechts gibt es jetzt einen Schieberegler `Sichtbar`/`Privat`
  - Standardzustand beim Laden der App ist `Privat`
  - Im Privatmodus werden sensible Werte, Einstandswerte, Gewinne/Verluste
    und absolute Tagesaenderungen in der GUI durch Eurozeichen `€€€€`
    maskiert
  - Prozentwerte bleiben auch im Privatmodus sichtbar, weil sie fuer die
    Analyse nuetzlich sind; positive Werte bleiben gruen, negative rot
  - `Erfasster Wert` zeigt zusaetzlich:
    - Gesamtgewinn/-verlust absolut
    - Gesamtgewinn/-verlust in Prozent
    - Tagesaenderung absolut
    - Tagesaenderung in Prozent
  - Die Positionstabelle hat zusaetzlich Spalten `Heute` und `Heute %`
  - Tagesaenderung wird nur angezeigt, wenn entsprechende
    `sourcePositions`-Felder vorhanden sind; sonst bleibt sie `—`
  - Lokaler Build nach Aenderung erfolgreich:
    `npm --prefix app run build`
- GUI-Depotlayout am 2026-06-13:
  - Die separate globale Positionstabelle wurde entfernt
  - Positionen liegen jetzt direkt unter den jeweiligen Depot-/Quellenkarten
    und koennen dort ausgeklappt werden
  - Ginmon ist zweistufig: Ginmon-Karte -> Ginmon-Unterdepot -> Positionen
  - Die gesamte Ginmon-Unterdepotliste ist zusaetzlich einklappbar und
    standardmaessig geschlossen
  - In den Depotkarten heisst der Hauptwert immer `Depotwert`
  - Das zuvor separate zweite Feld `Depotwert` wurde entfernt
  - `Kontostand` heisst in den Karten jetzt `Cash`
  - Alle Depotkarten nutzen innen dieselbe Hauptmetrik-Reihenfolge:
    erste Zeile `Depotwert`, `Cash`, `Einstand`, `Aktualisiert`;
    zweite Zeile `G/V`, `Heute`, `Positionen`
  - Quell-spezifische Zusatzwerte stehen darunter in einer separaten
    Zusatzmetrik-Zeile, damit das Hauptlayout identisch bleibt
  - G/V-Werte werden immer mit Vorzeichen angezeigt (`+`, `-`, `±`)
  - Nur G/V-Werte bekommen die positive/negative Farblogik gruen/rot; normale
    Bestandswerte bleiben neutral
  - CSS-Regel: Tabellen- und Karten-Basisfarben duerfen G/V-Farben nicht
    ueberschreiben; `performance-cell` und `performance-value` haben dafuer
    spezifische positive/negative Regeln
  - Mengen werden in der GUI auf maximal 5 Nachkommastellen gerundet; die
    Rohwerte in Firestore bleiben unveraendert
  - Die Depotkarten zeigen zusaetzlich die Veraenderung zum Vortag (`Heute`),
    wenn `sourcePositions` Tagesaenderungen liefern
- Preis-Historie am 2026-06-13:
  - `automation/src/sync-quotes-local.mjs` schreibt beim Kurs-Sync zusaetzlich
    eine generische Collection `priceHistory`
  - Dokument-ID: `instrumentId_YYYY-MM-DD`, dadurch pro Instrument und Tag
    idempotent und nicht doppelt
  - Gespeichert werden u.a. `instrumentId`, `isin`, `price`, `currency`,
    `priceEur`, `provider`, `providerSymbol`, `asOf`, `historyDate`,
    `positionIds` und `sources`
  - Der LaunchAgent `com.niklas.finanztool.quote-sync` ist im Template auf
    taeglich `22:00` umgestellt; manuelle Kurs-Aktualisierung bleibt ueber die
    App/Command-Runner moeglich
  - Lokal neu installiert und per `plutil` verifiziert:
    `StartCalendarInterval` mit `Hour=22`, `Minute=0`
- Manueller Kurs-Sync-Fix am 2026-06-13:
  - Ursache fuer die falsche GUI-Fehlermeldung:
    `run-quote-sync-local.mjs` hat `check-health-local.mjs` ausgefuehrt,
    waehrend `agentStatus/quotes` noch `RUNNING` war; Health hat daraus
    faelschlich `Agent quotes: RUNNING` als Fehler erzeugt
  - Fix: Quote-Agent setzt nach erfolgreichem Kurslauf zuerst
    `agentStatus/quotes=OK` und ruft danach Health auf
  - App-Button `Kurse aktualisieren` beobachtet jetzt
    `automationCommands/sync_quotes_manual` und unterscheidet `REQUESTED`,
    `RUNNING`, `DONE` und `ERROR`
  - Nach `DONE` laedt die App `sourceSummaries`, `agentStatus`,
    `sourcePositions` und `systemHealth` neu und setzt den Button zurueck
  - Verifiziert: `npm --prefix automation run sync:quotes:local` schreibt
    19/20 Kurse, `LU3176111881` bleibt erwartungsgemaess
    `MAPPING_REQUIRED`, Health danach `OK`, `0` Fehler, `0` Warnungen
- Noch nicht gepusht/deployed seit dieser lokalen UI-Aenderung:
  - `app/src/App.css`
  - `app/src/App.tsx`
  - `app/src/domain/types.ts`
  - `app/src/firebase/sourceSummaries.ts`
  - `automation/package.json`
  - `automation/launchd/com.niklas.finanztool.ginmon-sync.plist.template`
  - `automation/src/check-health-local.mjs`
  - `automation/src/pdf-text.mjs`
  - `automation/src/flatex-document-parser.mjs`
  - `automation/src/reconcile-flatex-documents-local.mjs`
  - `automation/src/reconcile-traderepublic-baseline-local.mjs`
  - `automation/src/ginmon-browser.mjs`
  - `automation/launchd/com.niklas.finanztool.ginmon-documents.plist.template`
  - `automation/src/download-ginmon-local.mjs`
  - `automation/src/ginmon-parser.mjs`
  - `automation/src/reconcile-ginmon-local.mjs`
  - `automation/src/sync-ginmon-current-api.mjs`
  - `automation/src/sync-quotes-local.mjs`
  - `automation/src/run-quote-sync-local.mjs`
  - `automation/src/install-quote-sync-agent.sh`
  - `automation/src/sync-vbv-local.mjs`
  - `automation/src/trade-republic-mail-agent.mjs`
  - `automation/src/vbv-browser.mjs`
  - `docs/working_memory.md`
  - `docs/flatex_export_pruefung_2026-05-24.md`
  - `docs/kursdaten_api_plan.md`
  - `docs/traderepublic_import_strategie.md`
  - `docs/ginmon_import_konzept.md`

## Naechster empfohlener Schritt

Aktuelle Version auf GitHub pullen, diese Datei lesen, Secrets importieren und
alle Agents auf dem Mac Studio installieren. Danach App-Warnkarte,
`agentStatus/*`, `systemHealth/current` und `sourceAccounts/*` kontrollieren.
Danach fachlich zuerst die App-Ansicht fuer Ginmon gegen die neuen
Dokumentfakten + API-Kurse kontrollieren. Erst danach Bankkonten/Kreditkarten,
Trading 212 und weitere Steuer-/Kostenlogiken vertiefen.

## Bedienkuerzel

- Die Zahlencodes gelten auf Mac Studio und MacBook Pro gleich, wenn Niklas
  sie allein schreibt.
- `1111`: Projekt auf der aktuellen Maschine vom gemeinsamen GitHub-Stand
  aktualisieren/herunterladen.
  Ablauf:
  1. Zuerst `docs/device_workflow.md`, `docs/device_switch_log.md`,
     `docs/working_memory.md` und `README.md` lesen.
  2. Dann `git status` pruefen.
  3. Falls lokale Aenderungen vorhanden sind, nicht ueberschreiben; zuerst
     `2222` ausfuehren oder den Nutzer kurz auf den Konflikt hinweisen.
  4. `git fetch origin` und `git pull --ff-only origin main`.
  5. Dependencies aktualisieren:
     `npm --prefix app install` und `npm --prefix automation install`.
  6. `npm --prefix app run build` ausfuehren.
  7. Auf dem Mac Studio zusaetzlich Automation/Agents beachten, weil dort die
     produktiven Agents laufen: bei geaenderten LaunchAgent-Templates oder
     Agent-Scripts `npm --prefix automation run install:all-agents` bzw. die
     betroffenen Agenten neu installieren/starten und danach
     `npm --prefix automation run sync:health` pruefen.
  8. Auf dem MacBook Pro keine Studio-Agents starten; dort nur Code/App bauen
     und weiterentwickeln.
  9. Danach im Chat kurz zusammenfassen: aktives Geraet, Commit/Stand, letzter
     Stand vom alten Geraet, naechste Schritte und eventuelle
     Wechselprobleme.
- `2222`: Projekt lokal speichern, ohne GitHub-Push und ohne Firebase-Deploy.
  Ablauf:
  1. Relevante Checks ausfuehren, mindestens `npm --prefix app run build`.
  2. `git status` und `git diff --stat` pruefen.
  3. Sinnvolle Aenderungen committen.
  4. Nicht pushen und nicht deployen.
- Wenn Niklas allein `3333` schreibt, bedeutet das: aktuellen Stand bauen,
  lokal speichern/committen, auf GitHub pushen und nach Firebase deployen.
  Danach ist das Projekt an das jeweils andere Geraet uebergeben. Beispiel:
  auf Mac Studio entwickeln -> `3333` -> auf MacBook Pro `1111`; oder
  auf MacBook Pro entwickeln -> `3333` -> auf Mac Studio `1111`, damit die
  dort laufenden Agents den neuen Code erhalten.
  Vor dem Commit muss Codex `docs/working_memory.md` und bei Geraetewechseln
  `docs/device_switch_log.md` aktualisieren.

## Letzte Aktualisierung

- Datum: 2026-06-20 CEST
- Quelle: Lokale Codex-Session, Agent-Audit und UI-Arbeit auf `localhost`
- Status: Geraetewechsel-Regeln und Zahlencodes liegen zentral in
  `docs/device_workflow.md`; Standardpfad auf Mac Studio und MacBook Pro ist
  `/Users/niklaskofler/Documents/finanztool`; Nicht pushen/deployen waehrend
  Entwicklung; Agenten lokal geprueft
  und repariert; Ginmon-Live-Stand hat 3 Depots/26 Positionen; Health ist
  `OK`; `sourceAccounts` erkennt neue oder verschwundene Depots/Konten;
  Ginmon-Datenvertrag ergaenzt; alle aktuell per Portal-API sichtbaren
  Ginmon-Dokumente sind lokal vorhanden; `sourceDocuments`/
  `sourceDocumentFacts` sind fuer Ginmon produktiv befuellt; Ginmon-API wird
  nur noch fuer aktuelle Werte/Kurse genutzt; Ginmon-Dokumentimport laeuft
  taeglich 02:00 und Ginmon-API-Sync stuendlich, beide headless; Ginmon-Karte
  zeigt Unterdepots kompakt mit Wert, Barwert, G/V absolut und Prozent; die
  Ginmon-Dokumentbasis ist fachlich weitgehend strukturiert; nur noch 6
  nicht performance-/positionsrelevante Info-/Vertragsdokumente sind UNKNOWN;
  neue unbekannte Ginmon-Dokumente erzeugen ab jetzt eine Health-Warnung;
  Flatex-Postfach/PDFs sind mit 283/283 Dokumenten und 401 Fakten in
  Firestore strukturiert; neue unbekannte Flatex-Dokumente erzeugen ab jetzt
  eine Health-Warnung; Boerse-Frankfurt/Deutsche-Boerse-Live-Kurse wurden per
  Dry-Run fuer 5 Flatex/Trade-Republic-Instrumente erfolgreich getestet;
  Trade Republic wurde mit frischem Export vom 2026-06-13 als neuer
  Status-Quo neu aufgebaut; alte TR-Mail-/Raw-Imports sind obsolet, der
  Mail-Agent verarbeitet nur noch neue Abrechnungen nach 2026-06-13; PDF-Text
  nutzt kuenftig bevorzugt `pdftotext` mit `pdfjs`-Fallback, fuer
  verschluesselte Duplicate-PDFs ist `qpdf` weiterhin Pflicht; fuer
  revisionssichere API-Vollstaendigkeit fehlen weiterhin API-Raw-Snapshots;
  der GUI-Privatmodus maskiert absolute Geldwerte mit `€€€€`, laesst
  Prozentwerte sichtbar und faerbt Plus/Minus weiterhin gruen/rot; Positionen
  liegen jetzt aufklappbar unter den Depotkarten, bei Ginmon unter den
  jeweiligen Unterdepots; die Ginmon-Unterdepotliste ist selbst einklappbar;
  Karten-Hauptwert heisst jetzt `Depotwert`, das separate Depotwert-Feld ist
  entfernt und `Kontostand` heisst `Cash`;
  `priceHistory` speichert taegliche Kurse pro Instrument, der geplante
  Kurs-Historienlauf ist `22:00`; manueller Kurs-Sync setzt `quotes=OK` vor
  Health und der App-Button verfolgt den Command-Status bis `DONE`/`ERROR`;
  Mengen werden in der GUI auf maximal 5 Nachkommastellen gerundet; G/V-Text
  wird in Karten und Tabellen verlaesslich gruen/rot eingefaerbt;
  Privatsphaere-Modus ist beim Laden der App standardmaessig aus, Werte sind
  also standardmaessig sichtbar
  und alle Depotkarten haben dieselbe innere Hauptmetrik-Reihenfolge mit
  `G/V` unter `Depotwert`, `Heute` daneben und `Aktualisiert` oben rechts;
  Ginmon-Unterdepots bleiben beim Laden standardmaessig eingeklappt; die
  App ist fuer iPhone-15-Breite responsiv verdichtet: Summary-Karten laufen
  zweispaltig, Depotkarten blenden lange Beschreibungstexte aus, nutzen
  drei kompakte Metrikspalten ueber die volle Kartenbreite, sodass
  `Depotwert` links unter dem Quell-Icon beginnt, und behalten die Reihenfolge
  `Depotwert`/`Cash`/`Aktualisiert` oben sowie `G/V`/`Heute`/`Einstand`
  darunter; in der mobilen Kopfzeile ist der Firestore-Status fest in Zeile 2
  und `Kurse aktualisieren` plus Privat-Schalter sind fest nebeneinander in
  Zeile 3 positioniert; die Positionstabelle priorisiert jetzt
  Analysewerte in der Spaltenreihenfolge `Position`, `Wert`, `G/V`, `Perf.`,
  `Heute`, `Heute %`, `Menge`, `Kurs`, `Einstand`, `Kategorie`,
  `Aktualisiert`; die separate Kartenmetrik `Positionen` ist entfernt,
  weil die Anzahl bereits im aufklappbaren `Positionen anzeigen`-Element
  steht; `Heute` und `Heute %` wurden repariert: der Quote-Sync schreibt
  fuer Flatex/Trade-Republic-Positionen jetzt `previousCloseValue`,
  `dayChangeValue` und `dayChangePct` aus dem letzten gespeicherten
  `priceHistory`-Preis vor dem aktuellen Tag; die Positions-Tabelle zeigt
  Tagesaenderung und Tagesprozent mit Vorzeichen; der 22:00-Lauf schreibt
  zusaetzlich eine generische Positions-Historie fuer alle `sourcePositions`
  mit `currentValue`, also auch Bitget/Krypto, Ginmon, Intergold usw.; Bitget
  Summary-G/V wird aus EUR-Kosten und aus USDT-Kostenbasis via aktuellem
  USDT/EUR-Faktor aggregiert; am 2026-06-14 wurden 6/6 Bitget-Positionen in
  `priceHistory` geschrieben;
  verifiziert mit 393x852 Viewport ohne horizontalen Ueberlauf; Firebase
  Deploy fuer Hosting, Firestore Rules/Indexes und Storage Rules erfolgreich
