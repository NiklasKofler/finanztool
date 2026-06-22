# Firestore Data Contract

Stand: 2026-06-21

Dieses Dokument beschreibt die kanonische Firestore-Struktur fuer alle Quellen.
Es ist die Leitplanke, damit Flatex, Trade Republic, Ginmon, Intergold, Bitget,
Capital.com, VBV, EquatePlus und spaeter Bankkonten/Kreditkarten vergleichbar
gespeichert werden.

## Grundsatz

Jede Quelle darf andere Importwege haben, aber nicht dauerhaft ein eigenes
Sondermodell. Parser und Agents muessen ihre Daten in dieselben fachlichen
Collections schreiben.

Die App zeigt aktuelle Werte aus `sourcePositions` und `sourceSummaries`.
Analysen, Kosten, Zinsen, Steuern und Nachvollziehbarkeit kommen aus den
historischen Collections.

## Ebenenmodell

### 1. Rohdaten und Importlaeufe

- `imports`
  - ein Datensatz je Importlauf oder API-Sync
  - enthaelt Status, Counts, Warnungen, Fehler, Zeitraum, Parser-/Agent-Version
- `rawDocuments`
  - Rohsnapshot einer API oder Datei
  - darf ueberschrieben werden, wenn es explizit ein `latest`-Snapshot ist
  - historische Dateien/Snapshots muessen ueber stabile IDs erhalten bleiben
- `sourceDocuments`
  - Dokumentenregister fuer PDFs, CSVs, Kontoauszuege, Reports, Steuerbelege
  - Dokumente werden nie fachlich geloescht, sondern als `obsolete`,
    `duplicate`, `parsed`, `unknown` oder `failed` markiert
- `sourceDocumentFacts`
  - alle fachlich relevanten Fakten aus Dokumenten
  - Beispiele: Depotposition aus Statement, Steuerzeile, Kostenzeile,
    Kontoauszugssaldo, Zinsbuchung, Belegposition

Regel: Wenn ein Dokument Informationen enthaelt, die spaeter fuer Analyse,
Kosten, Steuern, Performance oder Reconciliation nuetzlich sein koennen, muessen
sie mindestens als `sourceDocumentFacts` gespeichert werden.

### 2. Bewegungen, Kosten und Ertraege

- `ledgerEntries`
  - Konto-/Wallet-/Depotbuchungen auf Cash- oder Asset-Ebene
  - Beispiele: Einzahlungen, Auszahlungen, Umbuchungen, Zinsen, Saldenbewegungen
- `transactions`
  - Wertpapier-/Krypto-/Metall-Transaktionen
  - Beispiele: Kauf, Verkauf, Sparplan, Split, Transfer, Einlagerung, Auslagerung
- `costEvents`
  - explizite Kosten, Gebuehren, Spreads, Steuern oder sonstige Belastungen
  - Kosten bleiben auch dann erhalten, wenn die Position spaeter geschlossen ist
- `incomeEvents`
  - explizite Ertraege
  - Beispiele: Dividenden, Zinsen, Earn-Rewards, Cashback, Ausschuttungen

Regel: Einstand, Gewinn/Verlust und Performance duerfen nicht nur aus aktuellen
Snapshots geraten werden. Wenn Bewegungsdaten verfuegbar sind, muessen sie in
`transactions`, `ledgerEntries`, `costEvents` und `incomeEvents` landen.

### 3. Aktueller Stand

- `sourcePositions`
  - aktuelle sichtbare Positionen je Quelle
  - darf je Quelle bei jedem erfolgreichen Sync neu geschrieben werden
  - geschlossene Positionen werden nicht als aktuelle Position gezeigt
  - historische Bewegung bleibt in `transactions`, `ledgerEntries`,
    `costEvents`, `incomeEvents` und `sourceDocumentFacts`
- `sourceSummaries`
  - aktueller Gesamtstand je Quelle
  - wichtige Felder: `netValue`, `depotValue`, `cashValue`, `costValue`,
    `performanceValue`, `performancePct`, `updatedAt`, `valuationDate`
- `sourceAccounts`
  - erkannte Unterkonten, Depots, Portfolios, Cashkonten, Wallets oder Karten
  - neue Unterkonten muessen automatisch erkannt werden
  - verschwundene Unterkonten werden als `inactive` oder `closed` markiert,
    nicht still vergessen

Regel: Jede Quelle muss Veraenderungen in Unterkonten und Positionen erkennen:
neue Positionen erscheinen, geschlossene Positionen verschwinden aus der
aktuellen Ansicht, bleiben aber historisch nachvollziehbar.

### 3a. Transparenzpflicht fuer Aktualitaet und Wahrheit

Ab 2026-06-21 gilt fuer jede bestehende und jede neue Quelle:

- Broker-/API-/Dokumentstand und Bewertungs-/Kursstand muessen getrennt
  gespeichert und in der GUI getrennt erkennbar sein.
- Ein Agent-Lauf ist nicht dasselbe wie eine fachliche Datenveraenderung.
  `agentStatus.updatedAt` zeigt nur, wann der Agent zuletzt gelaufen ist.
- Ein Brokerstand zeigt, wann Positionen, Cash, Kredit, Einstand,
  Unterkonten und Bewegungen zuletzt aus der primaeren Quelle kamen.
- Ein Dokumentstand zeigt, wann Dokumente zuletzt exportiert/importiert und
  fachlich geparst wurden.
- Ein Kursstand zeigt, wann Preise/Bewertungen zuletzt geholt wurden und
  von welchem Provider sie stammen.
- Wenn ein Kurs von einer externen Webseite oder Boerse kommt, darf er nicht
  als Broker-Aktualisierung erscheinen.
- Wenn der Agent erfolgreich laeuft, aber die Website/API keine neuen Preise
  oder Daten liefert, muss das erkennbar bleiben: letzter Agentlauf und letzte
  fachliche Aenderung sind unterschiedliche Zeitpunkte.

Pflichtfelder bzw. kanonische Bedeutung:

- `sourceDataUpdatedAt`: letzter fachlicher Stand der Primaerquelle
  fuer Bestand/Cash/Kredit/Einstand.
- `sourceDataProvider`: z. B. `flatex_broker`, `traderepublic_mail`,
  `ginmon_api`, `bitget_api`, `vbv_portal`,
  `vbv_account_information_pdf`.
- `documentDataUpdatedAt`: letzter fachlich importierter Dokumentstand.
- `documentDataProvider`: z. B. `ginmon_documents`,
  `traderepublic_statement_pdf`, `flatex_postbox`,
  `vbv_account_information_pdf`.
- `quoteDataUpdatedAt`: letzter fachlicher Kurs-/Preisstand.
- `quoteDataProvider`: z. B. `boerse-frankfurt`, `bitget`,
  `ginmon_api`, `intergold_website`.
- `quoteDataChangedAt`: Zeitpunkt der letzten erkannten Preisveraenderung,
  wenn Agentlaeufe haeufiger als Preisveraenderungen sind.
- `lastAgentRunAt`: letzter technischer Lauf des jeweiligen Agents.
- `lastAgentSuccessAt`: letzter technisch erfolgreicher Lauf.
- `lastDataChangeAt`: letzter Lauf, der den fachlichen Stand veraendert hat.

GUI-Regel:

- Depotkarten muessen mindestens zeigen, soweit fuer die Quelle relevant:
  `Brokerstand` oder `Datenstand`, `Kursstand`, `Agent zuletzt`.
- Agenten duerfen in der GUI nicht nur als pauschales `OK` erscheinen. Je
  Quelle muss sichtbar sein:
  - welcher Agent gelaufen ist
  - wofuer dieser Agent fachlich zustaendig ist
  - wann der letzte technische Lauf war
  - ob das Ergebnis `OK`, `WARNUNG`, `FEHLER` oder `RUNNING` war
  - bei abweichendem Zeitpunkt: wann der letzte erfolgreiche Lauf war
- Agenten werden in Depotkarten nicht als Kacheln dargestellt. Auf
  iPhone-15-Breite und kleiner sind sie kompakte Zeilen ohne Boxhintergrund
  und ohne umlaufenden Rahmen; Aufgabenbeschreibungen duerfen dort
  ausgeblendet werden, damit Name, Status und Zeitstempel lesbar bleiben.
- Positionen muessen fuer Analyse sichtbar machen, ob ihr aktueller Wert aus
  Broker/API, Dokument oder externem Kursprovider stammt.
- `updatedAt` allein darf in der GUI nicht als fachliche Wahrheit angezeigt
  werden, wenn differenziertere Felder vorhanden sind.

### 4. Instrumente, Kurse und Historie

- `instrumentMappings`
  - Mapping von Broker-/Quell-IDs auf kanonische Instrumente
- `instruments`
  - Stammdaten eines Instruments, z. B. ISIN, WKN, Symbol, Name, Assetklasse
- `quotesCurrent`
  - letzter bekannter Kurs je Instrument
  - wird fuer frische App-Anzeige haeufig ueberschrieben
  - wichtige Felder: `price`, `priceEur`, `currency`, `provider`,
    `providerSymbol`, `quoteVenue`, `asOf`, `fetchedAt`,
    `quoteAgeMinutes`, `quoteFreshness`, `status`
- `priceHistory`
  - Tageshistorie fuer Positions-/Instrumentwerte
  - Ziel: taeglich um 22:00 speichern, damit Tagesveraenderung und Charts
    moeglich sind
- `intergoldPrices` und `intergoldPriceHistory`
  - aktuell noch quellenspezifisch fuer Metallpreise
  - muessen fuer Auswertung immer auf die kanonische Position-/Kurslogik
    abbildbar bleiben

Regel: Kurse werden nicht unsichtbar zwischen Quellen gemischt. Jede Bewertung
muss `priceSource` oder `quoteProvider`, `quoteStatus`, `valuationDate` oder
`quoteAsOf` und soweit moeglich `quoteVenue`, `quoteFetchedAt` und
`quoteFreshness` tragen. `updatedAt` bedeutet nur Schreibzeitpunkt des Agents,
nicht zwingend Kurszeitpunkt.

Regel: Fuer Preisquellen mit haeufigen Agentlaeufen muss neben dem letzten
Abruf auch die letzte fachliche Preisaenderung gespeichert werden. Beispiel:
Intergold kann taeglich vom Agent abgerufen werden, aber die Websitepreise
koennen unveraendert bleiben. Dann gilt:

- `lastAgentSuccessAt`: letzter erfolgreicher Abruf
- `quoteDataUpdatedAt`: Preisstand laut Quelle oder Abrufzeitpunkt der
  aktuellen Preisantwort
- `quoteDataChangedAt`: letzter Zeitpunkt, an dem mindestens ein Preiswert
  gegenueber dem vorherigen Stand geaendert wurde

### 5. Overrides und Health

- `sourceCostBasis`
  - manuelle oder einmalig rekonstruierte Einstandswerte
  - nur mit Quelle, Begruendung und Datum verwenden
- `agentStatus`
  - Status je Agent, z. B. `bitget`, `bitget_ledger`, `ginmon_documents`
- `systemHealth`
  - aggregierte Warnungen und Fehler fuer die GUI
- `automationCommands`
  - App-zu-Agent-Kommandos, z. B. manueller Kurs-Sync

Regel: Wenn ein Agent Daten nicht vollstaendig oder plausibel liefern kann,
muss daraus eine sichtbare Warnung entstehen. Ein `OK` darf nur bedeuten:
letzter Lauf technisch erfolgreich und fachliche Plausibilitaet innerhalb der
definierten Toleranz.

## Pflichtcheck je Quelle

Eine Quelle gilt erst als sauber integriert, wenn diese Punkte dokumentiert und
technisch abgedeckt sind:

1. Welche Rohdaten/API-Endpunkte/Dokumente sind verfuegbar?
2. Welche Daten werden in `rawDocuments` oder `sourceDocuments` abgelegt?
3. Welche Fakten werden in `sourceDocumentFacts` gespeichert?
4. Welche Bewegungen entstehen in `transactions` und `ledgerEntries`?
5. Welche Kosten entstehen in `costEvents`?
6. Welche Ertraege entstehen in `incomeEvents`?
7. Wie entstehen aktuelle `sourcePositions`?
8. Wie entsteht `sourceSummaries/{source}`?
9. Wie werden neue/geschlossene Positionen und Unterkonten erkannt?
10. Welche Reconciliation prueft die Quelle gegen Broker-/API-/Dokumentwerte?
11. Welche Warnung entsteht, wenn ein Dokumenttyp oder API-Feld neu/unbekannt ist?
12. Welche Daten fehlen bewusst und wie werden sie spaeter nachgezogen?

## Quellenstatus

### Bitget

- Aktuelle Positionen und Summary kommen aus der Bitget-API.
- Ledger-Agent schreibt stuendlich Bills, Fills, Fees, Earn-Zinsen und Tax-Facts.
- TRUMP, MELANIA und auf `0,00 EUR` rundende Dust-Positionen sind aus der
  aktuellen Portfolioansicht ausgeschlossen, aber im Rohsnapshot nachvollziehbar.
- Historische Vollstaendigkeit ist auf die API-Fenster begrenzt und braucht bei
  Bedarf spaeter Export-Backfill.

### Flatex

- Aktuelle Flatex-Positionen und `sourceSummaries/flatex` kommen primaer aus
  dem Flatex-Broker-Snapshot.
- Boerse-Frankfurt-Kurse duerfen Flatex-Brokerwerte nicht still ersetzen; sie
  dienen als Vergleichs- und Historienquelle (`externalQuoteValue`,
  `externalQuoteDifference`, `priceHistory`).
- Dokumente und Postfach-Fakten sind in `sourceDocuments` und
  `sourceDocumentFacts` abgebildet.
- Konto-/Depotumsaetze erzeugen Bewegungen und Positionen.
- Kurse kommen fuer Wertpapiere ueber Boerse Frankfurt und landen in
  `quotesCurrent`/`priceHistory`.

### Trade Republic

- Status-quo-Baseline 2026-06-13 ersetzt fruehere obsolet gewordene Imports.
- CSV/PDF-Basis schreibt Positionen, Ledger, Transaktionen, Kosten und Fakten.
- Neue Mail-PDFs muessen den Stand ab Baseline fortschreiben.
- `Transaction export.csv` wird anhand `transaction_id` idempotent in
  `sourceDocumentFacts`, `ledgerEntries`, `transactions`, `costEvents` und
  `incomeEvents` geschrieben.
- Manuell selbst gesendete App-Exporte ohne Betreff werden durch
  `traderepublic_manual_exports` nach Inhalt klassifiziert.
- Oeffentlich handelbare Wertpapiere duerfen mit Boerse-Frankfurt-Kursen
  bewertet werden, muessen aber als solche erkennbar bleiben.
- Trade-Republic-Broker-Snapshots aus `Net Worth.pdf` werden parallel als
  Brokerfelder gespeichert:
  - `brokerQuotePrice`
  - `brokerQuoteAsOf`
  - `brokerCurrentValue`
  - `brokerQuoteProvider`
- Private Markets duerfen aus dem Trade-Republic-Net-Worth-Dokument bewertet
  werden, wenn keine stabile externe Kursquelle existiert.

### Ginmon

- Dokumente und API muessen getrennt bleiben:
  - Dokumente: Bestand, Kosten, Konto-/Strategiefakten, Historie
  - API: aktuelle Kurse/Werte
- Ginmon Top Zinsen ist ein eigenes Depot/Unterkonto und muss als solches in
  `sourceAccounts` und `sourcePositions` sichtbar bleiben.

### Intergold

- Preisimport und Beleg-/Bestandsimport bleiben getrennt.
- Belege bestimmen den Bestand, Intergold-Preise bestimmen die Bewertung.
- Metallpreise duerfen nicht als persoenlicher Bestand interpretiert werden.

### Bankkonten und Kreditkarten

- Ziel ist zunaechst aktueller Kontostand je Konto/Karte.
- Spaeter sollen Umsaetze als `ledgerEntries`, Gebuehren als `costEvents` und
  Zinsen/Cashback als `incomeEvents` gespeichert werden.
- Kreditkarten-Saldo muss als Verbindlichkeit abbildbar sein, nicht als Depotwert.
