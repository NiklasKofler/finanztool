# Import Masterplan

Stand: 2026-06-28

## Hauptziel

Alle relevanten Depots, Bankkonten und Vermoegenswerte sollen moeglichst nah an Echtzeit in der App verfuegbar sein.

Wichtig:

- "Echtzeit" bedeutet in der Praxis je nach Quelle etwas anderes.
- Wo eine offizielle API vorhanden ist, ist echte oder nahezu echte Aktualisierung moeglich.
- Wo nur Dokumente oder Exporte verfuegbar sind, ist das Ziel "moeglichst aktuell", nicht sekunden-genau.

## Prioritaetslogik

1. Quellen mit hohem Vermoegenswert und aktiver Nutzung zuerst
2. Quellen mit stabiler Automatisierung vor manuellen Sonderfaellen
3. Erst saubere Datenbasis, dann feinere Bewertungen und spaeter KI

## Dashboard-Datenvertrag

Bevor neue Dashboards gebaut werden, muessen sie aus einer einheitlichen
Dashboard-Datenbasis lesen. Diese Schicht liegt in
`app/src/dashboard/dashboardSources.ts`.

Regeln:

- Eine Quelle kann fuer Dashboards `bereit`, `leer akzeptiert`,
  `nicht-blockierend auffaellig`, `blockierend` oder `pausiert` sein.
- Operative Fehler bleiben Fehler in der Health-/Agentenlogik, auch wenn sie
  ein Dashboard fachlich nicht blockieren.
- Capital.com und Trading 212 sind aktuell optionale beziehungsweise
  leere Quellen und duerfen Standard-Dashboards nicht blockieren.
- bank99 und N26 sind wegen geringem Wert und strengem API-Limit sichtbar,
  aber nicht dashboard-blockierend.
- Die sichtbare Quellenabdeckung im ersten Dashboard zaehlt alle integrierten
  Quellen. Optional/leere Quellen werden nicht herausgerechnet, sondern als
  leer akzeptiert markiert.
- Die Kachel `Aktive Quellen` ist eine Quellen-/Health-Abdeckung: Eine Quelle
  zaehlt aktiv, wenn sie operativ gesund ist und nicht blockiert ist. Ein
  aktueller Wert von 0 EUR macht eine Quelle nicht inaktiv, solange Agent/API
  `OK` sind.
- Operative Fehler aus `systemHealth/current` zaehlen gegen die betroffene
  Quelle. Doppelte Fehler derselben Quelle werden im Fehlerzaehler angezeigt,
  reduzieren `Aktive Quellen` aber nur einmal.
- Reparierbare Health-Alerts duerfen Aktionsbuttons erhalten. Diese schreiben
  nur einen Eintrag nach `automationCommands`; der Mac-Studio-Command-Runner
  fuehrt dann den passenden lokalen Agenten aus.
- Die Kern-Dashboards duerfen starten, sobald Flatex, Trade Republic,
  Ginmon, Intergold, Bitget, VBV, EquatePlus und Bankkonten eine verwertbare
  Sicht liefern.
- Die GUI zeigt die Quellenabdeckung direkt im ersten Vermoegens-Dashboard,
  bevor spaeter Performance-, Allokations-, Kosten- und Risiko-Dashboards
  darauf aufbauen.
- Allokations- und Positions-Dashboards verwenden die normalisierte
  `Assetklasse`, nicht die rohe Broker-Kategorie. Die Rohkategorie bleibt
  gespeichert und darf fuer Parser, Suche, Debugging und Tooltips genutzt
  werden, ist aber nicht die sichtbare Auswertungsdimension. Spaetere Agents
  und Backfills sollen die Felder `assetClass`, `assetClassLabel`,
  `assetClassConfidence` und `assetClassSource` dauerhaft in Firestore
  schreiben.
- Assetklassen duerfen nur aus Positionsdaten, vorhandenen normalisierten
  Feldern oder klaren Instrumentmerkmalen abgeleitet werden. Depotweite
  Pauschalregeln wie `Ginmon = ETF` oder `Flatex = Aktie` sind nicht erlaubt,
  weil einzelne Depots Cash, Aktien, ETFs, Fonds oder Sonderpositionen
  enthalten koennen.
- Eine rohe Kategorie `Wertpapier` wird fuer die sichtbare Tabelle nach
  vorrangiger ETF-/Fonds-/Cash-Erkennung als `Aktie` behandelt. Das ist eine
  UI-Normalisierung fuer aktuelle Einzelwerte und ersetzt nicht den spaeteren
  Firestore-Backfill mit echten `assetClass*` Feldern.

## Architekturregel fuer Agents

- Zuerst zaehlt die aktuelle Finanzlage in der App.
- Danach wird die Kurs-/Preis-Historie gespeichert.
- Danach werden Kosten, Steuern, Zinsen, Gebuehren und Produktdetails
  moeglichst vollstaendig nachgezogen.
- API-/Online-Integrationen sind gegenueber lokalen Studio-Agenten zu
  bevorzugen, wenn sie stabil und read-only moeglich sind.
- Der Mac Studio soll nur dort als Agent-Host noetig sein, wo lokale Logins,
  lokale Dateien oder Browser-Sessions technisch unvermeidbar sind.
- Agents duerfen nicht bei jedem Refresh unnoetig alte Historie neu
  herunterladen oder parsen. Sie muessen Dedupe, Cursors, Hashes,
  Dokumentstatus oder Provider-Zeitstempel nutzen.
- Der Mac Studio ist nicht das zentrale Archiv. Relevante Originale bleiben
  beim Broker/Provider oder in Firebase Storage/Drive nachvollziehbar; lokal
  benoetigte Kopien sind Arbeits- und Fallbackdaten.

## Quellenuebersicht

| Kategorie | Quelle | Aktivitaet | Prioritaet | Ziel-Aktualitaet | Primare Importmethode | Backup-Methode | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Broker | Flatex | aktiv | sehr hoch | Broker-Snapshot alle 5 Minuten, Dokumentexport taeglich | Headless Flatex-Broker-Snapshot | manueller CSV-Export | produktiv, Flatex ist primaere Kursquelle |
| Broker | Trade Republic | aktiv | sehr hoch | schneller Portal-Snapshot on demand, Dokumentscan gezielt | Portal-Agent | manueller Mobile-Export nur Notfall | Portalstrategie aktiv; Mail-/Manual-Agent Legacy |
| Robo-Advisor | Ginmon | aktiv | hoch | API alle 5 Minuten, Dokumente taeglich | Headless Ginmon-API + Dokumentagent | Browser-/Dokumentabruf | produktiv |
| Edelmetalle | Intergold | aktiv | hoch | Preise taeglich, Bestand bei neuem Beleg | Agent plus Preisimport | manueller Belegimport | teilweise produktiv |
| Krypto | Bitget | aktiv | hoch | alle 5 Minuten | API | CSV/Datei nur Notfall | produktiv auf Mac Studio |
| Mitarbeiteraktien | EquatePlus | aktiv einfach | mittel | Kurs per Kurs-Sync, Eingabe bei Aenderung | manuelle Novartis-Anteile/Einstandswert EUR + SIX-Kurs | spaeter Dokumentparser falls Mehrdaten | fuer Dashboard-Start ausreichend; keine Quelle `Quate Plus` |
| Bank | Bankkonten via Enable Banking | aktiv | mittel | wenige Abrufe pro Tag, bank99/N26 max. 2/Tag | read-only Open Banking ueber Enable Banking | Export oder manueller Eintrag | Erste/Sparkasse, Revolut, PayPal, N26 und bank99 angebunden; N26/bank99 strikt limitiert |
| Kreditkarte | Amazon Visa | aktiv einfach | mittel | Saldo/Kreditlinie stuendlich | Portal-Agent | manueller Portalcheck | fuer Dashboard-Start ausreichend; Details/Abrechnung spaeter |
| Kreditkarte | George Visa | pausiert | niedrig | keine | kein belastbarer Weg verfuegbar | manuell falls Loesung entsteht | aktuell keine Loesung; Erste/George-PSD2 liefert keine Kreditkarte |
| Kreditkarte | TF Bank Kreditkarte | aktiv einfach | mittel | Saldo/Kreditlinie alle 3 Stunden | Portal-Agent mit SMS-TAN | manueller Portalcheck | fuer Dashboard-Start ausreichend; Details/Abrechnung spaeter |
| Bank | Revolut | aktiv | mittel | wenige Abrufe pro Tag | read-only Open Banking ueber Enable Banking | Export oder manueller Eintrag | Session aktiv, Saldo importiert, API liefert aktuell keine Umsaetze |
| Broker | Trading 212 | aktiv | mittel | Snapshot alle 5 Minuten, History stuendlich | read-only Trading-212 Public API | CSV-Report-API spaeter fuer Interest-/Kontrollreports | angebunden; aktuell nur Cash relevant |
| Trading | Capital.com | derzeit inaktiv | niedrig | bei Reaktivierung taeglich | Export/API falls verfuegbar | manuell | LaunchAgent pausiert |
| Vorsorge | Betriebliche Altersvorsorge | passiv | niedrig | monatlich bis quartalsweise | manueller Eintrag in der App | manueller Belegimport | entschieden |

## Zielbild pro Quelle

### 1. Flatex

- Ziel: Transaktionen, Cash, Positionen und aktueller Broker-Stand in der App
- Realistisch: kein echtes Streaming, aber sehr gute Aktualitaet ueber
  regelmaessige Broker-Snapshots
- Methode:
  - primaer headless `Flatex-Broker-Snapshot` alle 5 Minuten
  - CSV-/Dokumentexport getrennt taeglich um 22:10
- Zusatz:
  - laufender Bestand wird rechnerisch aus Depot- und Kontoumsaetzen gebildet
  - aktueller Depot-Snapshot aus der Flatex-Oberflaeche ist primaere
    Bewertungsquelle fuer Flatex
  - Flatex selbst ist primaere Kursquelle fuer Flatex
  - Boerse-Frankfurt-Kurse duerfen Flatex-Brokerwerte nicht still ueberschreiben
  - Postbox bleibt optionales Belegarchiv

### 2. Trade Republic

- Ziel: Positionen, Einstand, aktueller Marktwert, Cash, Performance
- Realistisch:
  - aktueller Stand kommt primaer aus dem authentifizierten Webportal
  - der schnelle App-Refresh darf keinen Vollscan alter Dokumente erzwingen
  - Dokumente/Reports bleiben fuer Kosten, Steuern, Zinsen und
    Nachvollziehbarkeit wichtig
- Methode:
  - primaer `Portal-Agent`
  - App-Button `Trade Republic: Refresh` startet den schnellen Portal-Snapshot
  - voller Portal-Scan wird nur gezielt oder zeitlich geplant genutzt
  - Login-Freigabe erfolgt durch den Nutzer in der Trade-Republic-App
- Zusatz:
  - alte Mail-/Manual-Export-Agenten sind Legacy und nicht produktiver Standard
  - selbst gemailte App-Exporte bleiben nur Notfall-/Kontrollkanal
  - Portal-Dokumente und Tax-/Transaction-Fakten muessen in
    `transactions`, `ledgerEntries`, `costEvents` und `incomeEvents`
    normalisiert werden
- Abschlussstand 2026-06-27:
  - Portal-Agent `OK`
  - keine offenen Trade-Republic-Dokumente
  - aktueller schneller Refresh abgeschlossen
  - fuer den aktuellen Ausbaustand abgeschlossen

### 3. Ginmon

- Ziel: aktueller Bestand, Marktwert, Gebuehren, Einzahlungen
- Realistisch: API-nahe Aktualitaet fuer Werte/Kurse; Dokumente fuer
  Stueckzahlen, Kosten und Nachvollziehbarkeit
- Methode:
  - Ginmon-API alle 5 Minuten headless
  - Dokumente taeglich um 02:00 headless
- Zusatz:
  - Dokumente und API bleiben getrennte Datenquellen

### 4. Intergold

- Ziel: metallgenauer Bestand plus taegliche Bewertung mit Intergold-Preisen
- Realistisch:
  - Preise taeglich oder mehrmals taeglich
  - Bestand aktualisiert bei neuen Einlagerungs-/Verkaufsbelegen
- Methode:
  - Preise: `Agent`/Script
  - Belege: `Agent`
- Zusatz:
  - Preisimport und Belegimport bleiben getrennt
  - Kauf-/Einlagerungsbelege werden als `sourceDocuments`,
    `sourceDocumentFacts`, `transactions` und `costEvents` gespeichert
  - sonstige Intergold-Anhaenge bleiben als Info-/Review-Dokumente im
    zentralen Dokumenten-Postfach
  - Verkaufs-/Auslagerungsdokumente werden erst gebucht, wenn echte
    Verkaufsdaten vorliegen und der Parser dafuer explizit gebaut wurde

### 5. Bitget

- Ziel: Wallet, offene Positionen, Cash, Marktwerte moeglichst live
- Realistisch: das ist die beste Quelle fuer echte API-Naehe
- Methode:
  - primaer `API`
  - spaeter automatischer Polling-Job
- Zusatz:
  - neuer API-Key `Finanztool-Codex` ist ausschliesslich Read-only
  - Spot- und Earn-Bestand werden erfasst
  - kontenuebergreifender Bitget-Wert wird fuer die Summary verwendet
  - automatische Aktualisierung laeuft auf dem Mac Studio alle 5 Minuten
  - der 5-Minuten-Lauf ueberschreibt `imports/api_bitget_latest` und
    `rawDocuments/api_bitget_latest`; er erzeugt keine endlose 5-Minuten-
    Historie
  - zusaetzlicher Bitget-Ledger-Agent laeuft stuendlich und schreibt Bills,
    Fills, Fees, Earn-Zinsen und Tax-Facts historisch/idempotent nach Firestore
  - der Ledger-Agent arbeitet im Normalbetrieb inkrementell:
    Startpunkt ist das letzte erfolgreiche Fensterende minus
    `BITGET_LEDGER_OVERLAP_DAYS` (Standard 2 Tage); ein voller Backfill laeuft
    nur bewusst mit `--backfill`, `--full` oder
    `BITGET_LEDGER_FORCE_BACKFILL=true`
  - Ledger-Teilabrufe mit Rate-Limit/Netzwerkfehler schreiben `WARNUNG` plus
    `warnings`; sie duerfen nicht still als voller OK-Lauf erscheinen
  - Transparenzfelder:
    - `sourceDataUpdatedAt` / `sourceDataProvider=bitget_api`
    - `quoteDataUpdatedAt` / `quoteDataProvider=bitget_api`
    - `lastAgentRunAt` / `lastAgentSuccessAt`
  - Bitget wird fuer Bitget-only bewertet: keine CoinGecko- oder
    Frankfurter-Boerse-Fallbacks fuer Krypto
  - aktueller sauberer Schnitt:
    - `sourcePositions` enthaelt nur die aktuelle Portfolioansicht
    - TRUMP, MELANIA und Nicht-Cash-Dust unter `1 EUR` sind aus der
      Portfolioansicht ausgeschlossen
    - diese Rohbestaende bleiben im Rohsnapshot unter `rawPositions` und
      `excludedPositions` nachvollziehbar
  - historische Exporte von 13.06.2024 bis 13.06.2026 sind gesichert
  - TRUMP- und MELANIA-Einstand sind in USDT verifiziert
  - BTC-Einstand `3.000 EUR` ist aktuell nutzerbestaetigt in
    `sourceCostBasis`; langfristig soll er mit Bank-/Kreditkartendaten
    rekonstruiert werden

### 6. EquatePlus

- Ziel: Mitarbeiteraktien sauber im Gesamtvermoegen zeigen
- Realistisch: fuer den aktuellen Bedarf abgeschlossen; aktueller Stand bleibt
  mit manueller Eingabe und SIX-Kurs sichtbar
- Methode:
  - Nutzer pflegt in der App `Anteile` und den gesamten `Einstandswert EUR`
  - Agent `sync-equateplus-manual-local.mjs` liest
    `manualInputs/equateplus_novartis`
  - aktueller Novartis-Kurs kommt von SIX Swiss Exchange fuer
    `CH0012005267CHF4`
  - CHF/EUR kommt ueber Frankfurter/ECB-FX
  - schreibt `sourcePositions`, `sourceSummaries`, `quotesCurrent`,
    `agentStatus` und optional `priceHistory`
  - keine Dokumentannahmen fuer Vesting, Steuern, Kosten oder Transaktionen,
    bevor echte EquatePlus-Dokumente mit Mehrdaten vorliegen
  - fachlicher Status 2026-06-27: Depotbestand, Einstand und G/V reichen
    vorerst, weil hier durch den Mitarbeiterbonus nur geringe Bewegung
    erwartet wird

### 7. Bankkonten ueber Enable Banking

- Ziel: Bankguthaben und Zahlungsstrukturen im Gesamtbild
- Realistisch: wenige Abrufe pro Tag ausreichend; bank99 und N26 maximal
  2 Abrufe pro Tag
- Methode:
  - read-only `API` ueber Enable Banking
  - nicht selbst als regulierter Kontoinformationsdienst auftreten
  - Enable-Banking-App ist aktiv und auf eigene verlinkte Konten
    eingeschraenkt
  - Balance-Import schreibt `sourceSummaries`, `sourcePositions`,
    `sourceAccounts`, `imports` und `agentStatus`
  - Quelle ist generisch `bank_accounts`
  - stuendlicher Standard-Agent: Erste/Sparkasse, Revolut und PayPal
  - N26 und bank99 bleiben wegen Abruflimit separate Agenten um 06:00 und
    16:00
  - N26/bank99 duerfen nur mit `--allow-limited-bank-read` gelesen werden,
    damit `sync:all`, GUI-Button und Testlaeufe sie nicht versehentlich
    ausloesen
  - echte Kontostaende zaehlen als Cash/Netto-Wert und damit zum Vermoegen
  - verfuegbar inkl. Kredit wird separat gespeichert und nicht als Vermoegen
    gezaehlt
- Zusatz:
  - wichtig fuer Gesamtvermoegen, Cash, Kreditlinien und spaetere
    Ausgabenanalyse
  - Transaktionen werden je Konto idempotent in `ledgerEntries` gespeichert
  - Initialbestand ist vorhanden; fuer neu angebundene Konten liest der erste
    Transaktionsimport standardmaessig 92 Tage. Normaler Sync ist danach
    inkrementell ab letztem gespeicherten Umsatz je Konto minus 2 Tage
    Sicherheitsfenster
  - Backfill: `npm run sync:bank-accounts:backfill` fuer 180 Tage
  - Bankkosten/Steuern werden als `costEvents`, Zinsen/Bonus/Cashback als
    `incomeEvents` abgeleitet, wenn der Umsatztext eindeutig ist
  - Bankumsaetze haben einen fachlichen `dedupeKey`; alte bank99-Duplikate
    werden als `DUPLICATE` markiert und aus Analyse/GUI herausgefiltert
  - keine Zahlungsfunktion und kein Bank-Web-Scraping
  - eigener Detailplan:
    `docs/sparkasse_george_integration_plan.md`

### 8. Amazon Visa

- Ziel: offener Kreditkartensaldo als negativer Vermoegenswert plus
  Verfuegbarkeit und Kreditlimit als Transparenzwerte
- Status: im Datenbasis-Cleanup zurueckgestellt
- Methode:
  - spaeter Portal-Agent gegen Amazon-Visa/Openbankpay
  - Zugangsdaten nur im macOS-Schluesselbund
  - Firestore: Kreditkarten-Unterkonto in `sourceSummaries/bank_accounts`,
    `sourcePositions/bank_accounts_amazon_visa_card`,
    `sourceAccounts/bank_accounts_amazon_visa_card`, `agentStatus/amazon_visa`
- Zusatz:
  - Kreditlimit und verfuegbarer Betrag zaehlen nicht als Vermoegen
  - spaeter: Abrechnungen/Transaktionen/Kosten, falls Portal/Export stabil
    verfuegbar

### 9. George Visa

- Ziel: offener Kreditkartensaldo und Transaktionen
- Status: im Datenbasis-Cleanup zurueckgestellt
- Methode:
  - bevorzugt `API` ueber denselben Open-Banking-Anbieter, falls unterstuetzt
  - sonst `Agent` ueber Abrechnung/Export
- Stand:
  - pausiert, weil Enable Banking fuer Erste/Sparkasse aktuell keine
    Kreditkarte liefert

### 10. TF Bank Kreditkarte

- Ziel: offener Kreditkartensaldo als negativer Vermoegenswert; spaeter
  Transaktionen und Kosten
- Status: im Datenbasis-Cleanup zurueckgestellt
- Methode:
  - spaeter Portal-Agent gegen `meine.tfbank.at`
  - Zugangsdaten nur im macOS-Schluesselbund
  - SMS-TAN wird nicht gespeichert; erster Lauf kann Nutzer-TAN benoetigen
- Stand:
  - Agent fuellt Login aus und erkennt SMS-TAN
  - `--tan-stdin` erlaubt Eingabe des frischen Codes im selben Browserlauf
  - Firestore: Kreditkarten-Unterkonto in `sourceSummaries/bank_accounts`,
    `sourcePositions/bank_accounts_tfbank_card`,
    `sourceAccounts/bank_accounts_tfbank_card`, `agentStatus/tfbank`

### 11. Revolut

- Ziel: als Unterkonto der Bankkonten im Gesamtgeldstand enthalten
- Methode:
  - read-only Open Banking ueber Enable Banking
  - kein eigener Depot-/Kreditkarten-Agent
  - Datenstand beobachten, weil die API zuletzt keine Umsaetze geliefert hat

### 12. Trading 212

- Ziel: aktuelle Trading-212-Positionen, Cash, Einstandswerte, Dividenden,
  Orders, Steuern/Gebuehren und Cash-Bewegungen in derselben Datenbasis wie
  die anderen Broker speichern.
- Methode:
  - offizielle read-only Trading-212 Public API
  - Secrets lokal im macOS-Schluesselbund:
    `finanztool-trading212-api-key` und
    `finanztool-trading212-api-secret`
  - Snapshot-Agent: `sync-trading212-local.mjs --write --snapshot-only`
    alle 5 Minuten fuer aktuelle Positionen, Kurse, Cash und Performance
  - History-Agent: `sync-trading212-local.mjs --write` stuendlich fuer Orders,
    Dividenden, Transaktionen, Steuern und Gebuehren
  - CSV-Report-Endpunkte sind im Client vorbereitet, damit spaeter
    Interest-/Kontrollreports mit `includeInterest` angebunden werden koennen
- Speicherung:
  - `sourceSummaries/trading212`: Gesamtstand inkl. Cash
  - `sourcePositions/trading212_*`: aktuelle Positionen; geschlossene
    Positionen werden aus der aktuellen Ansicht entfernt
  - `ledgerEntries`: Orders, Dividenden und Cash-Bewegungen
  - `costEvents`: Order-Steuern/Gebuehren und `FEE`-Transaktionen
  - `incomeEvents`: Dividenden
  - `rawDocuments/api_trading212_latest`: letzter API-Rohstand zur Kontrolle
  - `agentStatus/trading212`: letzter Lauf, Fehler, Rate-Limit-Infos
- Effizienz:
  - aktuelle Positionen werden voll ersetzt, damit neue/geschlossene
    Positionen automatisch erkannt werden
  - History-Sync nutzt den letzten erfolgreichen History-Zeitpunkt mit
    kleinem Overlap, damit keine alten Daten unnoetig neu verarbeitet werden
  - Dedupe erfolgt ueber stabile Trading-212-IDs beziehungsweise Hashes
- Stand:
  - API-Key und Secret sind im macOS-Schluesselbund gespeichert
  - API-Direkttest und Agent-Dry-Run erfolgreich
  - Firestore-Schreibtest erfolgreich: aktuell 10 EUR Cash, 0 offene
    Positionen, 1 Cash-Transaktion
  - LaunchAgents installiert:
    `com.niklas.finanztool.trading212-sync` und
    `com.niklas.finanztool.trading212-history`
  - `sync:all`/`Alles aktualisieren` laeuft Trading 212 automatisch mit,
    solange die lokalen Secrets vorhanden sind

### 13. Capital.com

- Ziel: bald nutzbar machen, sobald der API-Key erneuert ist
- Methode:
  - offizielle Capital.com API
  - lesende Endpunkte: `POST /session`, `GET /session`, `GET /accounts`,
    `GET /positions`, `GET /workingorders`, `GET /history/transactions`,
    `GET /history/activity`
  - aktueller gespeicherter Stand: Live-Konto, `0,00 EUR`, 0 Positionen
  - bei gueltigem Key werden neben aktuellen Positionen auch History-Fakten,
    Ledger, Kosten und Ertraege geschrieben
  - Pruefung 2026-06-27: vorhandener Schluesselbund-Key ist ungueltig
    (`401 error.invalid.api.key`)
  - naechster Schritt: neuen API-Key erzeugen, `setup:capitalcom`,
    `check:capitalcom`, danach optional Agent aktivieren

### 14. Betriebliche Altersvorsorge

- Ziel: langfristige Vermoegenskomponente im Gesamtbild
- Realistisch: fachlicher Datenwechsel selten, aber taegliche technische
  Pruefung ist robust und erzeugt keine Dubletten
- Methode:
  - `Meine VBV` Portal-Stichtag
  - PDF-Kontoinformation als Primaerbeleg
  - Speicherung in `sourceSummaries`, `sourceDocuments` und
    `sourceDocumentFacts`

## Importmethoden - klare Definition

### API

Verwendung, wenn:

- eine stabile offizielle oder praktikable Schnittstelle existiert
- Aktualitaet hoch sein soll
- keine manuelle Dateiablage noetig ist

Aktuelle Hauptquelle:

- Bitget
- Bankkonten ueber Enable Banking

### Agent

Verwendung, wenn:

- Dateien, Mails oder Webdaten lokal verfuegbar sind
- der Mac Studio als dauerhafter Importknoten dient
- Dateien automatisch erkannt und verarbeitet werden koennen

Aktuelle Hauptquellen:

- Flatex
- Trade Republic
- Ginmon
- Intergold
- EquatePlus Kurs-Agent fuer Novartis/SIX plus manuelle Eingabe bleibt
  technisch vorhanden, wird aber im Datenbasis-Cleanup nicht erweitert

### Manueller Eintrag

Verwendung, wenn:

- Quelle selten aktualisiert wird
- keine stabile API/Exportstrecke existiert
- Aufwand fuer Automatisierung zunaechst nicht lohnt

Aktuelle Hauptquellen:

- Betriebliche Altersvorsorge
- EquatePlus-Anteile und Einstandswert EUR
- Kreditkarten-Details, bis der Datenbasis-Cleanup der Kernquellen fertig ist

## Empfohlene Umsetzungsreihenfolge

### Phase 1 - Dashboard-Vertrag und Datenqualitaet

1. Datenqualitaetsuebersicht bauen: je Quelle letzter Datenstand,
   letzter Agentlauf, Status, Wert, Positionen, Transaktionen, Kosten und
   Ertraege.
2. Dashboard-Datenvertrag festlegen:
   `sourceSummaries`, `sourcePositions`, `priceHistory`, `ledgerEntries`,
   `costEvents`, `incomeEvents`, `agentStatus` und `systemHealth`.
3. Importumfang fuer ersten Dashboard-Ausbau einfrieren:
   alle aktuell vorhandenen Quellen sind ausreichend angebunden; George Visa
   bleibt pausiert, weil keine Loesung verfuegbar ist.
4. bank99/N26 nur beobachten, aber nicht blockieren: beide sind klein und
   strikt limitiert.

### Phase 2 - Agenten effizient halten

1. Schnelle Snapshot-Agenten duerfen alte Historie nicht neu scannen
2. Dokument-Agenten nutzen Hashes, Provider-IDs, Cursor und
   Dokumentzeitstempel
3. Full-Scans laufen nur gezielt oder zu geplanten Zeiten
4. Technischer Agentlauf, fachliche Datenveraenderung, Dokumentstand und
   Kursstand bleiben getrennt sichtbar
5. Der zentrale Quote-Lauf schreibt im 5-Minuten-Takt `priceHistory`-Buckets
   fuer Instrumente und Positionen. Diese Buckets sind die Datenbasis fuer
   Intraday-Charts und Hover-/Touch-Auslesung in der App.

### Phase 3 - Dashboards

1. Vermoegensuebersicht: Gesamtwert, Cash, Kredit, Depotwert, Tagesaenderung.
2. Allokation: Quelle, Assetklasse, Waehrung, Einzelposition.
3. Performance: G/V absolut/prozentual, Tagesveraenderung, Verlauf.
4. Kosten/Ertraege: Fees, Steuern, Zinsen, Dividenden, Cashback/Bonus.
5. Risiko/Transparenz: Datenstand, Quelle, Warnstatus und fehlende Daten.
6. KI-Ueberwachung erst auf normalisierten Events und sichtbarer
   Datenqualitaet aufsetzen.

### Phase 4 - Zurueckgestellte Quellen

1. George Visa nur wieder aufnehmen, falls ein belastbarer Weg entsteht.
2. Kreditkarten-Abrechnungen/Detailtransaktionen fuer Amazon Visa und TF Bank
   nur nachziehen, wenn sie fuer Kosten-/Abo-Dashboards gebraucht werden.
3. EquatePlus-Dokumentparser nur ergaenzen, wenn echte Dokumente relevante
   Zusatzdaten liefern.
4. Capital.com bleibt beobachtbar, aber aktuell bei 0 und nicht
   dashboard-blockierend.

## Wichtigste offene Entscheidungen

1. Reicht `costEvents` fuer Steuern dauerhaft oder brauchen Jahressteuer-
   Dashboards spaeter eine eigene `taxEvents`-Collection?
2. Welche Trade-Republic-Portal-Dokumenttypen decken Tax, Kosten, Zinsen und
   Private Markets vollstaendig ab?
3. Welche Intergold-Belege fehlen fuer eine vollstaendige Metall-Transaktions-
   und Kostenbasis?

## Arbeitsregel fuer die naechsten Sessions

Wenn eine neue Quelle diskutiert wird, dokumentieren wir immer sofort:

1. Quelle
2. Prioritaet
3. Ziel-Aktualitaet
4. Importmethode: `API`, `Agent` oder `manuell`
5. Was als "fertig" fuer diese Quelle gilt

Zusatzregel Datenhaltung:

- Vor jeder neuen Quelle oder groesseren Agent-Aenderung
  `docs/firestore_data_contract.md` pruefen.
- Keine Quelle soll dauerhaft ein Sondermodell bekommen.
- Aktuelle Werte muessen in `sourcePositions`/`sourceSummaries` landen.
- Bewegungen, Kosten, Zinsen, Steuern und Dokumentfakten muessen historisch in
  den kanonischen Collections gespeichert werden.

Zusatzregel Warnsystem und Reparatur:

- `systemHealth/current` ist die zentrale Wahrheit fuer operative Fehler und
  Warnungen.
- Quellenkarten muessen Health-Fehler derselben Quelle uebernehmen; es darf
  keine Quelle gleichzeitig in der Karte `OK` und oben im Systemstatus `Fehler`
  sein.
- `Aktive Quellen` zaehlt eindeutige Quellen, nicht einzelne Fehlermeldungen.
  Mehrere Fehler derselben Quelle ziehen nur eine aktive Quelle ab.
- Reparierbare Fehler sollen direkt in der Warnliste eine Aktion anbieten,
  z. B. Trade-Republic-Portal-Refresh, TF-Bank-Refresh oder
  Capital.com-Refresh.
- TF Bank bekommt bei TAN-Problemen eine eigene Debugspur. Abgesendete TANs
  werden nur als Hash lokal gemerkt, damit ein bereits verbrauchter SMS-Code
  nie erneut verwendet wird. Feste Zusatzwartezeiten bleiben standardmaessig
  deaktiviert; der Agent akzeptiert nur neue und nicht verwendete Codes.
- Capital.com ist wieder als 5-Minuten-LaunchAgent aktiv. Stale-Fehler bei
  Capital.com bedeuten kuenftig API-/Agentproblem, nicht mehr "Agent fehlt".
