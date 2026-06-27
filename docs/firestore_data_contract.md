# Firestore Data Contract

Stand: 2026-06-28

Dieses Dokument beschreibt die kanonische Firestore-Struktur fuer alle Quellen.
Es ist die Leitplanke, damit Flatex, Trade Republic, Ginmon, Intergold, Bitget,
Capital.com, Trading 212, VBV, EquatePlus und Bankkonten/Kreditkarten
vergleichbar gespeichert werden.

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
- `documentReviewDecisions`
  - Nutzer-/Codex-Entscheidungen zu Dokumenten oder Dokumenttypen, die nicht
    automatisch verarbeitet werden konnten
  - darf nie Rohdokumente ersetzen; es dokumentiert nur, wie ein offener
    Dokumentfall fachlich behandelt wird
  - wichtige Felder: `source`, `scope`, `decision`, `status`, `targetId`,
    `targetSignature`, `targetLabel`, `targetDocumentType`, `reason`,
    `decidedBy`, `decidedAt`

Regel: Wenn ein Dokument Informationen enthaelt, die spaeter fuer Analyse,
Kosten, Steuern, Performance oder Reconciliation nuetzlich sein koennen, muessen
sie mindestens als `sourceDocumentFacts` gespeichert werden.

Regel: Unbekannte, nicht abrufbare oder nicht klassifizierte Dokumente muessen
sichtbar bleiben. Eine Health-Warnung darf erst verschwinden, wenn eine
explizite Entscheidung in `documentReviewDecisions` existiert. Gueltige
Entscheidungen:

- `covered`: fachlich durch andere bereits gespeicherte Daten abgedeckt
- `not_relevant`: fuer Portfolioanalyse bewusst nicht relevant
- `needs_parser`: relevant, aber Parser/Agent muss erweitert werden
- `deferred`: wichtig, ruht zur spaeteren fachlichen Pruefung und darf nicht
  vergessen werden; zaehlt nicht als akute Health-Warnung und verschwindet aus
  dem aktiven Dokumenten-Postfach. Es bleibt in `documentReviewDecisions`
  nachvollziehbar und soll spaeter in einer separaten Rueckstell-/Pruefansicht
  wieder sichtbar gemacht werden.

Der Scope `item` gilt nur fuer genau diesen Dokument-/Faktenfall. Der Scope
`document_type` gilt fuer alle passenden Dokumente mit gleichem Label oder Typ
und muss entsprechend vorsichtig verwendet werden. In der normalen GUI wird
`document_type` nicht angeboten, weil generische Typen wie `unknown` sonst
versehentlich viele offene Dokumente schliessen koennen. Standard ist immer
eine Entscheidung auf Einzeldokument-Ebene.

Standard-Aktionen im Dokumenten-Postfach:

- `Welcome-Dokument`: Einzeldokument bewusst als nicht relevant schliessen;
  das PDF bleibt als Quelle erhalten.
- `Wichtig`: Einzeldokument wird als `deferred` markiert. Es ruht zur
  spaeteren fachlichen Pruefung, verschwindet aus den offenen Faellen und muss
  spaeter geklaert beziehungsweise in Parser/DB einbezogen werden.
- `Abgedeckt`: Einzeldokument ist durch bereits gespeicherte Daten fachlich
  abgedeckt.
- `Nicht relevant`: Einzeldokument enthaelt keine relevanten Portfolio-,
  Kosten-, Steuer-, Performance- oder Reconciliation-Daten.

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

### 2a. Kanonisches Event- und Kostenmodell

Ab 2026-06-27 gilt fuer alle vier Event-Collections ein gemeinsames
Zuordnungsmodell. Ziel: Kosten, Steuern, Ertraege und Transaktionen muessen
spaeter auf Gesamtportfolio, Quelle/Broker, Unterkonto/Depot, Produkt,
Position und Einzelvorgang auswertbar sein. Wenn eine Zuordnung nicht sicher
moeglich ist, wird sie nicht geraten, sondern transparent als
`unallocated`, `pending`, `inferred` oder `estimated` markiert.

Pflicht-/Standardfelder fuer `transactions`, `ledgerEntries`, `costEvents` und
`incomeEvents`, soweit aus der Quelle ableitbar:

- `eventModelVersion`: Version des kanonischen Eventmodells, aktuell
  `event_model_v1_2026-06-27`
- `eventCollection`: eine der Collections `transactions`, `ledgerEntries`,
  `costEvents`, `incomeEvents`
- `eventKind`: fachliche Ebene, z. B. `asset_transaction`,
  `cash_or_account_movement`, `cost`, `income`
- `eventType`: normalisierter Typ, aus `type` oder `category` abgeleitet
- `eventDate`: fachliches Datum des Vorgangs; nicht nur Schreibzeitpunkt
- `eventGroupId`: gemeinsame Klammer fuer zusammengehoerende Teilereignisse,
  z. B. Kauf + Cashbuchung + Gebuehr + Steuer
- `dedupeKey`: stabile fachliche Duplikatkennung
- `source`: Quelle/Broker/Anbieter, z. B. `flatex`, `traderepublic`,
  `ginmon`, `bitget`, `intergold`, `bank_accounts`
- `sourceAccountId`: Depot/Konto/Wallet/Unterkonto, wenn bekannt
- `sourcePositionId`: konkrete Position, wenn direkt bekannt
- `instrumentId`: kanonisches Instrument, bei ISIN als `isin_<ISIN>`
- `isin`, `symbol`, `metal`, `coin`, `epic`: quellenspezifische
  Produktkennung, soweit vorhanden
- `amount`, `currency`: Originalbetrag und Originalwaehrung
- `amountEur`: Betrag in EUR, falls ohne FX-Schaetzung bestimmbar
- `amountAbsEur`: positiver Absolutbetrag in EUR
- `grossAmountEur`, `netAmountEur`, `taxAmountEur`, `feeAmountEur`
- `financialImpactEur`: Vorzeichenlogik fuer Gesamtanalyse:
  - Kosten negativ
  - Ertraege positiv
  - Cash-/Ledgerbewegungen mit echtem Cash-Vorzeichen
- `allocationLevel`: `position`, `instrument`, `source_account`, `source`
  oder `unknown`
- `allocationStatus`: `direct`, `allocated`, `unallocated` oder `pending`
- `allocationMethod`: `document`, `transaction`, `api`, `proportional`,
  `manual`, `inferred` oder `unknown`
- `allocationConfidence`: `exact`, `estimated`, `inferred` oder `unknown`
- `comparisonScope`: `product`, `account`, `broker` oder `unknown`
- `providerComparisonRelevant`: ob das Event spaeter fuer
  Anbieter-/Produktvergleich relevant ist

Spezielle Felder:

- `costEvents.costClass`: `broker`, `product`, `tax`, `financing`,
  `custody`, `other`, `unknown`
- `incomeEvents.incomeClass`: `distribution`, `interest`, `reward`,
  `cashback_or_rebate`, `other`, `unknown`

Zuordnungsregeln:

- Direkt einem Kauf zuordenbare Ordergebuehren erhalten dieselbe
  `eventGroupId` wie die Transaktion und `allocationStatus=direct`.
- Jahres-/MiFID-/Produktkosten, die nur als Uebersicht vorliegen, bleiben als
  `summaryOnly=true` erhalten und bekommen `allocationConfidence=inferred`
  oder `estimated`.
- Anteilig verteilte Kosten, z. B. Intergold Kauf-/Lagerkosten, erhalten
  `allocationMethod=proportional` und `allocationStatus=allocated`.
- Nicht sicher zuordenbare Anbieter-/Depotkosten bleiben als
  `allocationStatus=unallocated` auf Broker-/Quellenebene sichtbar. Sie
  duerfen nicht verschwinden und werden spaeter bei Dashboards separat
  ausgewiesen.
- Capital.com, Trading 212 oder kuenftige Quellen duerfen mit
  `allocationStatus=pending` und `allocationConfidence=unknown` starten, wenn
  die API noch nicht alle Kosten-/Steuerdetails liefert.
- Trading 212 schreibt API-Orders, Dividenden und Cash-Transaktionen in
  `ledgerEntries`; Dividenden werden zusaetzlich in `incomeEvents`
  normalisiert, und API-Steuern/Gebuehren sowie `FEE`-Transaktionen landen in
  `costEvents`. Aktuelle offene Positionen kommen aus
  `sourcePositions/trading212_*`; geschlossene Positionen duerfen dort nicht
  weiter sichtbar sein, bleiben aber ueber die Event-Collections historisch
  nachvollziehbar.

Umsetzung:

- `automation/src/event-model.mjs` enthaelt den kanonischen Event-Enricher.
- `npm --prefix automation run reconcile:event-model` prueft vorhandene Events.
- `npm --prefix automation run sync:event-model` ergaenzt bestehende Events um
  die kanonischen Zuordnungsfelder, ohne fachliche Rohwerte zu loeschen.
- Der manuelle Full-Refresh fuehrt die Event-Modell-Normalisierung vor dem
  Health-Check aus.

Steuerregel ab 2026-06-27:

- Quellensteuern, Kapitalertragsteuern, Steuerkorrekturen und andere
  steuerliche Belastungen werden vorerst als `costEvents` mit eindeutigem
  `type` gespeichert, z. B. `tax`, `withholding_tax` oder
  `capital_gains_tax`.
- Eine eigene `taxEvents`-Collection wird erst eingefuehrt, wenn
  Jahressteuerberichte oder Steuer-Dashboards eine eigene, detailliertere
  Struktur brauchen.
- Bis dahin darf es keine zweite parallele Steuerwahrheit geben.

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
  `ginmon_api`, `intergold_website`, `six_swiss_exchange`.
- `quoteDataChangedAt`: Zeitpunkt der letzten erkannten Preisveraenderung,
  wenn Agentlaeufe haeufiger als Preisveraenderungen sind.
- `lastAgentRunAt`: letzter technischer Lauf des jeweiligen Agents.
- `lastAgentSuccessAt`: letzter technisch erfolgreicher Lauf.
- `lastDataChangeAt`: letzter Lauf, der den fachlichen Stand veraendert hat.

GUI-Regel:

- Es gibt ein zentrales Dokumenten-Postfach fuer alle Quellen. Es zeigt
  zunaechst offene, unbekannte oder fehlerhafte Dokumentfaelle. Spaeter kann es
  zur vollstaendigen Dokumentenablage erweitert werden.
- Postfach-Dokumente muessen auf allen Endgeraeten oeffenbar sein. Primaere
  Quelle dafuer ist Firebase Storage: `sourceDocuments.storagePath` zeigt auf
  die zentrale Kopie. Die App laedt diese Datei authentifiziert ueber Firebase
  Storage und oeffnet sie als PDF/Datei im Browser.
- Firestore ist fuer Dokumente das Register und die Faktenbasis, nicht der
  PDF-Blob-Speicher: `sourceDocuments` enthaelt Metadaten, Hash, Parserstatus,
  lokalen `filePath` und zentralen `storagePath`; `sourceDocumentFacts`
  enthaelt extrahierte Daten. Die Originaldateien bleiben zusaetzlich in
  Google Drive erhalten.
- Der lokale Dokumentserver
  `http://127.0.0.1:5176/documents/<sourceDocumentId>` ist nur noch Fallback
  fuer Dokumente, die noch keinen `storagePath` haben oder waehrend lokaler
  Entwicklung direkt aus Drive/Downloads gelesen werden muessen.
- Depotkarten muessen mindestens zeigen, soweit fuer die Quelle relevant:
  `Brokerstand` oder `Datenstand`, `Kursstand`, `Agent zuletzt`.
- Agenten duerfen in der GUI nicht nur als pauschales `OK` erscheinen. Je
  Quelle muss sichtbar sein:
  - welcher Agent gelaufen ist
  - wofuer dieser Agent fachlich zustaendig ist
  - wann der letzte technische Lauf war
  - ob das Ergebnis `OK`, `WARNUNG`, `FEHLER` oder `RUNNING` war
  - bei abweichendem Zeitpunkt: wann der letzte erfolgreiche Lauf war
- Agentenkacheln muessen in Depotkarten immer die volle verfuegbare Breite
  nutzen. Auf iPhone-15-Breite und kleiner duerfen sie nicht in die Icon-Spalte
  oder eine zu schmale Grid-Spalte fallen; sie sind einspaltig, kompakt und
  ohne vertikales Buchstabenbrechen darzustellen.
- Die Dashboard-Kennzahlen `Aktive Quellen` und `Warnungen` werden als eine
  gemeinsame Status-Kachel dargestellt. Die Warnliste muss auch auf
  iPhone-15-Breite lesbar bleiben und darf nicht in eine zu schmale
  Einzelkachel fallen.
- Ausklappzustaende der persoenlichen Uebersicht werden in
  `uiPreferences/portfolio_overview.expandedSections` gespeichert. Das betrifft
  Depotkarten, Dokumenten-Postfach, Archiv, Bank-/Kreditkartengruppen,
  einzelne Konto-/Depotzeilen und Positionsdetails. Ein Reload oder
  Geraetewechsel darf diese UI-Zustaende nicht auf Browser-Defaultwerte
  zuruecksetzen.
- Das Dokumenten-Postfach und die EquatePlus-Eingabe muessen auf
  iPhone-15-Breite ohne horizontales Ausbrechen nutzbar sein. Postfach-Aktionen
  sollen als volle Touch-Ziele umbrechen; EquatePlus-Eingaben sollen auf
  schmalen Screens einspaltig und ohne iOS-Zoom-Probleme bedienbar sein.
- Bankkonten und Kreditkarten werden auf iPhone-15-Breite nicht als breite
  Tabelle dargestellt. Die geschlossene Zeile zeigt Konto, Status, Geldstand,
  Kreditlinie und Verfuegbar. Agentenlauf, Update-Zeit, letzter Umsatz,
  Kontonummer und weitere technische Details gehoeren in den aufgeklappten
  Bereich.
- Positionslisten muessen auf iPhone-15-Breite als kompakte Karten statt als
  horizontale Tabelle erscheinen. Sichtbar bleiben Name, Wert, G/V, Heute und
  aktueller Kurs. Kursdatum, Menge, Einstand, Quelle und Status gehoeren in den
  aufgeklappten Detailbereich. Der Aufklappzustand je Position ist Teil von
  `uiPreferences/portfolio_overview.expandedSections`.
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

Wenn ein externer Kurslauf eine Position aktualisiert, muessen
`quoteProvider`, `priceSource` und `valuationMethod` dieselbe aktive
Kursquelle ausdruecken. Brokerwerte duerfen separat als `brokerCurrentValue`
und `brokerQuoteProvider` erhalten bleiben, aber nicht den aktiven
`priceSource` verwirren.

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
  - App-zu-Agent-Kommandos, z. B. manueller Kurs-Sync oder gezielter
    Trade-Republic-Portal-Refresh
  - erlaubte App-Commands:
    - `sync_quotes_manual` mit `type=sync_quotes`
    - `traderepublic_portal_refresh` mit `type=traderepublic_portal_refresh`
  - Zugangsdaten duerfen nie in `automationCommands` stehen. App-Commands
    enthalten nur Typ, Status, Nutzer und Zeitstempel.

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
- Der Portal-Agent `traderepublic_portal` darf aktuelle Werte aus dem
  authentifizierten Trade-Republic-Webportal speichern, muss sie aber klar als
  Portalquelle kennzeichnen:
  - `quoteProvider=traderepublic_portal_web` fuer sichtbare gelistete
    Positionen
  - `quoteProvider=traderepublic_portal_total_implied` fuer Private Markets,
    wenn der Wert nur aus Portfolio-Gesamtwert minus gelistete Positionen
    abgeleitet ist
  - `valuationMethod=traderepublic_portal_cash_v1` fuer Cash
  - `sourceDocumentFacts/traderepublic_portal_snapshot_latest` als letzter
    Portal-Snapshot
- Portal-Snapshots duerfen aktuelle Bewertung und Transparenz verbessern, sind
  aber kein Ersatz fuer vollstaendige Kosten-, Steuer- und Transaktionshistorie.
  Diese muss weiter aus Exporten/PDFs in `sourceDocuments`,
  `sourceDocumentFacts`, `transactions`, `ledgerEntries`, `costEvents` und
  `incomeEvents` kommen.
- Portal-Dokumente aus der Trade-Republic-Web-App muessen doppelt abgesichert
  werden:
  - technischer Dedupe ueber PDF-Hash
  - fachlicher Dedupe ueber `portalTransactionSignature`
- Wenn ein Portal-Dokument operativ angewendet wurde, muss eine
  Anwendungsspur in `sourceDocumentFacts` existieren:
  - `factType=portal_document_application`
  - `status=APPLIED`
  - `sourceDocumentFactId`
  - `appliedTo`
- Wenn derselbe Vorgang bereits aus dem manuellen Export/CSV bekannt ist, darf
  er nicht erneut in `transactions`, `ledgerEntries`, `costEvents` oder
  `sourcePositions` wirken. Stattdessen wird die Anwendungsspur mit
  `status=SKIPPED_DUPLICATE_MANUAL` geschrieben.
- Gleiche PDF-Dateien sollen langfristig nicht mehrfach als vollwertige
  `sourceDocuments` je Kanal existieren. Zielregel: ein kanonisches Dokument
  pro `source + fileHash`; weitere Funde werden nur als `seenVia` oder
  `duplicateOf` referenziert. Bis diese technische Bereinigung umgesetzt ist,
  darf eine redundante Dokumentspur keine operative Mehrfachanwendung erzeugen.
- Stand 2026-06-23 reicht `traderepublic_portal` noch nicht als alleinige
  Vollstaendigkeitsquelle. Nach Portal-Inventur vom 2026-06-23 gilt:
  - `Billing Execution`, `Inbound Invoice` und `Tax Report 2025` sind aus dem
    Webportal erreichbar und werden als Portal-Dokumente gespeichert.
  - Duplicate-Statement-Mails sind fuer Wertpapierabrechnungen nicht mehr
    erforderlich.
  - Private-Equity-Portalabrechnungen duerfen nicht zusaetzlich operativ
    zaehlen, wenn derselbe Cashflow bereits als `private_market_cash` aus dem
    `Transaction export.csv` vorhanden ist.
  - Private-Equity-Einstandswerte duerfen nicht blind aus allen
    `private_market_cash`-Fakten summiert werden. Fuer
    `LU3176111881` gilt: ausgefuehrte Trade-Fakten (`factType=trade`,
    Einstand = `Stueck * Kurs`) haben Vorrang; `private_market_cash` ist nur
    Rueckfallquelle, wenn keine ausgefuehrten Trade-Fakten vorhanden sind.
  - Zinsen sind im Portal-DOM sichtbar, aber der `Statement`-PDF-Button ist
    nicht verlaesslich. Der DOM-Fallback darf Zinsen nur speichern, wenn echte
    Zinsmerkmale wie `Interest`, `Accrued`, `You received` oder `Zins`
    sichtbar sind. Fallback-Fakten muessen
    `sourceChannel=traderepublic_portal_dom` tragen.
  - Bis die offenen Cash-/Zins-Fallbacks vollständig verifiziert sind, bleibt
    `Transaction export.csv` die sichere Quelle fuer Zinsen, Steuern,
    Dividenden, Cash-Historie und Private-Markets-Cashflows.
  - `Net Worth.pdf` ist fuer taegliche aktuelle Werte nicht mehr zwingend,
    wenn `traderepublic_portal` erfolgreich Portfolio/Cash liest; es bleibt
    optional als Kontrollreport.
- Depotuebergreifende Regel:
  - Unbekannte Dokumente, unbekannte Dokumentfakten und ungelöste
    Portal-Dokumentfehler muessen in `systemHealth/current.alerts`
    erscheinen.
  - Ein Agent darf bei solchen offenen Problemen nicht `OK` melden, sondern
    muss `WARNUNG` oder `FEHLER` setzen.

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
- Umsaetze werden als `ledgerEntries`, Gebuehren/Steuern als `costEvents` und
  Zinsen/Bonus/Cashback als `incomeEvents` gespeichert, soweit diese Daten ueber
  die read-only Account-Information-API verfuegbar sind.
- Kreditkarten-Saldo muss als Verbindlichkeit abbildbar sein, nicht als Depotwert.

#### Bankkonten ueber Enable Banking

- Bankkonten werden read-only ueber Open Banking/Enable Banking integriert.
- Kein George-/Bank-Web-Scraping und keine Payment-/Ueberweisungsfunktion.
- Quelle ist generisch `bank_accounts`, damit Erste/Sparkasse, Revolut,
  N26, PayPal, bank99 und spaetere Bankkonten gleich behandelt werden.
- Der Balance-Import schreibt den echten Kontostand als `currentValue`,
  `cashValue` und `netValue`. Nur dieser Wert zaehlt zum Vermoegen.
- Hoehere verfuegbare Werte inklusive Kreditrahmen duerfen nur als
  `availableWithCredit` gespeichert werden. Die Differenz wird als
  `creditLineEstimate` gefuehrt und zaehlt nicht als Vermoegen.
- Bank99 darf durch den Finanztool-Agenten maximal viermal pro Kalendertag
  abgerufen werden. Erlaubte Standardzeiten sind 07:00, 12:00, 17:00 und
  22:00 Uhr Europe/Vienna. Das Limit wird lokal im Agenten erzwungen.
- Der Initialbestand ist vorhanden. Der normale Sync liest Transaktionen
  inkrementell je Konto ab `latestTransactionDate - 2 Tage`.
- Historische Nachpflege laeuft getrennt mit
  `npm run sync:bank-accounts:backfill` fuer 180 Tage, damit die laufende
  Aktualisierung schnell bleibt.
- Bankumsaetze werden idempotent als `ledgerEntries` je Konto mit stabiler
  Dedupe-Logik geschrieben.
- Wenn eine Bankquelle nach Neufreigabe andere Provider-IDs oder zusaetzliche
  `identificationHash`-Werte liefert, muss der bereits verwendete
  Ledger-Schluessel erhalten bleiben. Bekannter Fall: PayPal darf denselben
  Umsatz nicht einmal mit `identificationHash` und spaeter mit Provider-ID
  speichern.
- `transactionCount` in `sourceAccounts` und `sourceSummaries.accounts`
  bezeichnet die insgesamt gespeicherte Historie je Konto. Der letzte Lauf wird
  separat ueber `transactionSyncedCount`, `transactionNewCount` und
  `transactionDuplicateCount` dokumentiert.
- `transactionStats.mode` dokumentiert, ob ein Konto `initial`,
  `incremental`, `explicit_lookback` oder `explicit_date_range` gelesen wurde.
- Zusaetzlich werden je Umsatz `sourceDocumentFacts` mit `factType:
  bank_transaction` gespeichert, damit Rohdaten/Parserstand nachvollziehbar
  bleiben.
- Bankkosten/Steuern werden als `costEvents` und Zinsen/Bonus/Cashback als
  `incomeEvents` klassifiziert, sofern der Umsatztext eindeutig ist.
- Consent-Ablauf, fehlende Konten, Rate-Limits oder API-Fehler muessen in
  `agentStatus/bank_accounts` und `systemHealth/current` sichtbar sein.

### EquatePlus

- EquatePlus wird vorerst als manueller Novartis-Plan gefuehrt.
- Manuelle Eingabe liegt ausschliesslich in
  `manualInputs/equateplus_novartis`:
  - `quantity`
  - `entryValueEur`
  - `entryValueCurrency=EUR`
  - `isin=CH0012005267`
- Der Agent bewertet diese Eingabe mit SIX Swiss Exchange und schreibt die
  aktuellen kanonischen Werte in `sourcePositions/equateplus_novartis` und
  `sourceSummaries/equateplus`.
- `quotesCurrent/isin_CH0012005267` enthaelt den aktuellen SIX-Kurs samt
  CHF/EUR-Umrechnung; `priceHistory` darf fuer Tageshistorie genutzt werden.
- Vorher duerfen keine Holdings-/Transaktionsparser auf theoretischen
  Annahmen gebaut werden.
- Nach Eingang echter EquatePlus-Dokumente muessen zuerst Dokumenttypen,
  Dedupe-Regeln und fachliche Felder bestimmt werden.
- Wenn Dokumente relevante Mehrdaten liefern, bleiben die Ziel-Collections
  dieselben wie bei allen Quellen: `sourceDocuments`, `sourceDocumentFacts`,
  `transactions`, `ledgerEntries`, `costEvents`, `incomeEvents`,
  `sourcePositions` und `sourceSummaries/equateplus`.
- Wenn EquatePlus Informationen zu Vesting, Einbuchung, Verkauf, Steuer,
  Gebuehr oder Mitarbeiteraktienbestand liefert, muessen diese Daten
  historisch nachvollziehbar als Fakten und Bewegungen gespeichert werden.
