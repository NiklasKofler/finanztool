# Working Memory

Dieses Dokument ist das gemeinsame Projektgedaechtnis fuer Codex auf MacBook Pro und Mac Studio.
Es ersetzt nicht den Chat, aber es bewahrt die wichtigen Entscheidungen, den letzten Stand und die naechsten Schritte.

## Nutzung

Vor jeder neuen Session:

1. Wenn das Projekt vom anderen Geraet uebernommen werden soll: `ftd`
2. `docs/device_workflow.md` lesen
3. `docs/device_switch_log.md` lesen
4. dieses Dokument lesen
5. dann erst mit Codex weiterarbeiten

Nach `ftd` muss Codex im Chat kurz melden:

- auf welchem Geraet gearbeitet wird
- welcher Stand/Commit aktiv ist
- wo am alten Geraet aufgehoert wurde
- welche naechsten Schritte geplant sind
- ob Wechselprobleme, fehlende Secrets oder lokale Abweichungen bestehen

Nach jeder wichtigen Session:

1. dieses Dokument aktualisieren
2. bei Geraetewechseln oder Problemen `docs/device_switch_log.md`
   aktualisieren
3. lokal sichern mit `fts` oder veroeffentlichen/uebergeben mit `ftp`

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
- Die bevorzugten Terminal-Kurzbefehle sind:
  - `ftd` = Download/Update
  - `fts` = Save/lokaler Commit
  - `ftp` = Publish/Push/Firebase Deploy/Handoff
  - `ftu` = alter Alias fuer `ftp`, bleibt kompatibel
- Installation der Kurzbefehle pro Geraet:
  `npm run ft:install`
- `ftd` wird dabei als Shell-Funktion installiert. Nach erfolgreichem Download
  muss das Terminal in `/Users/niklaskofler/Documents/finanztool` stehen.
  Wird nur `bin/ftd` als Script ausgefuehrt, kann es das Terminal-Verzeichnis
  nach dem Ende technisch nicht dauerhaft aendern.
- Der Projektpfad muss exakt `/Users/niklaskofler/Documents/finanztool` sein.
  Alte Checkouts wie `/Users/niklaskofler/Documents/Finanztool` duerfen fuer
  die Kurzbefehle nicht benutzt werden.
- Alte numerische Befehle sind deaktiviert.
- Sicherheitsregeln:
  - `ftd` ueberschreibt keine lokalen Aenderungen.
  - Bei auseinander gelaufenen lokalen/remote Commits erstellt `ftd` einen
    Backup-Branch und rebasiert lokale Commits auf `origin/main`.
  - `ftd --force` ist der bewusste Notfall-Download mit Backup-Branch und
    Datei-Backup.
  - `ftp`/`ftu` prueft vor dem Commit, ob GitHub neuer ist, und bricht dann ab.
  - `ftp`/`ftu` deployed Firebase erst nach verifiziertem Push und nur Hosting.

## Aktueller Trade-Republic-Fahrplan ab 2026-06-23

Zielbild:

- Der Trade-Republic-Mail-Agent soll fachlich abgeloest werden.
- Zielquelle ist das authentifizierte Trade-Republic-Webportal.
- Prioritaet der Datenquellen:
  1. Offizielle PDFs/Downloads aus dem Webportal, wenn vorhanden.
  2. DOM-/Accessibility-Scraping nur fuer aktuelle Portalwerte oder wenn ein
     offizieller Download nicht angeboten wird.
  3. Selbst gemailte App-Exporte bleiben nur Rueckfall-/Kontrollkanal, bis der
     Portal-Agent alle notwendigen Informationen nachweislich vollstaendig
     liefert.

Arbeitsreihenfolge:

1. Login stabilisieren:
   - Web-Login mit lokal gespeicherter Telefonnummer/PIN.
   - Nutzer bestaetigt Login in der Trade-Republic-App.
   - Die Trade-Republic-Karte muss waehrenddessen sichtbar zeigen, dass auf
     die App-Bestaetigung gewartet wird.
2. Portal inventarisieren:
   - Wo sind PDF-/Dokumentdownloads erreichbar?
   - Welche Dokumenttypen gibt es je Transaktion/Activity/Portfolio?
   - Welche Links sind echte Downloads und welche sind nur temporaere
     Presigned-URLs?
3. PDFs herunterladen, hashen, archivieren und parsen:
   - Abrechnungen/Sparplanausfuehrungen
   - Zins-/Cash-/Einzahlungsbelege, falls vorhanden
   - Private-Markets-Dokumente, falls vorhanden
   - Tax/Annual/Legal nur soweit fachlich relevant
4. Datenlueckenanalyse:
   - Was liefert das Portal vollstaendig?
   - Was liefert nur das Net-Worth-/Transaction-/Account-Statement-Exportpaket?
   - Welche Kosten, Steuern, Zinsen, Einstandswerte oder Historienfelder fehlen
     noch?

Umsetzung 2026-06-23:

- Der Trade-Republic-Refresh-Button zeigt waehrend eines laufenden
  Portal-Refreshs jetzt Agentphasen aus `agentStatus/traderepublic_portal`.
- Wenn die Agentmeldung auf App-Bestaetigung/Freigabe wartet, zeigt der Button
  `App bestätigen`.

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
- Firestore-Datenvertrag: `docs/firestore_data_contract.md`
  - alle Quellen schreiben in dieselben fachlichen Collections
  - aktuelle Anzeige: `sourcePositions` und `sourceSummaries`
  - Historie/Analyse: `transactions`, `ledgerEntries`, `costEvents`,
    `incomeEvents`, `sourceDocumentFacts`, `priceHistory`
  - neue/geschlossene Depots, Konten und Positionen muessen automatisch erkannt
    und nachvollziehbar markiert werden
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
- Letzter Deploy: 2026-06-20 18:43 CEST, Hosting, Firestore Rules/Indexes
  und Storage Rules
- Firestore Database ist erstellt
- Firebase Hosting ist konfiguriert
- Die App liest Live-Daten aus Firestore
- App-Login ist auf `niklas.kofler@gmail.com` begrenzt
- App darf nur `automationCommands/sync_quotes_manual` schreiben; der
  Command-Runner interpretiert diesen historisch so benannten Command inzwischen
  als Full-Refresh
- Finanzdaten werden lokal durch Agents geschrieben, nicht direkt aus der App
- Mac Studio ist der Zielort fuer Dauerbetrieb

## Aktueller Geraete-Handoff

- Stand: 2026-06-26 19:53 CEST
- Aktion: `ftp` vom Mac Studio von Niklas Richtung MacBook Pro
- Ausgangscommit: `492c942`
- Handoff-Commit: wird in diesem `ftp`-Lauf erstellt
- Firebase Deploy: wird in diesem `ftp`-Lauf ausgefuehrt
- Naechster Schritt auf MacBook Pro: `ftd` ausfuehren
- Bekannte Wechselpunkte:
  - Secrets und produktive LaunchAgents werden nicht per Git uebertragen
  - Mac Studio bleibt produktiver Agent-Knoten
  - Kurzbefehle sind `ftd`, `fts`, `ftp`; `ftu` ist alter Alias

## Fachlich bereits umgesetzt

### Flatex

- Browser-Export-Agent ist gebaut
- Zugangsdaten liegen im macOS-Schluesselbund
- Session-TAN bleibt deaktiviert
- Exportzeitraum: `zwei Wochen`
- Zeitplan: taeglich 08:00, 10:00, 13:00, 17:00, 22:00
- Bestand und Cash werden aus Konto-/Depotumsaetzen berechnet
- Seit 2026-06-21 liest der Flatex-Agent nach dem Umsatzexport zusaetzlich den
  aktuellen Broker-Snapshot aus `Mein flatex Depot`
  - Dashboardwerte: Depotwert, Kontosaldo, Gesamtvermoegen, verfuegbares
    Guthaben, Kreditlinie
  - Positionswerte: ISIN, WKN, Handelsplatz, Stueck, Kurszeit, Kurs,
    Gesamtwert, Einstand, Gesamtentwicklung, Tagesentwicklung
  - Firestore:
    - `sourcePositions`: aktuelle Flatex-Positionen aus Broker-Snapshot
    - `sourceSummaries/flatex`: Broker-Depotwert als primaerer Flatex-Wert
    - `rawDocuments/flatex_broker_snapshot_latest`
    - `imports/flatex_broker_snapshot_latest`
- Boerse-Frankfurt-Kurse bleiben fuer Flatex Vergleichs-/Historienquelle und
  duerfen den Flatex-Brokerwert nicht mehr still ueberschreiben
- Verifizierter Stand 2026-06-21 00:43 CEST:
  - Flatex Broker-Depotwert: `22.435,45 EUR`
  - Flatex Cash: `-5.843,79 EUR`
  - Flatex Gesamtvermoegen: `16.591,66 EUR`
  - Boerse-Frankfurt-Vergleichswert: `22.578,42 EUR`
  - Differenz Broker vs. externe Kursbewertung: `142,97 EUR`
  - Health: `OK`, 0 Fehler, 0 Warnungen
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

- Mail-Agent fuer passwortgeschuetzte `Securities Settlement` PDFs ist gebaut,
  ruht aber seit 2026-06-22 als fachlicher Kanal
- PDF-Passwort liegt lokal im macOS-Schluesselbund
- Bei Transaktionen kommt am Tagesende automatisch eine Trade-Republic-Mail;
  diese `Duplicates`-Mails werden aktuell nicht mehr automatisch auf den
  Trade-Republic-Bestand angewendet
- Aktiver Kanal ist seit 2026-06-22 der Manual-Export-Agent fuer selbst
  gemailte No-Subject-Exporte
- Wichtige Baseline-Entscheidung 2026-06-13:
  - Die am 2026-06-13 frisch exportierten Dateien sind ab jetzt der neue
    Trade-Republic-Status-Quo
  - alte Mail-Duplikate und fruehere Trade-Republic-Imports sind fachlich
    obsolet und wurden in Firestore entsprechend ersetzt/markiert
  - ab 2026-06-22 veraendert Trade Republic den Stand primaer ueber die drei
    selbst gemailten Exporte `Net Worth.pdf`, `Transaction export.csv` und
    `Account statement.pdf`
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
- Daten-Audit liegt in [intergold_data_audit_2026-06-22.md](/Users/niklaskofler/Documents/finanztool/docs/intergold_data_audit_2026-06-22.md)
- LaunchAgent: `com.niklas.finanztool.intergold-sync`, taeglich 08:20
- Verifizierter Stand 2026-06-22 00:35 CEST:
  - `sourcePositions`: 13 Metallpositionen
  - aktueller Lauf: 19 gueltige Preisbloecke aus der Intergold-Webseite
  - `sourceSummaries/intergold.currentValue`: `30.540,92 EUR`
  - `sourceSummaries/intergold.saleValue`: `35.559,33 EUR`
  - `sourceSummaries/intergold.costValue`: `23.040,51 EUR`
  - `sourceSummaries/intergold.performanceValue`: `+7.500,41 EUR`
  - `sourceSummaries/intergold.performancePct`: `+32,55 %`
  - Dokumentstand: `2026-03-23`
  - Preisstand Website: `2026-06-16`
  - letzte bekannte Preisaenderung: `2026-06-21T19:07:05.114Z`
  - Agent zuletzt: `2026-06-21T22:34:03.750Z`
  - `priceChanged=false` beim letzten Lauf
- Intergold schreibt jetzt Transparenzfelder:
  - `sourceDataUpdatedAt`, `sourceDataProvider=intergold_confirmation_pdf`
  - `documentDataUpdatedAt`, `documentDataProvider=intergold_confirmation_pdf`
  - `quoteDataUpdatedAt`, `quoteDataProvider=intergold_website`
  - `quoteDataChangedAt`
  - `lastAgentRunAt`, `lastAgentSuccessAt`
- Preis-History ist idempotent nach
  `Metall + Preisstand + Einheit + Verkaufspreis + Ankaufspreis`
- Offen:
  - Verkaufsbestaetigungen/Rechnungen als eigener Bestandsreduktions- und
    Transaktionsstrom
  - Intergold-PDFs noch nicht im gleichen `sourceDocuments`/`sourceDocumentFacts`
    Detailgrad wie VBV

### EquatePlus

- Ordner ist im Drive-Scan enthalten
- PDF-Dateien werden importiert und archiviert
- Fachlicher Parser ist noch offen
- E-Mail-Benachrichtigungen wurden aktiviert
- Naechste Entscheidung erst nach Analyse der ersten eingehenden Benachrichtigung

### Betriebliche Altersvorsorge

- VBV Vorsorgekasse ist als eigene Quelle gebaut
- Keine Einzelpositionen
- Summary/Karte `sourceSummaries/vbv`
- Dokumentbasierte Kontoinformation in `sourceDocuments` und
  `sourceDocumentFacts`
- Taeglicher headless Agentlauf um 06:45; gleicher Stichtag wird nicht neu
  importiert

### Bitget

- Firestore enthaelt aktuelle Bitget-Positionen aus einem erfolgreichen Lauf
- API-Key, Secret und Passphrase liegen lokal im macOS-Schluesselbund
- Spot- und Earn-Bestand werden in `sourcePositions` geschrieben
- Der produktive Bitget-LaunchAgent laeuft auf dem Mac Studio alle 5 Minuten
- Bitget nutzt fuer Bitget-Bewertungen ausschliesslich Bitget-Daten:
  Bitget-Ticker, `all-account-balance`, Spot-Assets und Earn-Assets
- Keine externen Preisfallbacks fuer Bitget, also kein CoinGecko und keine
  Frankfurter Boerse fuer Krypto
- Sauberer Schnitt vom 2026-06-20:
  - TRUMP und MELANIA sind keine aktuellen Portfolio-Positionen mehr
  - Spot-BTC-Dust unter `1 EUR` wird ausgeblendet, weil solche Reste in der
    GUI als sinnlose Null-/Centposition erscheinen
  - Ausgeschlossene Bitget-Bestaende bleiben im Rohsnapshot
    `rawDocuments/api_bitget_latest.rawPositions` und in
    `excludedPositions` nachvollziehbar
  - `sourcePositions` ist fuer Bitget ab diesem Schnitt die saubere aktuelle
    Portfolioansicht, nicht die ungefilterte API-Rohliste
- `sourceSummaries/bitget.currentValue` und `netValue` nutzen den von Bitget
  gelieferten kontenuebergreifenden Kontowert (`all-account-balance`, in USDT,
  mit Bitget `USDTEUR` nach EUR umgerechnet)
- Zusaetzlich werden gespeichert:
  - `positionsValue`: Summe aller Bitget-Positionen
  - `includedPositionsValue`: Summe aller bewertbaren Bitget-Positionen
  - `positionSummaryDifference`: Differenz zwischen bewertbarer
    Positionssumme und Bitget-Kontowert
  - `exchangeAccountValue`: Wert aus Bitget `all-account-balance` in EUR
  - `totalAccountValueUsdt`: Bitget-Kontowert in USDT
  - `componentsUsdt`: Bitget-Kontokomponenten
  - `unpricedPositionCount` und `unpricedPositions`: Assets, die Bitget als
    Bestand liefert, fuer die Bitget aber keinen Kurs liefert
  - `excludedPositionCount` und `excludedPositions`: Rohbestaende, die bewusst
    nicht in die aktuelle Portfolioansicht geschrieben werden
- `agentStatus/bitget` dokumentiert den letzten erfolgreichen Lauf
- `sourceSummaries/bitget` und die Bitget-Positionen schreiben getrennt:
  `sourceDataUpdatedAt`, `sourceDataProvider=bitget_api`,
  `quoteDataUpdatedAt`, `quoteDataProvider=bitget_api`,
  `lastAgentRunAt` und `lastAgentSuccessAt`
- Der aktuelle Mac-Studio-Test vom 2026-06-22 war erfolgreich:
  `npm run check:bitget`, `npm run import:bitget:local`,
  `npm run sync:bitget-ledger`, `npm run sync:health`
- Firestore ueberschreibt ab 2026-06-20 bei jedem Lauf denselben aktuellen
  Importstand:
  - `imports/api_bitget_latest`
  - `rawDocuments/api_bitget_latest`
- Damit schreibt der 5-Minuten-Lauf keine endlose 5-Minuten-Historie. Historie
  soll separat ueber geplante Tages-/Preishistorie entstehen.
- Historische Self-Service-Exporte von 13.06.2024 bis 13.06.2026 liegen in
  `My Drive/Depot/01_Originale/Bitget/API_Exports/`
- Verifizierte Einstandswerte:
  - TRUMP: `990,80114 USDT` fuer urspruenglich `20,20977 TRUMP`; bei aktueller
    Restposition wird die Kostenbasis proportional auf die aktuelle Menge
    heruntergerechnet
  - MELANIA: `289,53119 USDT` fuer aktuell `66,20373 MELANIA`
- Persistente Kostenbasis liegt in Firestore unter `sourceCostBasis` und wird
  bei jedem Bitget-Import zugemischt
- Coins ohne aktuellen Bitget-Ticker bleiben sichtbar, werden aber nicht
  bewertet und mit `quoteStatus=NO_BITGET_PRICE` markiert; nach dem sauberen
  Schnitt betrifft das keine aktuelle Bitget-Position mehr, weil MELANIA
  ausgeschlossen ist
- BTC-Einstand wurde vom Nutzer mit insgesamt `3.000 EUR` fuer den Earn-Bestand
  von `0,066856 BTC` bestaetigt; rechnerischer Einstandskurs:
  `44.872,561924 EUR/BTC`
- EUR-Einstandswerte fuer TRUMP und MELANIA bleiben bis zum Abgleich mit Bank-
  oder Kreditkartenbuchungen bewusst leer
- Health-Fehler zu alten Bitget-Importen werden ab 2026-06-20 ignoriert, wenn
  danach ein erfolgreicher `agentStatus/bitget.lastSuccessAt` vorhanden ist
- Verifizierter Stand 2026-06-22 00:30 CEST:
  - `agentStatus/bitget`: `OK`
  - `sourcePositions`: 3 Bitget-Positionen (`BTC Earn`, `EUR`, `USDT`)
  - `sourceSummaries/bitget.currentValue`: ca. `3.823 EUR`
  - `sourceSummaries/bitget.costValue`: `3.000 EUR`
  - `sourceSummaries/bitget.excludedPositionCount`: `3`
    (`bitget_spot_BTC`, `bitget_spot_TRUMP`, `bitget_spot_MELANIA`)
  - `sourceSummaries/bitget.unpricedPositionCount`: `0`
  - `systemHealth/current`: `OK`
- Daten-Audit liegt in `docs/bitget_data_audit_2026-06-20.md`
- Wichtiger Audit-Befund:
  - aktuelle Positionen werden automatisch gepflegt
  - Kosten, einzelne Trades, Fees und Earn-Zinsen sind ueber Bitget-API
    abrufbar
  - Seit 2026-06-20 existiert ein separater Bitget-Ledger-Agent:
    - LaunchAgent `com.niklas.finanztool.bitget-ledger`
    - stuendlicher Lauf
    - Script `automation/src/sync-bitget-ledger-local.mjs`
    - Lock-Datei `/tmp/finanztool-bitget-ledger.lock`
  - Letzter verifizierter Ledger-Stand:
    - `ledgerEntries`: 2166 historisch vorhanden, letzter Lauf 2165
    - `transactions`: 2
    - `costEvents`: 2
    - `incomeEvents`: 91 historisch vorhanden, letzter Lauf 90
    - `sourceDocumentFacts`: 750 historisch vorhanden, letzter Lauf 725
    - `agentStatus/bitget_ledger`: `OK`
  - Ledger-/Fact-Dokumente werden historisch behalten und nicht geloescht,
    wenn sie aus dem Rolling-Fenster herausfallen
  - Teilabrufe mit Rate-Limit/Netzwerkfehler werden im Ledger-Agent jetzt als
    `WARNUNG` mit `warnings` gespeichert, nicht mehr still als OK

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
npm run ft:install
ftd
fts "Commit Message"
ftp "Commit Message"
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
  - Nachpruefung am 2026-06-20: API-Key funktioniert; alter Importfehler vom
    2026-06-16 war historisch und wird nicht mehr als aktueller Health-Fehler
    gemeldet
  - Bitget-Rohdaten werden als aktueller Snapshot in
    `rawDocuments/api_bitget_latest` ueberschrieben
  - Restpositionen wie TRUMP-Dust erhalten eine anteilige Kostenbasis statt
    den urspruenglichen Gesamteinstand der vormaligen Gesamtmenge
  - Bitget-App/Webansicht und Firestore koennen abweichen, wenn:
    - Bitget ein Asset als Bestand liefert, aber keinen Bitget-Ticker dafuer
      anbietet
    - die Bitget-Webansicht einzelne Spot-Dust-Assets ausblendet
    - `all-account-balance` und Spot-Ticker in unterschiedlichen Sekunden
      bewertet werden
    - Bitget-Webansicht, Bitget `all-account-balance` und oeffentliche
      Bitget-Ticker unterschiedliche Bewertungswege sind; am 2026-06-20 ergab
      `all-account-balance` ca. `3.835,78 EUR`, BTC-Menge mal `BTCEUR` ca.
      `3.838,28 EUR`, waehrend die geladene Webansicht ca. `3.832,83 EUR`
      zeigte
  - Deshalb gilt fuer Bitget:
    - Kartenwert kommt aus `exchangeAccountValue`
    - Positionsliste zeigt alle API-Bestaende
    - unbewertbare Positionen erzeugen Health-Warnungen
    - groessere Differenzen zwischen Bitget-Kontowert und bewerteter
      Positionssumme erzeugen eine eigene Health-Warnung
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
- Preis-Historie, Stand aktualisiert am 2026-06-21:
  - `automation/src/sync-quotes-local.mjs` schreibt `priceHistory` nur noch
    im History-Modus `--write-history`; normale Kurslaeufe aktualisieren
    `quotesCurrent`, `sourcePositions` und `sourceSummaries`
  - Dokument-ID: `instrumentId_YYYY-MM-DD`, dadurch pro Instrument und Tag
    idempotent und nicht doppelt
  - Gespeichert werden u.a. `instrumentId`, `isin`, `price`, `currency`,
    `priceEur`, `provider`, `providerSymbol`, `asOf`, `historyDate`,
    `positionIds` und `sources`
  - Der LaunchAgent `com.niklas.finanztool.quote-sync` laeuft alle 5 Minuten
    fuer aktuelle Kurse; `com.niklas.finanztool.quote-history` laeuft
    taeglich `22:00` und schreibt Tageshistorie
- Manueller Refresh-Fix:
  - Ursache fuer die falsche GUI-Fehlermeldung:
    `run-quote-sync-local.mjs` hat `check-health-local.mjs` ausgefuehrt,
    waehrend `agentStatus/quotes` noch `RUNNING` war; Health hat daraus
    faelschlich `Agent quotes: RUNNING` als Fehler erzeugt
  - Fix: Quote-Agent setzt nach erfolgreichem Kurslauf zuerst
    `agentStatus/quotes=OK` und ruft danach Health auf
  - App-Button `Alles aktualisieren` beobachtet aus Rule-Kompatibilitaet weiter
    `automationCommands/sync_quotes_manual` und unterscheidet `REQUESTED`,
    `RUNNING`, `DONE` und `ERROR`
  - `automationCommands/sync_quotes_manual.type` bleibt `sync_quotes`
  - Der Command-Runner interpretiert `sync_quotes` ab 2026-06-21 als
    Full-Refresh, nicht mehr als reinen Kurslauf
  - Command-Runner startet dafuer `automation/src/run-full-refresh-local.mjs`
  - Full-Refresh fuehrt aktuell nacheinander aus:
    Bitget Snapshot, Bitget Ledger, Flatex Umsatzexport + Broker-Snapshot,
    Trade-Republic-Mail-Agent, Ginmon API, Ginmon Dokumente, Intergold, VBV,
    Kurse/Positionshistorie, Health
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

Auf dem aktuellen Entwicklungsgeraet `ftd` ausfuehren und den neuesten Eintrag
aus `docs/device_switch_log.md` beachten. Auf dem MacBook Pro keine
produktiven Studio-Agents starten. Bei Rueckgabe an den Mac Studio `ftp`
ausfuehren; danach auf dem Mac Studio `ftd`, Agent-Installation/Health und
`launchctl list | grep finanztool` pruefen.

## Bedienkuerzel

- Es gelten die Kurzbefehle `ftd`, `fts` und `ftp`; `ftu` bleibt als alter
  Alias fuer `ftp` verfuegbar.
- `ftd`: Projekt auf der aktuellen Maschine vom gemeinsamen GitHub-Stand
  aktualisieren/herunterladen.
  Ablauf:
  1. Zuerst `docs/device_workflow.md`, `docs/device_switch_log.md`,
     `docs/working_memory.md` und `README.md` lesen.
  2. Dann `git status` pruefen.
  3. Falls lokale Aenderungen vorhanden sind, nicht ueberschreiben; zuerst
     `fts` ausfuehren oder den Nutzer kurz auf den Konflikt hinweisen.
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
- `fts`: Projekt lokal speichern, ohne GitHub-Push und ohne Firebase-Deploy.
  Ablauf:
  1. Relevante Checks ausfuehren, mindestens `npm --prefix app run build`.
  2. `git status` und `git diff --stat` pruefen.
  3. Sinnvolle Aenderungen committen.
  4. Nicht pushen und nicht deployen.
- `ftp`: aktuellen Stand bauen, lokal speichern/committen, auf GitHub pushen
  und nach Firebase deployen.
  Danach ist das Projekt an das jeweils andere Geraet uebergeben. Beispiel:
  auf Mac Studio entwickeln -> `ftp` -> auf MacBook Pro `ftd`; oder
  auf MacBook Pro entwickeln -> `ftp` -> auf Mac Studio `ftd`, damit die
  dort laufenden Agents den neuen Code erhalten.
  Vor dem Commit muss Codex `docs/working_memory.md` und bei Geraetewechseln
  `docs/device_switch_log.md` aktualisieren.

## Letzte Aktualisierung

- Datum: 2026-06-21 CEST
- Quelle: Lokale Codex-Session, Agent-Audit, Flatex-/Kursstrategie und UI-Arbeit auf `localhost`
- Uebergabestand: Lokaler Savepoint `7808ec6` wurde mit `fts`
  gespeichert; anschliessend wurde der damalige Upload-Befehl `ftu` gestartet,
  um diesen Stand an
  GitHub/Firebase und danach ans MacBook Pro zu uebergeben.
- Zusatzstand 2026-06-21: Kursstrategie fuer Wertpapiere umgestellt auf
  haeufige aktuelle Kurse und sparsame Tageshistorie. `quotesCurrent` wird
  durch `com.niklas.finanztool.quote-sync` alle 5 Minuten aktualisiert und
  ueberschrieben. `priceHistory` und die generische Positionshistorie werden
  nur durch `com.niklas.finanztool.quote-history` taeglich um 22:00
  `Europe/Vienna` geschrieben. Der Quote-Sync speichert jetzt `quoteVenue`,
  `quoteAsOf`, `quoteFetchedAt`, `quoteAgeMinutes` und `quoteFreshness`; die
  GUI zeigt fuer Positionen und Depotkarten bevorzugt den echten Kursstand
  statt nur den Firestore-Schreibzeitpunkt. Wenn eine Position einen
  Handelsplatz mitliefert, versucht der Boerse-Frankfurt-Provider diesen MIC
  zuerst und faellt erst danach auf Provider-Standard/Xetra/Frankfurt zurueck.
- Status: Geraetewechsel-Regeln und Kurzbefehle liegen zentral in
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

## Trade Republic Mail-Agent Debug 2026-06-21

- Apple Mail zeigt eine Trade-Republic-Mail vom 17.06.2026 mit drei
  `Securities Settlement`-PDF-Anhaengen.
- Der Agent hatte bisher trotzdem `savedAttachmentCount: 0`, weil Apple Mail
  das Gmail-Postfach auf dem Mac Studio `Google` nennt, der Agent aber per
  Default nach `Niklas.kofler@gmail.com` als Account-Name gefiltert hat.
- Fix: `trade-republic-mail-agent.mjs` durchsucht ohne `TR_MAIL_ACCOUNT`
  jetzt alle Apple-Mail-Accounts. Optional kann `TR_MAIL_ACCOUNT` weiterhin
  gesetzt werden.
- Zusaetzlicher Fix: `sync-quotes-local.mjs` berechnet
  `sourceSummaries.costValue`, `performanceValue` und `performancePct` wieder
  aus den aktuellen Positionen und laesst `externalQuoteDifference` leer,
  wenn nicht alle Wertpapierpositionen eine externe Kursbewertung haben.
- UI-Regel bestaetigt: `Depotwert` in der Depotkarte zeigt den Gesamtwert der
  Quelle inklusive Cash; `Cash` bleibt als separate Kennzahl daneben sichtbar.
  Der interne `depotValue` bleibt fuer reine Wertpapierwerte und Abgleiche
  erhalten.
- Hintergrund: Trade Republic hatte nach der Baseline vom 13.06.2026
  Jun-16-Kaeufe in der Mail vom 17.06.2026, die durch den Account-Filter nicht
  angewendet wurden. Dadurch blieben Mengen/Einstand fuer Stoxx Europe Defense,
  Core S&P 500 und NASDAQ100 gegenueber dem Net-Worth-PDF vom 21.06.2026 zu
  niedrig.
- Verifizierter Firestore-Stand nach Write-Lauf:
  - `agentStatus/traderepublic_mail`: `OK`, 11 PDFs verarbeitet, 3 neue auf
    Positionen angewendet, 0 unparsebar
  - Mengen jetzt deckungsgleich mit `Net Worth.pdf` vom 21.06.2026:
    Stoxx `105,815346`, Core S&P 500 `0,309876`, NASDAQ100 `0,274471`,
    Netflix `0,094`, Private Equity `11,178226`
  - `sourceSummaries/traderepublic`: Netto `2.581,03 EUR`, Cash `149,49 EUR`,
    Einstand `2.306,41 EUR`, G/V `125,13 EUR`
  - Health nach Sync: `OK`, 0 Warnungen

## Depotkarten-Wertelogik 2026-06-21

- `Depotwert` in allen Depotkarten ist ab jetzt der Brutto-Depotwert der Quelle:
  positiver Cash wird mitgezaehlt. Bei Flatex wird ein negativer Cash-Wert als
  genutzter Kredit behandelt und wieder auf den Netto-Wert addiert, damit die
  Karte den vollen Wertpapier-Depotwert zeigt.
- `cashValue` bleibt als eigene Kennzahl `Cash` sichtbar und wird dadurch
  nicht doppelt gezaehlt, sondern nur transparent separat ausgewiesen.
- Flatex-Sonderregel in der Karte:
  - negativer Cash-Wert wird als `Kredit in Anspruch` positiv angezeigt
  - `Verfuegbares Guthaben` wird nicht mehr angezeigt
  - `Verfuegbar inkl. Kredit` bleibt sichtbar
  - verifizierter Stand: Depotwert-Karte `22.435,45 EUR`, Cash
    `-5.843,79 EUR`, Kredit in Anspruch `5.843,79 EUR`,
    Verfuegbar inkl. Kredit `373,81 EUR`

## Transparenz-Audit Regel und Reihenfolge 2026-06-21

- Neue verbindliche Regel im Datenvertrag:
  Primaerdatenstand, Dokumentstand, Kurs-/Preisstand und Agent-Laufzeit duerfen
  nicht mehr unter einem unklaren `Aktualisiert` vermischt werden.
- Fuer jede bestehende und neue Quelle muessen, soweit relevant, sichtbar sein:
  - Broker-/API-/Datenstand fuer Bestand, Cash, Kredit, Einstand und
    Unterkonten
  - Dokumentstand fuer exportierte/importierte/geparste Dokumente
  - Kurs-/Preisstand inklusive Provider
  - Agent zuletzt
  - letzte fachliche Daten- oder Preisaenderung, wenn Agentlaeufe haeufiger
    sind als echte Datenveraenderungen
- Eigener Arbeitsplan liegt in
  `docs/transparency_audit_plan_2026-06-21.md`.
- Reihenfolge der Aufarbeitung:
  1. VBV
  2. Capital.com
  3. Bitget
  4. Intergold
  5. Ginmon
  6. Trade Republic
  7. Flatex
- Vor jedem Depot muss Codex zuerst kurz erklaeren:
  - wie die Quelle aktuell aktualisiert wird
  - welche Daten aus Broker/API/Dokument kommen
  - welche Daten aus Kurs-/Webquellen kommen
  - wie Summary und Positionen berechnet werden
  - welche Schwachstellen aktuell bekannt sind
- Erst danach wird fuer diese Quelle umgesetzt.
- VBV wurde als erster Transparenz-Audit-Schritt erledigt:
  - Datenquelle: `meinevbv.at` Portal, keine externe Kursquelle
  - Berechnung: `sourceSummaries/vbv.currentValue` und `netValue` sind direkt
    der gelesene VBV-Saldo
  - `sourceDataUpdatedAt`: `2026-05-31`
  - Urspruenglich `sourceDataProvider`: `vbv_portal`
  - `lastAgentSuccessAt`: `2026-06-21T19:07:33.761Z`
  - GUI zeigt fuer VBV `VBV-Stand` und separat `Agent zuletzt`
  - Build und Health nach Umsetzung: OK

- VBV wurde danach auf die genauere PDF-Kontoinformation umgestellt:
  - Portal-Stichtag bleibt der Ausloeser; das PDF wird nur heruntergeladen und
    geparst, wenn der Stichtag neu ist oder kein PDF zu diesem Stichtag in
    Firestore liegt.
  - PDF-Quelle im Portal: `Severance Payment Fund` -> `Account information`.
  - Manuell importierte Baseline:
    `/Users/niklaskofler/Library/Mobile Documents/com~apple~CloudDocs/Downloads/Kontoinformation-VBVVK31052026.pdf`
  - Canonical Copy:
    `~/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/01_Originale/VBV/AccountInformation/2026-05-31_VBV_AccountInformation_0fb1fd7634.pdf`
  - Firestore:
    - `sourceSummaries/vbv.sourceDataProvider`: `vbv_account_information_pdf`
    - `sourceSummaries/vbv.documentDataUpdatedAt`: `2026-05-31`
    - `sourceSummaries/vbv.accountInformation`: Summary + 2 Vertragsdetails
    - `sourceSummaries/vbv.costValue`: `1.777,42 EUR`
    - `sourceSummaries/vbv.performanceValue`: `+38,44 EUR`
    - `sourceSummaries/vbv.performancePct`: `+2,16 %`
    - `sourceDocuments/vbv_account_information_2026_05_31`
    - `sourceDocumentFacts`: 3 VBV-Fakten
  - Geparste Werte:
    - Gesamtwert: `1.815,86 EUR`
    - Garantiekapital: `1.736,01 EUR`
    - Beitraege: `400,40 EUR`
    - Veranlagungsergebnis netto: `+47,26 EUR`
    - explizite Kosten: `-8,82 EUR`
    - G/V fachlich: `+38,44 EUR`
    - Novartis Pharmaceutical Manufacturing GmbH: `1.707,28 EUR`
    - SANDOZ GmbH: `108,58 EUR`
  - GUI: VBV-Karte hat jetzt einen ausklappbaren `Kontoinformation`-Bereich.
  - Export-Fix: Der sichtbare `Account information`-Link im Portal ist nur
    Navigation; der echte PDF-Link ist
    `/webportal/kontoinformation?date=...&hash=...`. Der VBV-Agent liest diesen
    Link aus und laedt die PDF direkt mit der eingeloggten Session.
  - Dubletten-Fix: Physische PDF-Hashes koennen bei gleichem Inhalt abweichen.
    Fuer VBV zaehlt deshalb `semanticHash` aus den geparsten Fachzahlen und die
    stabile Dokument-ID je Stichtag.
  - Verifikation: Parser OK, echter headless Export mit
    `VBV_HEADLESS=1 node automation/src/sync-vbv-local.mjs --write --force-account-info`
    OK, `npm --prefix app run build` OK,
    `npm --prefix automation run sync:health` OK.

## GUI-Agententransparenz Fix 2026-06-22

- Problem nach der letzten GUI-Aenderung:
  - Agent-Name, Zeitstempel und Status wurden in der Depotkarte teilweise ohne
    Abstand zusammengezogen, z. B. `Bitget Import-Agent22.06.2026 01:03 (OK)`.
  - Bitget hatte dafuer eine Sonderlogik in `SourceOverview`, obwohl die
    kanonische Quelle der Wahrheit `agentStatus` ist.
- Korrigierte Regel:
  - Jede Depotkarte zeigt Agenten in einem eigenen Agentenbereich.
  - Pro Agent werden Name, fachliche Aufgabe, letzter technischer Lauf,
    Status-Badge und bei abweichendem Zeitpunkt der letzte Erfolg angezeigt.
  - Der Kurs-/Datenstand bleibt ein eigener Datenpunkt und wird nicht mehr mit
    Agentenlaufzeiten vermischt.
  - Responsive-Regel: Agentenkacheln muessen immer die volle verfuegbare
    Depotkartenbreite nutzen und duerfen auf Mobile nicht in die Icon-Spalte
    oder eine zu schmale Grid-Spalte fallen. Auf iPhone-15-Breite sollen sie
    einspaltig, kompakt und ohne vertikales Buchstabenbrechen erscheinen.
  - Dashboard-Regel: `Aktive Quellen` und `Warnungen` gehoeren in der
    Uebersicht in eine gemeinsame Status-Kachel. Warntexte duerfen auf
    iPhone-15-Breite nicht in eine halbe Kachel gequetscht werden; die
    eigentliche Warnliste nutzt innerhalb dieser Status-Kachel die volle
    verfuegbare Breite.
- Aktuelle Agent-Metadaten in der GUI:
  - `bitget`: Bestände, Wallets und aktuelle Bewertung aus der Bitget API
  - `bitget_ledger`: Transaktionen, Gebühren, Zinsen/Earn und Bewegungen
  - `flatex`: aktuelle Depot- und Kontodaten aus dem Flatex Export
  - `flatex_documents`: CSV-/Postfachdokumente, Bewegungen, Kosten, Fakten
  - `ginmon`: aktuelle API-Werte, Kurse, Barwerte und Konten
  - `ginmon_documents`: Ginmon-Dokumente, Kosten und Dokumentfakten
  - `intergold`: Websitepreise, Belege und Metallbewertung
  - `traderepublic_manual_exports`: selbst gemailte Trade-Republic-Exporte ohne
    Betreff, Net Worth, Transaction Export und Account Statement
  - `traderepublic_portal`: manueller Portal-Refresh aus der Karte; Chrome-
    Login mit lokaler Keychain, App-Bestaetigung und offizieller
    Transaction-History-Download, kein Import von unsicheren Browsertext-
    Scrapes
  - `capitalcom`: Kontostand, Cash und offene Positionen aus der API
  - `vbv`: Portalstichtag, Kontoinformation-PDF und Vertragswerte
- Umgesetzte Dateien:
  - `app/src/App.tsx`
  - `app/src/App.css`
  - `app/src/domain/types.ts`
  - `docs/firestore_data_contract.md`
- Diese Regel gilt ab jetzt fuer jedes neue Depot und jeden neuen Agenten.

## Trade-Republic-Architekturentscheidung 2026-06-22

- Arbeitsstand:
  - VBV, Capital.com, Bitget, Intergold und Ginmon gelten fuer den aktuellen
    Transparenz-Audit als abgeschlossen.
  - Noch offen: Trade Republic und danach Flatex.
- Trade Republic startet jetzt mit Fokus auf Wahrheit/Aktualitaet:
  - Automatische `Duplicates customer ...` Mails ruhen vorerst als fachlicher
    Kanal.
  - Diese Mails reichen nicht als Wahrheit fuer Cash, Private Equity,
    offizielle Trade-Republic-Snapshotwerte, Dividenden, Zinsen, Steuern,
    Corporate Actions und komplette Ledger-Historie.
- Gepruefte Architektur:
  - Baseline: `Transaction export.csv`, `Account statement.pdf`,
    `Tax Report 2025.pdf`
  - Mail-Agent: `automation/src/trade-republic-mail-agent.mjs`
  - Baseline-Reconcile:
    `automation/src/reconcile-traderepublic-baseline-local.mjs`
  - Quote-Sync: `automation/src/sync-quotes-local.mjs`
  - Health: `automation/src/check-health-local.mjs`
- Manuelle Stichprobe vom 2026-06-22:
  - `Transaction export 2.csv`: 196 Datenzeilen, 5 Positionen
  - `Account statement 2.pdf`: Cash `149,49 EUR`, Zeitraum bis `2026-06-20`
  - `Net Worth.pdf`: Gesamt `2.570,22 EUR`, Brokerage `1.238,91 EUR`,
    Private Markets `1.181,82 EUR`, Cash `149,49 EUR`
- Empfohlenes Zielmodell:
  - `traderepublic_manual_exports` als aktiver Trade-Republic-Importkanal
    fuer selbst gemailte No-Subject-Exporte
  - Boerse-Frankfurt-Kurse fuer oeffentlich handelbare Wertpapiere
  - Net-Worth-Parser als offizieller Trade-Republic-Kontroll-Snapshot
  - Account-Statement-Parser fuer Cash-Reconciliation
  - Transaction-Export-Abgleich periodisch fuer volle Ledger-/Kosten-/Zins-/
    Steuer-/Corporate-Action-Historie
- Umsetzung 2026-06-22:
  - neuer Agent:
    `automation/src/trade-republic-manual-export-agent.mjs`
  - npm-Scripte:
    `reconcile:traderepublic-manual-exports`,
    `sync:traderepublic-manual-exports`,
    `install:traderepublic-manual-export-agent`
  - LaunchAgent:
    `com.niklas.finanztool.traderepublic-manual-exports`
  - Taktung: alle 15 Minuten und sofort ueber App-Full-Refresh.
  - Mail-Lookback: No-Subject-Mails der letzten 14 Tage.
  - Duplikatlogik: CSV-Zeilen ueber `traderepublic_tx_<transaction_id>`.
  - Aktive Kursquelle wird in der GUI bei Positionen sichtbar
    (`Frankfurt`, `Broker`, `Ginmon API`, `Bitget`, `Intergold`).
  - Dry-Run gegen `Transaction export 2.csv`, `Account statement 2.pdf` und
    `Net Worth.pdf`: alle drei Dokumente erkannt, Net Worth mit 5 Positionen.
  - Zu breit gespeicherte alte Manual-Export-Staging-Dateien wurden nach
    `02_Archiviert/TradeRepublic/ManualExports/Ignored` verschoben.
  - Produktivlauf 2026-06-22:
    `agentStatus/traderepublic_manual_exports=OK`, 3 Dokumente geprueft,
    `latestTransactionDate=2026-06-16`, keine unbekannten Dokumente.
  - LaunchAgent `com.niklas.finanztool.traderepublic-manual-exports` ist der
    aktive Trade-Republic-Agent auf dem Mac Studio.
  - LaunchAgent `com.niklas.finanztool.traderepublic-mail` soll vorerst nicht
    geladen sein.
  - Neuer App-Button/Portal-Agent 2026-06-22:
    - Trade-Republic-Karte zeigt einen `Refresh`-Button.
    - Button schreibt `automationCommands/traderepublic_portal_refresh`.
    - Command-Runner startet
      `automation/src/download-traderepublic-local.mjs --write`.
    - Login-Daten duerfen nie ins Repo oder Firestore; sie liegen lokal in
      Keychain-Services `finanztool-traderepublic-phone` und
      `finanztool-traderepublic-pin`.
    - Der Agent wartet nach Telefon/PIN auf die Bestaetigung in der
      Trade-Republic-App.
    - Portal-Snapshot-Update 2026-06-23:
      - Der Agent liest zusaetzlich `Portfolio`, `Transactions` und `Activity`
        aus dem Trade-Republic-Webportal.
      - Er stellt die Portfolio-Liste vor dem Parsen auf `Since buy`; `Daily
        trend` darf nicht als Positionsbestand interpretiert werden.
      - Er unterstuetzt deutsches und englisches Zahlenformat, z. B.
        `149,49 EUR` und `149.49 EUR`.
      - Geschrieben wird `sourceDocumentFacts/traderepublic_portal_snapshot_latest`
        als Portal-Beobachtung mit sichtbaren Positionen, sichtbaren
        Transaktionen, Cash und Activity-Text.
      - Sichtbare Brokerage-Positionen werden nur bei eindeutigem Namensmatch
        mit `quoteProvider=traderepublic_portal_web` aktualisiert.
      - Private Markets werden nur als `traderepublic_portal_total_implied`
        aktualisiert: Portfolio-Gesamtwert minus gelistete Positionen.
      - Cash kommt aus `Profile > Transactions`.
      - `sourceSummaries/traderepublic.netValue` enthaelt jetzt Portalwert plus
        Cash; `depotValue` bleibt der Investmentwert ohne Cash.
      - Wenn kein offizieller Download gefunden wird, ist das kein harter
        Fehler mehr, solange der Portal-Snapshot erfolgreich war. Der Agent
        schreibt dann `agentStatus/traderepublic_portal=OK` mit Hinweis
        `kein offizieller Download-Button gefunden`.
    - Offizielle Downloads aus dem Portal werden weiterhin, falls vorhanden, in
      `00_Inbox/TradeRepublic/ManualExports/Portal` abgelegt und durch den
      bestehenden Manual-Export-Parser verarbeitet.
    - Browsertext aus dem Portal ist aktuelle Bewertungs-/Transparenzquelle,
      aber kein vollstaendiger Audit-Ersatz fuer Transaktionen, Steuern und
      Kosten. Dafuer bleiben `Transaction export`, `Account statement`,
      `Net Worth` und Tax-Reports massgeblich.
  - Verifikation 2026-06-23:
    - echter Portal-Write-Lauf erfolgreich.
    - `agentStatus/traderepublic_portal=OK`
    - `visiblePositionCount=4`, `visibleTransactionCount=30`
    - `cashValue=149,49 EUR`
    - `brokerSnapshotValue=2.445,65 EUR`
    - `brokerageValue=1.263,83 EUR`
    - `privateMarketsValue=1.181,82 EUR`
    - `netValue=2.595,14 EUR` inklusive Cash.
- Neue verbindliche Betriebsregel 2026-06-22:
  - Bis Trade Republic automatische vollstaendige Exporte anbietet, sendet der
    Nutzer moeglichst taeglich App-Exporte ohne Betreff an die eigene
    Mailadresse.
  - Pflichtpaket: `Net Worth.pdf`, `Transaction export.csv` und
    `Account statement.pdf`.
  - `Tax Report ...pdf` bleibt jaehrlich.
  - Die Uhrzeit ist variabel; wenn der Nutzer den Export vergisst, bleibt der
    letzte bekannte Stand gueltig und die GUI muss das Datum klar anzeigen.
  - Der Manual-Export-Agent muss ueberlappende CSVs idempotent behandeln:
    gleiche Transaktions-IDs duerfen Einstand, Kosten, Steuern, Zinsen,
    Dividenden und Ledger nicht doppelt veraendern.
  - Abweichung vom 2026-06-22 ist dokumentiert:
    Handy-App `2.623,72 EUR` Total mit Private Markets `1.381,82 EUR`,
    Net-Worth-PDF fast zeitgleich `2.570,22 EUR` Gesamt mit Private Markets
    `1.181,82 EUR`. Deshalb muessen Quelle, Stand und Abweichung in der App
    sichtbar sein.
  - Warnungsfix 2026-06-22:
    - Ursache: Der 15-Minuten-Agent speicherte bekannte Mail-Anhaenge erneut
      an denselben Pfad und konnte das Net-Worth-PDF genau waehrend dieses
      erneuten Speicherns kurz als `UNVOLLSTAENDIG` sehen.
    - Fix: Apple-Mail-Anhaenge werden nicht mehr ueberschrieben, wenn die
      Ziel-Datei bereits existiert.
    - Zusaetzlich gilt: Wenn ein Dokument bereits einmal vollstaendig als
      `PARSED` angewendet wurde, darf ein spaeterer transient schlechter
      Wiederholungsscan keine Health-Warnung erzeugen.
    - Verifikation: echter Maillauf `sync:traderepublic-manual-exports -- --no-quotes`
  - Portal-PDF-Crawler Stufe 1 umgesetzt am 2026-06-23:
    - Datei: `automation/src/download-traderepublic-local.mjs`
    - Nach Login/App-Freigabe scannt der Agent `Profile > Transactions` nach
      Dokumenten.
    - Erkannte Labels: `Billing Execution`, `Inbound Invoice`, `Statement`,
      `Transaction confirmation`, `Dividend equivalent`.
    - PDF-Popups werden direkt heruntergeladen; temporaere Presigned-URLs
      werden nicht gespeichert.
    - Dedupe primaer per SHA-256.
    - Ablage Original:
      `01_Originale/TradeRepublic/PortalDocuments/<documentType>/`
    - Ablage Text:
      `02_Archiviert/TradeRepublic/PortalDocuments/Text/<documentType>/`
    - Bei `--write` werden `sourceDocuments`,
      `sourceDocumentFacts` und Fehler-Fakten geschrieben.
    - Voll geparst in Stufe 1:
      - `Billing Execution` als `security_execution`
      - `Inbound Invoice` als `cash_deposit`
    - Noch nicht automatisch in Ledger/Kosten/Zinsen ueberfuehrt:
      `Statement`, `Transaction confirmation`, `Dividend equivalent`.
    - Verifikation:
      - `node --check automation/src/download-traderepublic-local.mjs`
        erfolgreich.
      - `npm --prefix app run build` erfolgreich.
      - Login-Erkennung korrigiert: authentifizierte URLs wie
        `/profile/activities` zaehlen als eingeloggt, auch wenn der Body-Text
        noch nicht alle erwarteten Woerter enthaelt.
      - Portal-Detailansicht ist `.sideModal`, Dokumentbuttons liegen in
        `.detailDocuments`; die ganze Seite darf nicht als Dokumentbereich
        interpretiert werden.
      - Echter `--write`-Lauf am 2026-06-23 erfolgreich:
        - `sourceDocuments`: 4 Portal-Dokumente
        - `sourceDocumentFacts`: 4 Portal-Fakten
        - 3 `security_execution` aus `Billing Execution`
        - 1 `cash_deposit` aus `Inbound Invoice`
        - 0 Portal-Dokumentfehler
        - `agentStatus/traderepublic_portal=OK`
      - Agentstatus zeigt kuenftig PDF-Anzahl im aktuellen Lauf plus kumulierte
        Portal-Dokumentanzahl.
  - Portal-Fakten-Anwendung umgesetzt am 2026-06-23:
    - Datei: `automation/src/download-traderepublic-local.mjs`
    - Neuer Befehl:
      `npm --prefix automation run sync:traderepublic-portal-facts`
    - Zweck: bereits geladene Portal-Dokumentfakten ohne Browser-Login
      idempotent operativ anwenden.
    - Portal-Dokumente bekommen eine fachliche `portalTransactionSignature`
      aus Dokumentlabel, Datum, Titel und Betrag. Damit weiss der Agent vor
      dem Klick, ob ein Portalvorgang bereits bekannt ist.
    - Operative Anwendung schreibt:
      - `transactions/traderepublic_portal_tx_*`
      - `ledgerEntries/traderepublic_portal_ledger_*`
      - bei Gebuehren `costEvents/*`
      - aktualisierte `sourcePositions` fuer Menge/Einstand
      - `sourceDocumentFacts/traderepublic_portal_application_*`
    - Dedupe gegen Manual-Export:
      - Wertpapierausfuehrungen: Datum, ISIN, Menge, Betrag
      - Cash-Einzahlungen: Wertstellung, Betrag, Konto
    - Wenn ein manueller Export denselben Vorgang bereits enthaelt, wird der
      Portalvorgang als `SKIPPED_DUPLICATE_MANUAL` dokumentiert und nicht
      operativ geschrieben.
    - Verifikation:
      - `node --check automation/src/download-traderepublic-local.mjs`
        erfolgreich.
      - Erster Lauf `sync:traderepublic-portal-facts`: 4 neu angewendet.
      - Zweiter Lauf `sync:traderepublic-portal-facts`: 0 neu, 4
        uebersprungen.
      - Firestore: 4 `portal_document_application` mit `status=APPLIED`,
        3 vorlaeufige Portal-Transaktionen, 4 Portal-Ledger-Eintraege.
  - Informationsluecke Trade Republic Stand 2026-06-23:
    - Grosser Portal-Lauf mit `TR_PORTAL_DOCUMENT_SCAN_LIMIT=80`:
      - 67 Portal-Dokumente insgesamt
      - 65 `billing_execution`
      - 1 `inbound_invoice`
      - 1 `tax_report`
      - alle 67 als `PARSED`
    - Tax Report 2025 ist im Webportal unter
      `Profile > Activity > Annual Tax Report 2025` erreichbar und wurde als
      Portal-PDF/Fakt gespeichert. Er muss nicht mehr manuell per Mail kommen,
      solange der Portalzugriff funktioniert.
    - Duplicate-Statement-Mails sind fuer Wertpapierabrechnungen nicht mehr
      erforderlich, weil dieselben `Billing Execution`-PDFs aus der Web-App
      geladen werden.
    - Private-Equity-Korrektur:
      - Sechs Private-Equity-Portalbuchungen waren kurz doppelt angewendet,
        weil `private_market_cash` aus dem CSV nicht als Duplikat zu
        `Billing Execution` erkannt wurde.
      - Fix: `private_market_cash` wird jetzt gegen Private-Equity-
        Portalabrechnungen dedupliziert.
      - Betroffene Portal-Anwendungen wurden auf
        `SKIPPED_DUPLICATE_MANUAL` gesetzt und aus
        `transactions`/`ledgerEntries` entfernt.
      - Private-Equity-Einstand kommt nicht mehr aus allen
        `private_market_cash`-Fakten, weil diese auch Vorabzahlungen/
        Cashflows enthalten koennen.
      - Neue Regel seit 2026-06-23: Fuer Private Equity `LU3176111881`
        haben ausgefuehrte Trade-Fakten Vorrang. Einstand = Summe
        `Stueck * Kurs` aus `factType=trade`; verifiziert:
        `11,178226` Stueck und `1.145,40 EUR` Einstand.
      - `private_market_cash` ist nur Rueckfallquelle, wenn keine
        ausgefuehrten Private-Equity-Trade-Fakten vorhanden sind.
    - Fallback-/Warnlogik umgesetzt am 2026-06-23:
      - Wenn ein Portal-Dokumentbutton kein PDF liefert, versucht der Agent
        einen DOM-Fallback aus der sichtbaren Detailansicht.
      - DOM-Fakten werden mit `sourceChannel=traderepublic_portal_dom`
        gespeichert.
      - Zinsen werden nur dann aus dem DOM akzeptiert, wenn echte
        Zinsmerkmale wie `Interest`, `Accrued`, `You received` oder `Zins`
        im Detailtext stehen. Ein zu grosszuegiger Test-Fallback wurde wieder
        aus Firestore entfernt.
      - Drei alte `Transaction confirmation`-Buttons fuer Cashbewegungen
        lieferten weiter `Something went wrong`.
      - Seit 2026-06-25 werden solche Faelle nicht geloescht, sondern ueber
        `documentReviewDecisions` fachlich geschlossen, wenn sie durch andere
        gespeicherte Trade-Republic-Daten abgedeckt sind.
      - Fuer die drei bekannten Faelle vom `2026-02-02`, `2026-03-03` und
        `2026-03-31` gibt es je eine `covered`-Entscheidung mit Scope `item`.
      - `agentStatus/traderepublic_portal` steht danach wieder auf `OK`.
      - `systemHealth/current` warnt depotuebergreifend bei unbekannten
        Dokumenten, unbekannten Dokumentfakten und ungelösten
        Portal-Dokumentfehlern.
    - Noch nicht voll automatisiert:
      - Vollstaendige historische Transaktionsliste per Web-DOM muss noch
        produktiv als Ersatz fuer `Transaction export.csv` umgesetzt werden.
    - Aktuelle Zusende-Regel:
      - Keine Duplicate-Statement-Mails mehr noetig.
      - Tax Report nicht mehr per Mail noetig.
      - Net-Worth-PDF fuer taeglichen aktuellen Wert nicht mehr zwingend,
        weil der Portal-Snapshot Portfolio/Cash liest; optional als Kontrolle.
      - Bis Zins-/Cash-DOM-Fallback produktiv ist, bleibt
        `Transaction export.csv` die sichere Quelle fuer Zinsen, Steuern,
        Dividenden, Cash-Historie und Private-Markets-Cashflows.
      - `Account statement.pdf` nur noch fuer Cash-Reconciliation sinnvoll,
        solange einzelne `Transaction confirmation`-PDFs fehlschlagen.
  - Gegencheck 2026-06-23 mit App-Freigabe:
    - Portal-Refresh erfolgreich; keine neuen Portal-PDFs, Snapshot wurde
      aktualisiert.
    - Trade-Republic-Werte danach: Depotwert `2.437,42 EUR`, Cash
      `149,49 EUR`, Netto `2.586,91 EUR`, Einstand `2.336,41 EUR`,
      G/V `+101,01 EUR` / `+4,3 %`.
    - Einzelpositionen: Private Equity `+36,41 EUR`, NASDAQ100 `+57,05 EUR`,
      Core S&P 500 `+16,11 EUR`, Netflix `-4,04 EUR`,
      Stoxx Europe Defense `-4,52 EUR`.
    - Wichtig: Netflix bleibt der Stockperk/Bonusfall mit Einstand
      `10,06 EUR`; laut aktuellem Portal ist aber zusaetzlich Stoxx Europe
      Defense leicht negativ. Trade Republic gesamt ist trotzdem positiv.
    - UI-Fix: Trade-Republic-Portal-Button sitzt jetzt als breite Aktionszeile
      in der Trade-Republic-Karte und zeigt waehrend des Logins
      `Trade Republic: App bestätigen`.
  - Preislogik-/Redundanz-Audit 2026-06-24:
    - Gelistete Trade-Republic-Positionen werden aktuell aktiv mit
      Boerse-Frankfurt/Xetra-Kursen bewertet. Felder muessen konsistent sein:
      `quoteProvider=boerse-frankfurt`,
      `priceSource=boerse-frankfurt`,
      `valuationMethod=boerse-frankfurt_quote_v1`.
    - Der letzte Broker-/Portalwert bleibt separat als `brokerCurrentValue`
      und `brokerQuoteProvider=traderepublic_portal_web` erhalten.
    - Private Equity bleibt `traderepublic_portal_total_implied`.
    - Cash bleibt `traderepublic_portal_cash_v1`.
    - Fix: `sync-quotes-local.mjs` schreibt jetzt `priceSource`,
      `priceSourceUrl`, `quoteDataProvider` und `quoteDataUpdatedAt`
      konsistent pro Kurslauf.
    - Aktueller Firestore-Stand nach Kurslauf:
      Depotwert `2.428,22 EUR`, Cash `149,49 EUR`, Netto
      `2.577,71 EUR`, Einstand `2.336,41 EUR`, G/V
      `+91,81 EUR` / `+3,9 %`.
    - Duplikatpruefung:
      - keine doppelten `transactions.transactionId`
      - `63` Portal-Anwendungen korrekt als
        `SKIPPED_DUPLICATE_MANUAL`
      - zwei Private-Equity-Ledgerzeilen am 2026-06-08 ueber je
        `50 EUR` sind echte zwei Ausfuehrungen mit unterschiedlichen
        Trade-Republic-Transaktions-IDs/Uhrzeiten
      - eine echte redundante Dokumentspur bleibt: `Tax Report 2025.pdf`
        gleicher `fileHash` in Baseline, Mail-Import und Portal-Import;
        wirkt nicht operativ auf Werte, soll spaeter ueber kanonischen
        `source + fileHash`-Dedupe bereinigt werden.
    - UI-Fix nach Nutzerfeedback: Trade-Republic-Portal-Button wurde ganz
      nach oben direkt unter den Trade-Republic-Kopf verschoben.
  - Dokumenten-Postfach 2026-06-25:
    - Neue Collection `documentReviewDecisions`.
    - Die App zeigt problematische Dokumente/Fakten nicht mehr versteckt in
      einer einzelnen Depotkarte, sondern zentral oberhalb der Depotkarten als
      `Dokumenten-Postfach`.
    - Zunaechst zeigt dieses Postfach nur offene/fehlerhafte oder unbekannte
      Dokumentfaelle aus allen Depots.
    - Dokumente mit lokalem PDF-Pfad koennen im Browser geoeffnet werden:
      `PDF öffnen` ruft den lokalen Dokumentserver
      `http://127.0.0.1:5176/documents/<sourceDocumentId>` auf.
    - Der Dokumentserver laeuft als LaunchAgent
      `com.niklas.finanztool.document-server` und wurde auf dem Mac Studio
      installiert.
    - Test 2026-06-25: `ginmon_doc_31664763` wurde erfolgreich als
      `application/pdf` ausgeliefert, 12 Seiten.
    - Fix 2026-06-25: Dokumentserver erneuert den Firebase-CLI-Access-Token
      bei `401` automatisch und liest `sourceDocuments` danach erneut.
      Ursache fuer zeitweise nicht oeffnende PDFs war ein abgelaufener Token,
      nicht ein fehlendes lokales PDF.
    - Wichtig: Firestore speichert Dokumentregister, Fakten und lokale
      `filePath`-Verweise; die PDF-Datei selbst wird fuer die lokale Anzeige
      aus Google Drive/Downloads ueber den Mac-Dokumentserver ausgeliefert.
    - Nutzer kann Dokumentfaelle ueber Standardaktionen klassifizieren:
      `Welcome-Dokument`, `Wichtig`, `Abgedeckt`, `Nicht relevant`.
    - Normale GUI-Entscheidungen gelten nur fuer das konkrete Dokument
      (`scope=item`). Typweite Entscheidungen werden nicht mehr in der GUI
      angeboten, damit ein Klick auf `Nicht relevant` nicht alle
      `unknown`-Dokumente ausblendet.
    - `Wichtig` setzt `needs_parser` und bleibt als offener Klaerungsfall im
      Postfach sichtbar.
    - Health und Trade-Republic-Portal-Agent ignorieren nur entschiedene
      Faelle; neue unbekannte oder nicht abrufbare Dokumente bleiben offen.
    - Verifizierter Stand:
      - `agentStatus/traderepublic_portal.status=OK`
      - `portalDocumentUnresolvedFailureCount=0`
      - `portalDocumentReviewedFailureCount=3`
      - `systemHealth/current` enthaelt keine Trade-Republic-Warnung mehr.
- Detailplan:
  - `docs/traderepublic_import_strategie.md`
