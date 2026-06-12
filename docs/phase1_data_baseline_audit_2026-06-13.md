# Phase-1-Datenbaseline

Stand: 2026-06-13

## Zweck

Diese Pruefung beschreibt den tatsaechlichen Stand vor der Umsetzung der
automatisierten Phase-1-Importe fuer Flatex, Trade Republic, Ginmon und Bitget.
Sie trennt vorhandene Quelldateien, erfolgreich gespeicherte Rohdaten und
fachlich belastbare aktuelle Bestandsdaten.

## Kurzfazit

- Firestore ist erreichbar und enthaelt bereits umfangreiche Rohdaten.
- Die App liest `sourceSummaries` und `sourcePositions`, deren Werte sind aber
  ueberwiegend seit Ende Mai nicht mehr aktualisiert worden.
- Trade Republic hat bereits einen brauchbaren CSV-Parser. Der taegliche
  Mail-Agent fuer verschluesselte Abrechnungs-PDFs fehlt noch.
- Flatex ist noch nicht fachlich belastbar importiert. Die Umsatz-CSV-Dateien
  werden vom bestehenden Parser nicht korrekt als Bestandsbewegungen erfasst.
- Ginmon basiert auf einem alten Asset-Status-Report mit Bewertungsstand
  2026-03-31. Ein automatischer Portal-/Dokument-Agent fehlt.
- Bitget besitzt Client und Importskript, hat aber noch keine Daten in Firestore.

## Firestore-Baseline

| Collection | Dokumente | Bewertung |
| --- | ---: | --- |
| `sourceSummaries` | 4 | Flatex, Trade Republic, Ginmon und Intergold; letzter Update 2026-05-25 |
| `sourcePositions` | 48 | 16 Flatex, 5 Trade Republic, 14 Ginmon, 13 Intergold |
| `imports` | 352 | viele Rohdokumente, aber Importstatus ist nicht gleich fachliche Gueltigkeit |
| `transactions` | 644 | 305 Flatex, 339 Trade Republic |
| `ledgerEntries` | 829 | 305 Flatex, 524 Trade Republic |
| `costEvents` | 36 | nur Trade Republic |
| `rawDocuments` | 346 | Rohdatenablage funktioniert |
| `agentStatus` | 0 | noch nicht umgesetzt |
| `instruments` | 0 | noch nicht umgesetzt |

Letzte gespeicherte Summen:

| Quelle | Wert | Bewertungsstand | Datenquelle |
| --- | ---: | --- | --- |
| Flatex | 23.234,18 EUR | 2026-05-24 | alter Depot-Snapshot |
| Trade Republic | 2.254,30 EUR | 2026-05-25 | alter Net-Worth-Report |
| Ginmon | 8.029,81 EUR | 2026-03-31 | Asset-Status-Report |
| Intergold | 31.289,53 EUR | 2026-05-25 | Belege plus Intergold-Ankaufspreise |

## Flatex

### Vorhandene Quellen

- Quartalsweise Depotumsaetze von 2024-Q2 bis 2026-Q2
- Quartalsweise Kontoumsaetze von 2024-Q2 bis 2026-Q2
- Ein alter Depot-Snapshot und eine analytische Dashboard-Ansicht
- Umfangreiches Postfacharchiv

### Kritische Befunde

- Der Parser erkennt `Nominal (Stk.)` nicht als Mengenfeld. Dadurch ist die
  Menge in allen geprueften Depotumsaetzen `null`.
- Der Parser erkennt `Buchungsinformationen` nicht als Buchungstext. Dadurch
  werden Kontoumsaetze als `Unbekannte Buchung` gespeichert.
- Die CSV-Dateien sind nicht UTF-8-kodiert. Beim aktuellen Einlesen entstehen
  kaputte Umlaute.
- Der Watcher behandelt jede Flatex-CSV gleich. Deshalb wurden auch die
  Dashboard-CSV und das Postfach-Manifest als Transaktionen importiert.
- Die 305 vorhandenen Flatex-Transaktionen in Firestore sind unbrauchbar:
  alle haben kein Datum, keine Menge und keinen Betrag; 281 stammen aus dem
  Postfach-Manifest.
- `positions` ist leer. Der aktuelle Flatex-Bestand in `sourcePositions` stammt
  ausschliesslich aus dem alten Snapshot.

### Definition "fertig"

1. Flatex-Dateitypen vor dem Parsing eindeutig unterscheiden.
2. Depot- und Kontoumsaetze korrekt dekodieren und parsen.
3. Bewegungen dateiuebergreifend deduplizieren.
4. Aktuelle Mengen, Einstandswerte und Cash rechnerisch aus den CSV-Daten bilden.
5. Ergebnis einmal gegen den vorhandenen Snapshot abgleichen.
6. Danach den Snapshot nicht mehr fuer laufende Updates benoetigen.

## Trade Republic

### Vorhandene Quellen

- Transaction Export bis 2026-05-24
- Net Worth und Account Statement vom 2026-05-24/25
- Tax Report 2025
- Bestaetigter Mailweg fuer taegliche verschluesselte Abrechnungs-PDFs

### Befunde

- Der Transaction-Export-Parser erzeugt konsistent 5 Wertpapierpositionen.
- Firestore enthaelt 339 Trades, 524 Ledger-Eintraege und 36 Kostenereignisse.
- Die letzten CSV-Buchungen reichen bis 2026-05-24.
- Neuere taegliche Abrechnungs-PDFs liegen noch nicht im Drive und werden noch
  nicht automatisch importiert.
- Der PDF-Textimport unterstuetzt aktuell kein Passwort.
- Der aktuelle Cash- und Marktwertstand stammt weiterhin aus einem alten
  Net-Worth-Report.

### Definition "fertig"

1. Mail-Agent erkennt Passwort- und Abrechnungsmails.
2. Passwort bleibt ausschliesslich im macOS-Schluesselbund.
3. Verschluesselte PDFs werden automatisch entschluesselt, abgelegt und geparst.
4. Neue Trades aktualisieren Bestand und Einstand automatisch.
5. Periodischer Transaction Export und Net Worth dienen als Abgleich.

## Ginmon

### Befunde

- 36 PDFs und eine Strategie-Datei sind vorhanden.
- Firestore enthaelt 14 Positionen aus einem Asset-Status-Report.
- Bewertungsstand ist 2026-03-31, obwohl neuere Dokumente vorhanden sind.
- Kosten-, Einzahlungs- und Ertragsdokumente werden bisher nur als Rohdokumente
  gespeichert.
- Ein echter automatischer Portal-/Download-Agent existiert noch nicht.

### Definition "fertig"

1. Agent laedt neue relevante Dokumente automatisiert.
2. Der jeweils neueste Asset-Status aktualisiert Positionen und Gesamtwert.
3. Rechnungen, Kontoauszuege und Ertraege werden fachlich klassifiziert.
4. `agentStatus` zeigt letzten erfolgreichen Abruf und Datenstand.

## Bitget

### Befunde

- API-Client und Firestore-Importskript sind vorhanden.
- Firestore enthaelt noch keine Bitget-Positionen oder -Summen.
- Private API-Aufrufe sind durch einen Signatur-/Credential-Fehler blockiert.

### Definition "fertig"

1. Read-only API-Zugang funktioniert.
2. Spot-Bestand und relevante Ledger-Eintraege werden importiert.
3. Import laeuft zeitgesteuert auf dem Mac Studio.
4. Fehler und letzter Erfolg werden in `agentStatus` gespeichert.

## Naechste Umsetzungsreihenfolge

1. Gemeinsamen Importstatus und unveraenderliche Import-IDs definieren.
2. Flatex-Dateierkennung und Parser reparieren, danach Bestands-Rebuild.
3. Trade-Republic-Mail-Agent inklusive Schluesselbund und PDF-Passwort bauen.
4. Bitget-Read-only-Zugang reparieren und automatisieren.
5. Ginmon-Agent und fachliche Dokumentklassifizierung umsetzen.

Aktuelle Kurse sind bewusst nicht Teil dieser Baseline. Sie werden spaeter ueber
einen geschuetzten Backend-Dienst abgerufen und im Client zeitlich begrenzt
gecachet.
