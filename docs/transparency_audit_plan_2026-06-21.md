# Transparenz-Audit Plan 2026-06-21

## Ziel

Die App soll nicht nur Werte anzeigen, sondern nachvollziehbar machen, wann und
woher diese Werte kommen. Fuer jedes Depot, Konto und jede neue Quelle muessen
Primaerdaten, Kurse/Preise und Agent-Laufzeiten getrennt sichtbar sein.

## Dauerhafte Regel

Vor jeder Depot- oder Quellenbearbeitung erklaert Codex kurz:

1. Wie diese Quelle aktuell aktualisiert wird.
2. Welche Daten direkt vom Broker/API/Portal/Dokument kommen.
3. Welche Daten von externen Kurs-/Preisquellen kommen.
4. Wie `sourcePositions` und `sourceSummaries` berechnet werden.
5. Welche Schwachstellen oder Unklarheiten es aktuell gibt.

Erst danach wird umgesetzt.

## Begriffe

- `Brokerstand` / `Datenstand`: letzter fachlicher Stand aus der Primaerquelle
  fuer Positionen, Cash, Kredit, Einstand, Unterkonten und Bewegungen.
- `Dokumentstand`: letzter fachlich importierter und geparster Dokumentstand.
- `Kursstand` / `Preisstand`: letzter fachlicher Stand der Kurs- oder
  Preisquelle.
- `Agent zuletzt`: letzter technischer Lauf des Agents.
- `Letzte Aenderung`: letzter Zeitpunkt, an dem ein Lauf fachlich neue oder
  geaenderte Daten gebracht hat.

## Reihenfolge der Aufarbeitung

### 1. VBV

Status: erledigt am 2026-06-21, danach auf dokumentbasierte
Kontoinformation umgestellt.

Aktuelles Verstaendnis:

- VBV liefert im Portal einen Vorsorgewert mit Stichtag.
- Die fachlich genauere Quelle ist die PDF-Kontoinformation unter
  `Severance Payment Fund` -> `Account information`.
- `Aktualisiert` soll fachlich der VBV-Stichtag sein.
- Zusaetzlich soll sichtbar werden, wann der VBV-Agent zuletzt erfolgreich
  gelaufen ist.
- Die Kontoinformation wird nur neu heruntergeladen/geparst, wenn der im Portal
  sichtbare VBV-Stichtag neuer ist oder fuer diesen Stichtag noch kein
  Kontoinfo-Dokument in Firestore vorhanden ist.

Ziel:

- Karte zeigt `VBV-Stand`.
- Karte zeigt `Agent zuletzt`.
- Karte zeigt ausklappbar die PDF-Kontoinformation mit Gesamtwert,
  Garantiekapital und einzelnen Arbeitgeber-Vertraegen.
- Keine externe Kursquelle noetig.

Umsetzung:

- `sourceSummaries/vbv.sourceDataUpdatedAt` = VBV-Stichtag
- `sourceSummaries/vbv.sourceDataProvider` = `vbv_account_information_pdf`,
  sobald die PDF-Kontoinformation fuer den Stichtag vorhanden ist
- `sourceSummaries/vbv.documentDataUpdatedAt` = PDF-Stichtag
- `sourceSummaries/vbv.documentDataProvider` = `vbv_account_information_pdf`
- `sourceSummaries/vbv.accountInformation` = kompakte Anzeige-Daten der PDF
- `sourceDocuments` enthaelt das VBV-Kontoinfo-PDF mit Hash und Parse-Status
- `sourceDocumentFacts` enthaelt eine Summary und je Vertrag einen
  `vbv_contract_snapshot`
- `sourceSummaries/vbv.costValue` = Startwert plus Beitraege
- `sourceSummaries/vbv.performanceValue` = Veranlagungsergebnis minus
  explizit ausgewiesene Kosten
- `sourceSummaries/vbv.performancePct` = `performanceValue / costValue`
- Physische PDF-Dateien koennen bei gleichem Inhalt unterschiedliche Hashes
  haben. Deshalb nutzt VBV zusaetzlich `semanticHash` aus den geparsten
  fachlichen Zahlen und stabile IDs je Stichtag.
- `sourceSummaries/vbv.lastAgentSuccessAt` = letzter erfolgreicher Agent-Lauf
- `agentStatus/vbv` enthaelt dieselben Transparenzfelder
- GUI zeigt auf der Depotkarte `VBV-Stand` und separat `Agent zuletzt`
- LaunchAgent auf Mac Studio: taeglich um 06:45, `VBV_HEADLESS=1`
- Der echte Portal-Export wurde headless getestet. Wichtig: Der sichtbare
  `Account information`-Navigationslink startet keinen PDF-Download; der Agent
  liest den authentifizierten Link `/webportal/kontoinformation?...` aus und
  laedt diese PDF direkt mit der eingeloggten Session.

Verifizierter Stand:

- VBV-Stand: `2026-05-31`
- Datenquelle: `vbv_account_information_pdf`
- Agent zuletzt: `2026-06-21`
- Wert: `1.815,86 EUR`
- Einstand: `1.777,42 EUR`
- G/V: `+38,44 EUR`, `+2,16 %`
- Beitraege: `400,40 EUR`
- Veranlagungsergebnis netto: `+47,26 EUR`
- explizite Kosten: `-8,82 EUR`
- Garantiekapital: `1.736,01 EUR`
- Vertraege:
  - Novartis Pharmaceutical Manufacturing GmbH: `1.707,28 EUR`
  - SANDOZ GmbH: `108,58 EUR`
- Firestore:
  - `sourceDocuments/vbv_account_information_2026_05_31`
  - `sourceDocumentFacts`: 3 VBV-Fakten
  - keine doppelten Fakten fuer denselben Stichtag
- Exporttest:
  - `VBV_HEADLESS=1 node automation/src/sync-vbv-local.mjs --write --force-account-info`
  - erfolgreich am 2026-06-21
- Health: `OK`

### 2. Capital.com

Status:

- Nach aktuellem Arbeitsstand fachlich okay.
- Nur kontrollieren, ob die Transparenzfelder mit dem neuen Standard
  kompatibel sind.

### 3. Bitget

Status:

- erledigt am 2026-06-22 fuer den aktuellen API-/Ledger-Stand.
- Bitget nutzt Bitget selbst fuer Bestand und Kurse.
- Portfolio-Agent laeuft alle 5 Minuten.
- Ledger-Agent laeuft stuendlich.
- Sichtbare Positionen: `BTC Earn`, `EUR`, `USDT`.
- Ausgeschlossene Rohbestaende: Spot-BTC-Dust unter `1 EUR`, TRUMP, MELANIA.
  Diese bleiben in `rawDocuments/api_bitget_latest.rawPositions` und
  `excludedPositions` nachvollziehbar.
- Getrennt gespeichert:
  - API-/Brokerstand: `sourceDataUpdatedAt`, `sourceDataProvider=bitget_api`
  - Kursstand: `quoteDataUpdatedAt`, `quoteDataProvider=bitget_api`
  - Agentenstatus:
    - `agentStatus/bitget`: Bestände, Wallets und aktuelle Bewertung
    - `agentStatus/bitget_ledger`: Ledger, Gebühren, Zinsen/Earn,
      Transaktionen und Bewegungen
    - Die GUI zeigt beide Agenten getrennt mit Aufgabe, Laufzeit und Status.
- Ledger-Daten:
  - `ledgerEntries`, `transactions`, `costEvents`, `incomeEvents`,
    `sourceDocumentFacts`
  - Teilabrufe mit Rate-Limit oder Netzwerkfehler schreiben `WARNUNG`.
- Einschränkung:
  - BTC-Einstand `3.000 EUR` ist weiterhin ein nutzerbestaetigter
    `sourceCostBasis`-Wert, nicht vollstaendig automatisch aus der API
    rekonstruiert.
- Verifiziert:
  - `npm --prefix automation run check:bitget`
  - `npm --prefix automation run import:bitget:local`
  - `npm --prefix automation run sync:bitget-ledger`
  - `npm --prefix automation run sync:health`
  - `npm --prefix app run build`

### 4. Intergold

Aktuelles Verstaendnis:

- Bestand kommt aus Belegen/Dokumenten.
- Preise kommen von der Intergold-Webseite.
- Der Agent kann laufen, ohne dass sich die Websitepreise geaendert haben.

Status:

- erledigt am 2026-06-22 fuer den aktuellen Preis-/Bestandsstand.
- Agent: `com.niklas.finanztool.intergold-sync`, taeglich 08:20.
- Bestand:
  - `sourceDataUpdatedAt` / `documentDataUpdatedAt` = letzter geparster
    Belegstand
  - Provider: `intergold_confirmation_pdf`
- Preise:
  - `quoteDataUpdatedAt` = Preisstand der Intergold-Webseite
  - `quoteDataProvider` = `intergold_website`
  - `quoteDataChangedAt` = letzter Zeitpunkt, an dem dieser Preisstand erstmals
    in `intergoldPriceHistory` gespeichert wurde
- Agent:
  - `lastAgentRunAt`
  - `lastAgentSuccessAt`
- Verifizierter Stand:
  - Dokumentstand: `2026-03-23`
  - Preisstand Website: `2026-06-16`
  - letzte bekannte Preisaenderung: `2026-06-21T19:07:05.114Z`
  - Agent zuletzt: `2026-06-21T22:34:03.750Z`
  - `priceChanged=false`, weil der Lauf keine geaenderten Preise gefunden hat
  - 13 Metallpositionen, 19 Preise, 0 fehlende Preise
  - konservativer Ankaufwert: `30.540,92 EUR`
- Offen:
  - Verkaufsbestaetigungen/Rechnungen als eigener Reduktions- und
    Transaktionsstrom
  - Intergold-PDFs noch nicht im gleichen `sourceDocuments`/`sourceDocumentFacts`
    Detailgrad wie VBV

### 5. Ginmon

Aktuelles Verstaendnis:

- Ginmon ist aktuell am wahrheitsgetreusten.
- Dokumente liefern Bestand/Kosten/Historie.
- API liefert aktuelle Werte/Kurse.

Ziel:

- Karte zeigt `API-Stand`.
- Karte zeigt `Dokumentstand`.
- Karte zeigt `Agent zuletzt API` und `Agent zuletzt Dokumente`, soweit sinnvoll.
- Positionen/Unterdepots zeigen klar, wann der aktuelle Wert zuletzt aus der
  API aktualisiert wurde.

Status:

- abgeschlossen bis zum aktuellen Stand.
- Ginmon bleibt vorerst Referenzmodell fuer getrennte Datenquellen:
  - Dokumentimport taeglich/headless fuer Dokumente und Fakten.
  - API-Sync stuendlich/headless fuer aktuelle Werte, Kurse, Barwerte und
    Unterdepots.
  - Dokumente liefern Stueckzahlen, Einstand, Kosten, Ertraege und Historie.
  - API liefert aktuelle Bewertung; keine Ableitung von Kosten/Transaktionen nur
    aus API.
- Offene Restpunkte fuer spaeter:
  - Roh-API-Snapshot je Lauf revisionssicher persistieren.
  - wenige fachlich nicht relevante `UNKNOWN` Dokumente weiter klassifizieren,
    falls sie fuer Stammdaten gebraucht werden.

### 6. Trade Republic

Aktuelles Verstaendnis:

- Baseline aus CSV/Statements/Reports.
- Updates ueber Trade-Republic-Mail-PDFs.
- Kurse fuer handelbare Wertpapiere kommen ueber Boerse Frankfurt.
- Private Equity bleibt dokument-/Trade-Republic-basiert.

Ziel:

- Broker-/Dokumentstand und Kursstand getrennt anzeigen.
- Net-Worth-/Account-Statement-Abgleich als Kontrollschicht ergaenzen.
- Warnen, wenn Mail-Agent laeuft, aber neue Mails nicht gespeichert/geparst
  werden.

Status/Plan 2026-06-22:

- Trade Republic wird jetzt aufgearbeitet.
- Wichtigste Architekturentscheidung:
  - `Duplicates customer ...` Mails sind ein automatischer Delta-Kanal fuer
    Settlement-/Transaktions-PDFs.
  - Sie sind keine vollstaendige Snapshot-Quelle fuer Cash, Private Equity,
    offizielle Trade-Republic-Werte, Tax Report, Corporate Actions und komplette
    Ledger-Historie.
- Empfohlenes Zielmodell:
  - automatische Duplicates-Mails stuendlich
  - Boerse-Frankfurt-Kurse fuer oeffentlich handelbare Wertpapiere
  - `Net Worth.pdf` als offizieller Kontroll-Snapshot
  - `Account statement.pdf` fuer Cash-Reconciliation
  - `Transaction export.csv` periodisch fuer vollstaendige Ledger-/Kosten-/
    Zins-/Steuer-/Corporate-Action-Historie
  - `Tax Report` jaehrlich manuell
- Detailplan liegt in
  `docs/traderepublic_import_strategie.md`.
- Verbindliche Umsetzung:
  - Selbst gemailte App-Exporte ohne Betreff werden durch
    `traderepublic_manual_exports` morgens, mittags, abends und beim App-
    Refresh geprueft.
  - CSV-Transaktionen werden nach `transaction_id` idempotent geschrieben,
    damit periodische, ueberlappende Exportbereiche nicht doppelt zaehlen.
  - In der GUI muss je Position sichtbar bleiben, ob der aktive Kurs von
    Boerse Frankfurt, Trade Republic/Broker oder einer anderen Quelle stammt.

### 7. Flatex

Aktuelles Verstaendnis:

- Broker-Snapshot soll Wahrheit fuer Positionen, Cash, Kredit und Einstand sein.
- Boerse-Frankfurt-Kurse dienen als Kurs-/Historienquelle und duerfen den
  Brokerstand nicht als scheinbar aktuellen Flatexstand ausgeben.
- Aktuell gibt es den Hinweis, dass Flatex-Positionen nicht aktualisiert wurden.

Ziel:

- Brokerstand, Kursstand und Agent zuletzt getrennt anzeigen.
- Pruefen, warum Positionen nicht aktualisiert wurden.
- Sichtbare Warnung, wenn der Flatex-Brokerstand zu alt ist oder nicht zum
  erwarteten Broker-Snapshot passt.

## GUI-Zielbild

Depotkarte:

- `Depotwert`
- `Cash`
- `Einstand`
- `G/V`
- `Heute`
- `Brokerstand` oder `Datenstand`
- `Kursstand`
- `Agent zuletzt`

Positionstabelle:

- `Aktualisiert` soll nicht mehr unklar sein.
- Fuer Wertpapiere sollen getrennt sichtbar sein:
  - Bestand/Einstand aus Broker oder Dokument
  - Kurs aus Kursprovider

## Health-Zielbild

Health darf `OK` nur zeigen, wenn:

- Agenten technisch laufen.
- Primaerdaten nicht veraltet sind.
- Kurse/Preise nicht veraltet sind, soweit relevant.
- Bekannte Dokumenttypen geparst werden.
- Neue/geschlossene Positionen oder Unterkonten erkannt werden.
