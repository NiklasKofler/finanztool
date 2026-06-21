# Bitget Daten-Audit - 2026-06-20

## Kurzfazit

Der Bitget-5-Minuten-Agent funktioniert fuer den aktuellen Bestand und die
Portfolio-Karte automatisch. Zusaetzlich wurde ein separater
Bitget-Ledger-Agent umgesetzt, der historische Bewegungen, Trades, Kosten und
Zinsen idempotent nach Firestore schreibt.

## Produktiver Agent

Installierter LaunchAgent:

- `com.niklas.finanztool.bitget-import`
- startet alle 5 Minuten
- startet `automation/src/import-bitget-local.mjs`

Installierter Ledger-LaunchAgent:

- `com.niklas.finanztool.bitget-ledger`
- startet stuendlich
- startet `automation/src/sync-bitget-ledger-local.mjs`
- nutzt Lock-Datei `/tmp/finanztool-bitget-ledger.lock`, damit sich manuelle
  und automatische Laeufe nicht ueberschneiden

## Aktuell automatisch gespeichert

Alle 5 Minuten:

- `agentStatus/bitget`
- `sourceSummaries/bitget`
- aktuelle saubere Portfolio-Positionen in `sourcePositions`
- aktueller API-Rohsnapshot in `rawDocuments/api_bitget_latest`
- aktueller Importstatus in `imports/api_bitget_latest`

Stuendlich:

- Bitget Account Bills nach `ledgerEntries`
- Bitget Spot Fills nach `transactions`
- Bitget Fill-Gebuehren nach `costEvents`
- Bitget Earn/Savings-Zinsen nach `incomeEvents`
- Bitget Tax Spot/Future Records nach `sourceDocumentFacts`
- letzter Ledger-Rohsnapshot nach `rawDocuments/api_bitget_ledger_latest`
- letzter Ledger-Importstatus nach `imports/api_bitget_ledger_latest`
- Ledger-Agentstatus nach `agentStatus/bitget_ledger`

Aktuelle Bitget-Portfolioansicht:

- `bitget_earn_BTC`
- `bitget_spot_EUR`
- `bitget_spot_USDT`

Bewusst ausgeschlossen, aber im Rohsnapshot nachvollziehbar:

- `bitget_spot_BTC` wegen Dust/0,00-EUR-Rundung
- `bitget_spot_TRUMP` wegen sauberem Schnitt
- `bitget_spot_MELANIA` wegen sauberem Schnitt

## Firestore-Stand der Pruefung

- `sourcePositions`: 3 Bitget-Positionen
- `ledgerEntries`: 2166 Bitget-Eintraege historisch vorhanden;
  letzter Lauf importierte 2165 im 90-Tage-Fenster
- `transactions`: 2 Bitget-Eintraege
- `costEvents`: 2 Bitget-Eintraege
- `incomeEvents`: 90 Bitget-Zinsereignisse
- `sourceDocumentFacts`: 726 Bitget-Tax-Facts historisch vorhanden;
  letzter Lauf importierte 725 im 30-Tage-Tax-Fenster
- `sourceCostBasis`: 4 historische/manuelle Kostenbasis-Eintraege
- `systemHealth/current`: OK

## Was jetzt automatisch historisch gespeichert wird

- Spot-Bills als Bewegungsledger
- Spot-Fills als Trades
- Trading-Gebuehren als Kostenereignisse
- Earn-Zinsen als Income-Events
- Earn-Records und Tax-Records im Rohsnapshot und Tax-Facts

## Noch offen / bewusst getrennt

- Historische Daten aelter als das API-Fenster muessen weiter aus den
  exportierten Bitget-Dateien rekonstruiert werden.
- Der Ledger-Agent nutzt aktuell ein 90-Tage-Rolling-Fenster fuer Bills,
  Fills und Earn-Records.
- Tax-Records werden wegen Bitget-Limit mit 30-Tage-Fenster abgefragt.
- Historische Ledger-/Fact-Dokumente werden nicht geloescht, wenn sie aus dem
  Rolling-Fenster herausfallen. Deshalb kann die Collection-Gesamtzahl groesser
  sein als der Zaehler des letzten Laufs.
- Der aktuelle 5-Minuten-Snapshot bleibt bewusst getrennt vom historischen
  Ledger.

## Technisch verfuegbare Bitget-Daten

Mit dem vorhandenen API-Key am 2026-06-20 erfolgreich getestet:

- Spot Account Bills, 90 Tage, z. B. `BATCH_INTEREST_USER_IN`
- Spot Trade Fills, 90 Tage, z. B. BTC-Kauf und TRUMP-Verkauf mit Fee-Details
- Tax Spot Records, 30 Tage pro Anfrage
- Tax Futures Records, 30 Tage pro Anfrage, aktuell 0 Eintraege
- Earn Savings Assets, inklusive `lastProfit`, `totalProfit`, APY-Stufen
- Earn Savings Records, 90 Tage, inklusive `pay_interest`

## Bewertung

Neue oder geschlossene aktuelle Positionen:

- Ja, fuer die Portfolioansicht funktioniert das automatisch.
- `sourcePositions` wird bei jedem Lauf gegen den aktuellen Bitget-Bestand
  abgeglichen.
- Positionen, die nicht mehr aktuell sind, werden geloescht.
- Neue relevante Positionen erscheinen automatisch, sofern sie nicht als Dust
  oder sauberer-Schnitt-Ausnahme ausgeschlossen werden.

Kosten und Zinsen:

- Nein, fachlich noch nicht vollstaendig.
- Aktuell kommt der BTC-Einstand aus `sourceCostBasis`, nicht automatisch aus
  Bitget-Transaktionen.
- Earn-Zinsen sind ueber API abrufbar, aber noch nicht als Ertraege gespeichert.
- Trading-Gebuehren sind ueber Fills/Bills abrufbar, aber noch nicht als
  `costEvents` gespeichert.

## Umgesetzte Erweiterung

1. Separater Bitget-Ledger-Agent wurde gebaut und stuendlich installiert.
2. Endpunkte:
   - `/api/v2/spot/account/bills`
   - `/api/v2/spot/trade/fills`
   - `/api/v2/earn/savings/records`
   - `/api/v2/earn/savings/assets`
   - optional `/api/v2/tax/spot-record` als Kontroll-/Steuerdatenquelle
3. In Firestore geschrieben:
   - `ledgerEntries` fuer Bills, Transfers, Earn-Zinsen, Subscriptions,
     Redemptions
   - `transactions` fuer echte Trades/Fills
   - `costEvents` fuer Fees und sonstige Kosten
   - `incomeEvents` fuer Earn-Zinsen
   - `sourceDocumentFacts` fuer Tax-Facts
4. Idempotenz:
   - Dokument-IDs aus Bitget-IDs bilden, z. B. `bitget_bill_<billId>`,
     `bitget_fill_<tradeId>`, `bitget_earn_<orderId>`
   - keine doppelten Eintraege bei Wiederholung
5. History:
   - aktueller Snapshot bleibt `api_bitget_latest`
   - Bewegungen werden historisch gespeichert
   - Preise/Position-History separat nur nach definierter Logik speichern

## Was keinen Sinn macht

- Den 5-Minuten-Snapshot als Transaktionshistorie speichern.
- Jede 5-Minuten-Bewertung komplett historisch aufzubewahren.
- Ausgeschlossene Dust-/Meme-Reste wieder als aktuelle Portfolio-Positionen zu
  behandeln.
- Bitget-Krypto ueber externe Kursquellen zu bewerten, solange Bitget als
  Wahrheit fuer Bitget definiert ist.
