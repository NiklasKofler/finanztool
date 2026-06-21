# Firebase App Zielarchitektur

## Ziel

Die App soll alle Asset-Daten aus Broker-Exporten, PDFs, CSVs, APIs und
Preisquellen zentral zusammenfuehren. Das erste Ziel ist nicht KI, sondern eine
robuste Datenbasis:

- alle Dokumente und Exporte nachvollziehbar ablegen
- Inhalte strukturiert importieren
- Updates sicher und idempotent verarbeiten
- aktuelle Assets und Kurse moeglichst frisch halten
- Fehler erkennen, ohne bestehende Daten zu zerstoeren

## Grundentscheidung

Firebase ist fuer dieses Projekt eine gute Wahl:

- `Firebase Auth` fuer den persoenlichen Login
- `Firestore` fuer strukturierte Daten
- `Cloud Storage` fuer Originaldateien
- `Firebase Hosting` fuer die Web-App
- optional `Cloud Functions` oder `Cloud Run` fuer serverseitige Verarbeitung

Wichtig: Die Broker-Automation selbst sollte nicht direkt in Firebase laufen.
Ein lokaler Import-Agent auf dem Mac Studio ist sinnvoller, weil dort Mail,
Browser-Sessions, Downloads, lokale Dateien und Keychain-Zugriff verfuegbar sind.

## Hauptkomponenten

### Web-App

Die Web-App laeuft ueber Firebase Hosting und ist auf iPhone, iPad, MacBook und
Mac Studio erreichbar.

Aufgaben:

- Dashboard fuer Gesamtvermoegen
- Detailansichten pro Anbieter
- Positionen, Transaktionen, Cash, Performance
- Importstatus und Fehler anzeigen
- manuelle Uploads erlauben
- spaeter KI-Auswertung und Handlungsvorschlaege anzeigen

### Firebase Backend

Firestore speichert die normalisierten Daten. Cloud Storage speichert die
Originaldateien.

Aufgaben:

- Dokumentenregister
- Import-Laeufe
- Transaktionen
- Positionen
- Snapshots
- Kurse
- Bewertungen
- Plausibilitaetschecks

### Mac Studio Import-Agent

Der Mac Studio ist der Automations-Hub.

Aufgaben:

- Flatex-Browserexporte starten
- Ginmon-Dokumente abrufen
- Trade-Republic-Mails mit Anhaengen verarbeiten
- Intergold-Mails und Preis-Webseite verarbeiten
- Bitget spaeter per API abrufen
- Dateien in Firebase Storage hochladen
- Parser starten oder Import-Jobs an Firebase melden

Der Agent darf keine Orders ausfuehren. Er liest und exportiert nur Daten.

## Firebase Datenmodell

Der verbindliche Datenvertrag liegt in
`docs/firestore_data_contract.md`. Kurzfassung: Jede Quelle darf andere
Importwege haben, muss ihre Daten aber in dieselben fachlichen Collections
normalisieren. Quellenspezifische Collections sind nur Hilfs- oder
Uebergangsstrukturen und duerfen die kanonische Auswertung nicht ersetzen.

Wichtigste Collections:

- `users`
- `sources`
- `sourceAccounts`
- `sourceDocuments`
- `sourceDocumentFacts`
- `imports`
- `rawDocuments`
- `transactions`
- `ledgerEntries`
- `costEvents`
- `incomeEvents`
- `sourcePositions`
- `sourceSummaries`
- `snapshots`
- `quotesCurrent`
- `priceHistory`
- `instruments`
- `instrumentMappings`
- `agentStatus`
- `systemHealth`
- `automationCommands`

### `sources`

Ein Eintrag je Anbieter:

- `flatex`
- `trade_republic`
- `ginmon`
- `intergold`
- `bitget`
- spaeter `equate_plus`, `sparkasse_george`, `revolut`, `trading212`, `capital_com`

### `sourceDocuments`

Ein Eintrag je Originaldatei.

Wichtige Felder:

- `sourceId`
- `documentType`
- `storagePath`
- `originalFilename`
- `normalizedFilename`
- `contentHash`
- `receivedAt`
- `documentDate`
- `periodStart`
- `periodEnd`
- `status`
- `parserVersion`

Dokumente werden nie als Datenquelle ueberschrieben. Wenn eine Datei mit
gleichem Hash erneut auftaucht, wird sie als Duplikat markiert. Fachlich
relevante Inhalte aus Dokumenten werden in `sourceDocumentFacts` abgelegt.

### `imports`

Ein Eintrag je Importvorgang.

Wichtige Felder:

- `sourceId`
- `importType`
- `startedAt`
- `finishedAt`
- `status`
- `documentIds`
- `itemsFound`
- `itemsCreated`
- `itemsUpdated`
- `itemsSkipped`
- `warnings`
- `errors`

### `transactions`

Normalisierte Bewegungen aus CSVs, PDFs oder APIs.

Wichtige Felder:

- `sourceId`
- `accountId`
- `externalId`
- `tradeDate`
- `bookingDate`
- `type`
- `instrumentId`
- `isin`
- `quantity`
- `amount`
- `currency`
- `fees`
- `taxes`
- `rawDocumentId`
- `dedupeKey`

Die wichtigste Regel: Transaktionen muessen idempotent sein. Ein erneuter Import
darf keine Doppelbuchungen erzeugen.

### `ledgerEntries`, `costEvents`, `incomeEvents`

Diese Collections halten alles, was spaeter fuer Kosten-, Steuer-, Zins- und
Performanceanalysen wichtig ist:

- `ledgerEntries`: Cash-/Wallet-/Kontobewegungen
- `costEvents`: Gebuehren, Steuern, Spreads und sonstige Kosten
- `incomeEvents`: Dividenden, Zinsen, Earn-Ertraege, Cashback

Die aktuelle Portfolioansicht darf diese Historie nicht ersetzen.

### `sourcePositions` und `sourceSummaries`

`sourcePositions` enthaelt nur den aktuellen sichtbaren Bestand je Quelle.
Geschlossene Positionen verschwinden aus dieser aktuellen Ansicht, bleiben aber
ueber Bewegungen, Dokumentfakten und Historie nachvollziehbar.

`sourceSummaries` enthaelt je Quelle den aktuellen Gesamtstand:

- Depotwert
- Cash
- Einstand
- Gewinn/Verlust
- Performance
- letzte Aktualisierung
- Datenqualitaet/Warnhinweise

### `snapshots`

Zeitpunktbezogene Ist-Staende.

Beispiele:

- Flatex Depotuebersicht
- Flatex analytische Ansicht
- Trade Republic Net Worth
- Ginmon Asset Status
- Intergold aktueller Bestand
- Bitget Wallet Snapshot

Snapshots sind nicht dasselbe wie Transaktionen. Sie dienen fuer aktuelle Werte,
Reconciliation und Kurs-/Bewertungsvergleich.

### `prices`

Kurse und Marktpreise werden aktuell ueber `quotesCurrent` und `priceHistory`
gespeichert.

Wichtige Felder:

- `instrumentId`
- `source`
- `price`
- `currency`
- `priceTime`
- `quoteType`
- `confidence`

Broker-Kurse und externe Marktpreise werden getrennt gespeichert. Die App kann
dann anzeigen, ob sie Brokerwerte oder Marktwerte verwendet.

### `sourceAccounts`

Ein Eintrag je erkanntem Unterkonto, Depot, Portfolio, Wallet oder Kreditkarte.
Neue Unterkonten werden automatisch erkannt. Verschwundene Unterkonten werden
als inaktiv/geschlossen markiert, nicht still geloescht.

## Storage Struktur

Vorschlag fuer Cloud Storage:

```text
users/{uid}/raw/{sourceId}/{yyyy}/{mm}/{filename}
users/{uid}/processed/{sourceId}/{importRunId}/{filename}
users/{uid}/failed/{sourceId}/{importRunId}/{filename}
```

Originaldateien liegen immer unter `raw`. Parser-Ergebnisse oder Zwischenstufen
liegen unter `processed`. Fehlerfaelle werden unter `failed` referenziert oder
kopiert, ohne die Rohdatei zu loeschen.

## Import-Sicherheit

Das ist der wichtigste Teil der Architektur.

### Regeln

- Originaldateien werden nie geloescht oder still ersetzt.
- Jeder Import erzeugt einen `importRun`.
- Jeder Datensatz bekommt einen stabilen `dedupeKey`.
- Parser schreiben zuerst in eine Staging-Struktur.
- Erst nach Validierung werden Daten in die kanonischen Collections uebernommen.
- Ein fehlgeschlagener Import darf bestehende Daten nicht loeschen.
- Jede Quelle hat Plausibilitaetschecks.
- Parser-Versionen werden gespeichert.

### Dedupe Keys

Beispiele:

- Flatex Kontoumsaetze: `source + TA.Nr. + Buchungstag + Betrag`
- Flatex Depotumsaetze: `source + TA.Nr. + ISIN + Buchungstag + Nominal`
- Trade Republic: `source + transaction_id`
- Ginmon: `source + documentId + ISIN + Datum + Betrag`
- Intergold Preise: `source + Metall + Preisstand + Einheit + Ankauf + Verkauf`
- Intergold Belege: `source + DokumentHash + Metall + Menge + Datum`

### Reconciliation

Nach jedem Import prueft die App:

- Cash-Summe gegen Broker-Cash
- Positionsstueckzahlen gegen Broker-Snapshot
- Depotwert gegen Snapshot-Gesamtwert
- Anzahl importierter Zeilen gegen Erwartung
- Zeitraumsluecken seit letztem Import
- ungewoehnliche Abweichungen

Bei Abweichungen wird der Import nicht blind verworfen. Er wird markiert und im
Dashboard sichtbar gemacht.

## Anbieter-Strategie

### Flatex

MVP-Quellen:

- `Kontoumsaetze`
- `Depotumsaetze`
- `Depotuebersicht Klassische Ansicht`
- `Analytische Ansicht`

Postfach bleibt fuer den ersten App-Schritt draussen. Es ist Belegarchiv, aber
nicht noetig fuer aktuelle Werte.

Automation:

- Mac Studio startet Browser-Export ohne Session-TAN
- Zeitraum fuer laufende Updates: `Heute`
- Depotuebersicht taeglich oder mehrmals taeglich als Snapshot
- analytische Ansicht taeglich oder bei Bedarf

### Trade Republic

MVP-Quellen:

- `Transaction export.csv`
- `Account statement.pdf`
- `Net Worth.pdf`
- `Tax Report 2025.pdf`

Automation:

- wegen 2FA keine direkte Broker-Automation
- Nutzer erzeugt Reports am Handy
- Nutzer sendet Reports per Mail ohne Betreff
- Mac Studio Mail-Agent erkennt Anhaenge und legt sie ab
- Transaction Export woechentlich
- Account Statement monatlich
- Net Worth bei Bedarf oder zusammen mit Wochenlauf
- Tax Report jaehrlich

### Ginmon

MVP-Quellen:

- `Asset Status`
- `Account Statements`
- `Invoices`
- `Quarterly Reports`
- Strategie-Daten

Automation:

- Ginmon ist ohne 2FA gut automatisierbar
- Mac Studio kann Dokumente abrufen
- Asset Status monatlich
- Invoices sobald verfuegbar
- Quarterly Reports quartalsweise
- Strategie nur bei Aenderung

### Intergold

MVP-Quellen:

- oeffentliche Preis-Webseite
- Einlagerungsbestaetigungen per Mail/PDF
- spaeter Verkaufsbestaetigungen

Automation:

- Preise taeglich von der Webseite importieren
- Belege per Mail-Agent erkennen
- Bestand aus Belegen separat von Preisen fuehren
- Bewertung konservativ mit Ankaufspreis

### Bitget

MVP-Quelle:

- API oder manueller Export, je nachdem wie sauber der API-Zugriff eingerichtet
  wird

Automation:

- API ist langfristig sinnvoll
- fuer den Start reicht BTC-Snapshot
- Keys nur mit minimalen Leserechten verwenden

## Kurse und Aktualitaet

Die App braucht zwei Arten von Preisen:

- Broker-Snapshot: Was der Broker gerade fuer deinen Bestand anzeigt
- Marktpreis: unabhaengiger Kurs fuer Bewertung und Vergleich

Empfehlung:

- Im MVP Broker-Snapshots als Primaerquelle verwenden.
- Parallel eine externe Kursquelle vorbereiten.
- In der App anzeigen, welche Preisquelle verwendet wurde.
- Kurse nie still mischen, sondern mit `source` speichern.

Dadurch koennen schnelle Entscheidungen auf aktuellen Daten beruhen, aber die
Herkunft der Bewertung bleibt nachvollziehbar.

## MVP Reihenfolge

### Phase 1: Datenbasis

- Firebase Projekt einrichten
- Auth fuer einen Nutzer
- Storage-Struktur
- Firestore Collections
- ImportRun- und Document-Register
- Parser fuer vorhandene Dateien

### Phase 2: Anbieter importieren

- Flatex CSVs und Snapshots
- Trade Republic CSV und PDFs
- Ginmon Reports und Rechnungen
- Intergold Preise und Belege

### Phase 3: Dashboard

- Gesamtvermoegen
- Anbieterwerte
- Cash
- Positionen
- Performance
- Importstatus
- Abweichungen

### Phase 4: Automationen

- Mac Studio Import-Agent
- Mail-Watcher
- Flatex Browser-Export
- Ginmon Abruf
- Intergold Preisimport
- Bitget API

### Phase 5: Analyse und KI

- Ueberschneidungen zwischen Brokern
- Klumpenrisiken
- Kostenanalyse
- Performance je Quelle
- Handlungsvorschlaege
- Entscheidungslog mit Begruendung

## Noch offene Entscheidungen

Diese Entscheidungen muessen wir vor dem ersten Code treffen:

- Firebase Projektname und Region
- Login-Methode
- ob der Mac Studio Import-Agent lokal als Script oder kleine lokale App startet
- welche externe Kursquelle wir zuerst verwenden
- ob die App zunaechst nur dich als Nutzer kennt oder Multi-User-Struktur bekommt
- ob Originaldateien zusaetzlich lokal im Google-Drive-Depotordner bleiben

Empfehlung:

- Single-User-App starten
- Firebase Auth mit deiner Mail
- Firestore und Storage in einer EU-Region, sofern im Projekt waehlbar
- Mac Studio Import-Agent als lokales Node- oder Python-Tool
- Originaldateien lokal und in Firebase Storage halten
- externe Kursquelle erst nach stabilen Broker-Snapshots einbauen
