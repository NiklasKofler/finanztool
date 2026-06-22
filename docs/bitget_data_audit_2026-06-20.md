# Bitget Daten-Audit

Stand: 2026-06-22 00:30 CEST, Mac Studio

## Kurzfazit

Bitget ist fuer den aktuellen Bestand jetzt sauber automatisiert:

- Der Portfolio-Agent laeuft alle 5 Minuten.
- Der Ledger-Agent laeuft stuendlich.
- Aktuelle Positionen und Kurse kommen ausschliesslich aus der Bitget API.
- Kosten, Trades, Fees, Earn-Zinsen und Tax-Facts werden historisch und
  idempotent in Firestore gespeichert.
- Nicht mehr relevante Meme-/Dust-Reste sind nicht mehr sichtbare
  Portfolio-Positionen, bleiben aber im Rohsnapshot nachvollziehbar.

Nicht vollautomatisch abgeschlossen ist die historische Einstandsermittlung:

- Der BTC-Einstand von `3.000 EUR` ist aktuell ein bestaetigter manueller
  Kostenbasis-Eintrag in `sourceCostBasis`.
- Die laufenden API-Daten enthalten Fees und Zinsen, aber nicht automatisch die
  vollstaendige Herkunft jeder historischen Einzahlung oder externen
  Finanzierung.

## Wie Bitget aktuell aktualisiert wird

### Portfolio-Agent

LaunchAgent:

- `com.niklas.finanztool.bitget-import`
- Script: `automation/src/import-bitget-local.mjs`
- Intervall: alle 5 Minuten
- API-Key liegt lokal im macOS-Schluesselbund

Genutzte Bitget-Endpunkte:

- `/api/v2/spot/account/info`
- `/api/v2/spot/account/assets`
- `/api/v2/account/all-account-balance`
- `/api/v2/earn/account/assets`
- `/api/v2/spot/market/tickers`

Gespeichert wird:

- `sourcePositions`: sichtbare aktuelle Portfolio-Positionen
- `sourceSummaries/bitget`: aktuelle Bitget-Karte
- `imports/api_bitget_latest`: letzter Importstatus
- `rawDocuments/api_bitget_latest`: letzter API-Rohsnapshot
- `agentStatus/bitget`: letzter Agentstatus

Der 5-Minuten-Lauf ueberschreibt absichtlich den aktuellen Snapshot. Er erzeugt
keine endlose 5-Minuten-Historie.

### Ledger-Agent

LaunchAgent:

- `com.niklas.finanztool.bitget-ledger`
- Script: `automation/src/sync-bitget-ledger-local.mjs`
- Intervall: stuendlich
- Lock-Datei: `/tmp/finanztool-bitget-ledger.lock`

Genutzte Bitget-Endpunkte:

- `/api/v2/spot/account/bills`
- `/api/v2/spot/trade/fills`
- `/api/v2/earn/savings/records`
- `/api/v2/earn/savings/assets`
- `/api/v2/tax/spot-record`
- `/api/v2/tax/future-record`

Gespeichert wird:

- `ledgerEntries`: Account-Bills, Bewegungen, Interest-Buchungen
- `transactions`: Spot-Fills/Trades
- `costEvents`: Trading-Fees
- `incomeEvents`: Earn-/Savings-Zinsen
- `sourceDocumentFacts`: Bitget Tax Spot/Future Records
- `rawDocuments/api_bitget_ledger_latest`: letzter Ledger-Rohsnapshot
- `imports/api_bitget_ledger_latest`: letzter Ledger-Importstatus
- `agentStatus/bitget_ledger`: letzter Ledger-Agentstatus

Teilweise API-Ausfaelle werden nicht mehr still als OK behandelt. Wenn ein
optionaler Teilabruf, z. B. Tax Records, wegen Rate-Limit oder Netzwerkfehler
scheitert, schreibt der Ledger-Agent `WARNUNG` plus `warnings`.

## Aktuelle Portfolio-Logik

Sichtbare `sourcePositions`:

- `bitget_earn_BTC`
- `bitget_spot_EUR`
- `bitget_spot_USDT`

Bewusst aus der sichtbaren Portfolioansicht ausgeschlossen:

- `bitget_spot_BTC`: Dust unter `1 EUR`
- `bitget_spot_TRUMP`: sauberer Schnitt 2026-06-20
- `bitget_spot_MELANIA`: sauberer Schnitt 2026-06-20

Diese ausgeschlossenen Rohbestaende bleiben in
`rawDocuments/api_bitget_latest.rawPositions` und in
`sourceSummaries/bitget.excludedPositions` nachvollziehbar.

## Berechnung der Bitget-Karte

Die Karte nutzt den Bitget-Kontowert als Wahrheit:

- `sourceSummaries/bitget.currentValue`
- `sourceSummaries/bitget.netValue`
- `sourceSummaries/bitget.exchangeAccountValue`

Grundlage:

1. Bitget `all-account-balance` liefert den kontenuebergreifenden Wert in USDT.
2. Bitget `USDTEUR` aus den Spot-Tickern rechnet den Wert in EUR um.
3. Dieser Wert ist fuer die Karte massgeblich.

Zusaetzlich wird gespeichert:

- `positionsValue`: Summe sichtbarer Positionen aus Bitget-Tickern
- `includedPositionsValue`: Summe sichtbarer bewertbarer Positionen
- `positionSummaryDifference`: Differenz zwischen Positionssumme und Bitget-
  Kontowert
- `componentsUsdt`: Spot/Earn/Futures/Margin/Funding/Bots aus Bitget
- `unpricedPositionCount`: Assets ohne Bitget-Kurs
- `excludedPositionCount`: bewusst ausgeblendete Rohbestaende

Die Differenz zwischen Bitget-Kontowert und sichtbarer Positionssumme kann
klein sein, weil Bitget fuer den Kontowert eine eigene Kontobewertung liefert,
waehrend die Positionsanzeige mit aktuellen Spot-Tickern bewertet wird. Diese
Differenz wird gespeichert und vom Health-Check kontrolliert.

## Transparenzfelder

Bitget schreibt jetzt getrennt:

- `sourceDataUpdatedAt`: Zeitpunkt des Bitget-API-Snapshots
- `sourceDataProvider`: `bitget_api`
- `quoteDataUpdatedAt`: Zeitpunkt der Bitget-Kursbewertung
- `quoteDataProvider`: `bitget_api`
- `lastAgentRunAt`: technischer Agentlauf
- `lastAgentSuccessAt`: letzter erfolgreicher Agentlauf

Damit ist in der GUI erkennbar, ob der Stand direkt von Bitget kommt und wann
der Agent zuletzt erfolgreich war.

## Kosten, Zinsen und Datenvollstaendigkeit

Vorhanden in Firestore:

- `ledgerEntries`: Bitget Account Bills
- `transactions`: Bitget Spot-Fills
- `costEvents`: Bitget Trading-Fees
- `incomeEvents`: Bitget Earn-Zinsen
- `sourceDocumentFacts`: Bitget Tax-Facts

Verifizierter Firestore-Stand nach dem Lauf:

- `sourcePositions`: 3 sichtbare Bitget-Positionen
- `ledgerEntries`: 2190 Bitget-Eintraege historisch vorhanden
- `transactions`: 2 Bitget-Trades
- `costEvents`: 2 Bitget-Fee-Ereignisse
- `incomeEvents`: 91 Bitget-Zinsereignisse
- `sourceDocumentFacts`: 750 Bitget-Tax-Facts
- `agentStatus/bitget`: `OK`
- `agentStatus/bitget_ledger`: `OK`
- `systemHealth/current`: `OK`

Wichtig:

- Die laufenden Kosten und Zinsen sind als Ereignisse vorhanden.
- Der BTC-Einstand von `3.000 EUR` ist weiterhin ein manueller,
  nutzerbestaetigter Kostenbasiswert in `sourceCostBasis`.
- Aeltere Historie ausserhalb der aktuellen API-Fenster muss bei Bedarf aus
  Exportdateien oder Bank-/Kreditkartenbuchungen rekonstruiert werden.
- Der Ledger-Agent nutzt standardmaessig ein 90-Tage-Fenster fuer Bills,
  Fills und Earn-Records.
- Tax-Records werden wegen API-Limit standardmaessig mit 30-Tage-Fenster
  abgefragt.
- Historische normalisierte Dokumente werden nicht geloescht, wenn sie aus dem
  Rolling-Fenster herausfallen.

## Verifizierte Checks

Ausgefuehrt am Mac Studio:

```bash
npm --prefix automation run check:bitget
npm --prefix automation run import:bitget:local
npm --prefix automation run sync:bitget-ledger
npm --prefix automation run sync:health
npm --prefix app run build
```

Ergebnis:

- Bitget Public API erreichbar.
- Bitget Read-only API funktioniert.
- Sichtbare Positionen nach Dust-/Clean-Cut-Filter: 3.
- Portfolio-Import erfolgreich.
- Ledger-Sync erfolgreich.
- Health: `OK`.
- App-Build erfolgreich.

## Naechster sinnvoller Bitget-Ausbau

1. BTC-Einstand langfristig aus echten Geldfluesse/Trades/Transfers
   rekonstruieren, soweit die Daten verfuegbar sind.
2. Historische Bitget-Exportdateien nutzen, falls API-Fenster nicht weit genug
   zurueckreichen.
3. Preis-/Positionshistorie separat nach der globalen 22:00-Logik speichern,
   nicht jeden 5-Minuten-Snapshot.
4. Falls weitere Coins sichtbar werden, automatisch anzeigen, sofern sie kein
   Dust und nicht bewusst ausgeschlossen sind.
