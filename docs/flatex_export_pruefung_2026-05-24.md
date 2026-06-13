# Flatex Exportpruefung 2026-05-24

## Ziel

Erstimport der Flatex Konto- und Depotumsaetze ab der ersten Aktivitaet 2024.
Der vollstaendige Zeitraum 2024-01-01 bis 2026-05-24 wurde in Quartale geteilt,
weil die Flatex-Oberflaeche bei einem Gesamtzeitraum meldet:

> Es werden nicht alle Eintraege dargestellt. Bitte schraenken Sie den Zeitraum ein.

## Ablage

Konto-CSV:

`/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/01_Originale/Flatex/Kontoumsaetze`

Depot-CSV:

`/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/01_Originale/Flatex/Depotumsaetze`

## Exportumfang

Kontoumsaetze:

- 2024-Q1: keine exportierbare Datei, offenbar keine Umsaetze
- 2024-Q2 bis 2026-Q2: 9 CSV-Dateien
- Datumsbereich in den CSVs: 2024-04-06 bis 2026-05-18
- Zeilen: 240
- Summe Betrag: -5.967,30 EUR

Depotumsaetze:

- 2024-Q1: keine exportierbare Datei, offenbar keine Depotumsaetze
- 2024-Q2 bis 2026-Q2: 9 CSV-Dateien
- Datumsbereich in den CSVs: 2024-04-16 bis 2026-04-02
- Zeilen: 273

## Kontrollwerte aus Flatex Dashboard

Stand waehrend Export:

- Depotwert: 23.234,18 EUR
- Kontosaldo: -5.967,30 EUR
- Gesamtvermoegen: 17.266,88 EUR
- Aktien: 16.037,92 EUR
- ETFs/Fonds: 7.196,26 EUR

Die Summe der exportierten Kontoumsaetze stimmt exakt mit dem angezeigten
Kontosaldo ueberein:

`-5.967,30 EUR`

## Depotuebersicht Snapshot

Zusaetzlich wurde die aktuelle Positionsliste aus dem Bereich `Mein Flatex Depot`
extrahiert und abgelegt:

- CSV: `/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/01_Originale/Flatex/Depotuebersicht/2026-05-24_Flatex_Depotuebersicht_Snapshot.csv`
- JSON: `/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/01_Originale/Flatex/Depotuebersicht/2026-05-24_Flatex_Depotuebersicht_Snapshot.json`

Enthaltene Felder je Position:

- Kategorie
- Bezeichnung
- Handelsplatz
- Stueck/Nominal
- ISIN
- WKN
- Kurszeit
- Kurs
- Gesamtwert
- Einstandswert
- Entwicklung in EUR und Prozent
- Schlusskurs Vortag
- Tagesentwicklung in EUR und Prozent

Plausibilitaetscheck:

- Positionen: 16
- Summe Gesamtwert: 23.234,18 EUR
- Summe Einstandswert: 15.001,15 EUR
- Summe Gesamtentwicklung: 8.233,03 EUR
- Summe Tagesentwicklung: 212,18 EUR
- Summe ETFs/Fonds: 7.196,26 EUR
- Summe Aktien: 16.037,92 EUR

Die Summe der extrahierten Positionswerte stimmt exakt mit dem angezeigten
Depotwert ueberein:

`23.234,18 EUR`

## Dashboard-Ansichten

Im Dropdown `Ansichtswechsel` gibt es vier Ansichten:

- Einfache Ansicht
- Klassische Ansicht
- Analytische Ansicht
- News Ansicht

Einschaetzung:

- `Klassische Ansicht`: beste Primaerquelle fuer den taeglichen Depot-Snapshot,
  weil sie ISIN, WKN, Stueckzahl, Handelsplatz, Kurszeit, Kurs, Gesamtwert,
  Einstandswert, Vortag und Tagesentwicklung kompakt enthaelt.
- `Einfache Ansicht`: aehnliche Daten wie die klassische Ansicht, aber weniger
  Kurszeit-/Vortagsdetails. Fuer den Import nicht besser als klassisch.
- `Analytische Ansicht`: sehr nuetzlich als Zusatzquelle fuer Portfolioanalyse.
  Sie liefert Gewichtung je Position sowie Aggregationen nach Branchen und
  Laendern/Regionen.
- `News Ansicht`: fuer Kernbewertung weniger wichtig. Sie zeigt Positionsdaten
  plus einzelne News. Spaeter fuer KI-Kommentare denkbar, aber nicht als
  Bewertungsquelle priorisieren.

Die analytische Ansicht wurde zusaetzlich abgelegt:

- CSV: `/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/01_Originale/Flatex/Depotuebersicht/2026-05-24_Flatex_Dashboard_Analytische_Ansicht.csv`
- JSON: `/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/01_Originale/Flatex/Depotuebersicht/2026-05-24_Flatex_Dashboard_Analytische_Ansicht.json`

Analytische Snapshot-Werte:

- Portfolio-Positionen: 16
- Summe Portfolio: 23.234,18 EUR
- Summe Branchen: 23.234,19 EUR (Rundungsdifferenz 0,01 EUR)
- Summe Laender/Regionen: 23.234,18 EUR

Wichtige Konzentrationen laut analytischer Ansicht:

- URANIUM ENERGY CORP.: 46,05 % / 10.700,06 EUR
- Aktien gesamt: 69,03 % / 16.037,92 EUR
- ETFs/Fonds gesamt: 30,97 % / 7.196,26 EUR
- USA: 58,63 % / 13.623,01 EUR
- Irland: 30,18 % / 7.012,41 EUR
- Kanada: 6,58 % / 1.529,91 EUR

## Rekonstruierte Nettopositionen aus Depotumsaetzen

Diese Stueckzahlen ergeben sich durch Summierung von `Nominal (Stk.)` je ISIN.
Sie bilden die Basis fuer den App-Importer.

| ISIN | Stueck | Bezeichnung |
| --- | ---: | --- |
| IE000BI8OT95 | 5.294828 | AM MSCI USD-ACC |
| CA13321L1085 | 15.000000 | CAMECO CORP. |
| IE0032077012 | 0.208238 | INVESCO EQQQ NASDAQ-100 ETF |
| DE000A0D8Q23 | 2.844176 | ISHARES ATX ETF (DE) |
| IE00B5BMR087 | 1.193254 | ISHARES CORE S&P 500 ETF |
| US63253R2013 | 15.000000 | KAZATOMPROM SPGDR-S |
| US7310681025 | 50.000000 | POLARIS INC. |
| CA7729241066 | 500.000000 | ROCKET RG |
| US9168961038 | 954.000000 | URANIUM ENERGY CORP. |
| IE000YYE6WK5 | 45.000000 | VANECK DEFENSE ETF |
| IE0007Y8Y157 | 64.000000 | VANECK QUANTUM COMPUTING UCITS ETF |
| IE00B3RBWM25 | 0.914941 | VANGUARD FTSE ALL-WLD UCITS ETF |
| IE00BGV5VN51 | 0.909861 | XTRACKERS AI & BIG DATA UCITS ETF |
| IE00BTJRMP35 | 2.156161 | XTRACKERS MSCI EMERGING MARKETS ETF |
| IE00BM67HT60 | 2.939801 | XTRACKERS MSCI WLD INFORMATION TECH ETF |
| IE00BJ0KDQ92 | 1.069252 | XTRACKERS MSCI WORLD ETF |

## Bewertung

Konto- und Depotumsaetze reichen sehr wahrscheinlich fuer:

- Cash-Kontostand
- Einzahlungen und Auszahlungen
- Kauf- und Verkaufshistorie
- Dividenden und Ausschuttungen
- rekonstruierte Wertpapier-Stueckzahlen
- realisierte Bewegungen als Importbasis

Sie reichen alleine nicht fuer:

- aktuellen Depot-Marktwert ohne aktuelle Kurse
- detaillierte Steuerbelege
- rechtssichere Dokumentenablage
- Sonderfaelle wie Kapitalmassnahmen, falls diese in CSVs nicht eindeutig genug sind

Empfehlung:

- Die Quartals-CSV-Dateien sind die Primaerquelle fuer den Startbestand.
- Screenshots werden nur noch als Plausibilitaetsbeleg gebraucht.
- Postbox-Dokumente muessen nicht taeglich importiert werden, bleiben aber fuer Steuer,
  Abrechnungen und Sonderfaelle als Archivquelle sinnvoll.
- Fuer laufende Updates genuegt spaeter ein taeglicher Export mit Zeitraum `Heute`,
  sofern der Importer Duplikate ueber TA.Nr., Datum, ISIN und Betrag erkennt.

## Postfach-Archiv

Das Flatex-Postfach wurde zusaetzlich als Belegarchiv heruntergeladen.

Ablage:

`/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/01_Originale/Flatex/Postbox`

Ergebnis:

- PDF-Dateien nach Deduplikation: 281
- Abgedeckter Zeitraum nach Dateinamen: 2024-03 bis 2026-05
- Zusaetzliche nicht datierte/produktbezogene PDFs: 4
- Manifest: `2026-05-24_Flatex_Postbox_File_Manifest.csv`
- Zusammenfassung: `2026-05-24_Flatex_Postbox_Summary.json`

Hinweis:

Das Postfach wurde technisch in Monatsbloecken geladen. Ein Gesamt-Download ist
in der Flatex-Oberflaeche nicht stabil, weil nachgeladene Listeneintraege nur
blockweise serverseitig geoeffnet werden koennen. Die Monatslogik ist deshalb
die robustere Automatisierungsstrategie.

Fuer den laufenden Betrieb ist das Postfach nicht die Primaerquelle fuer den
Depotstand. Es dient als Belegarchiv fuer Steuerreports, Abrechnungen,
Kontoauszuege, Depotauszuege und Sonderfaelle.

## Firestore-Dokumentfakten 2026-06-13

Die Flatex-PDFs aus dem Postfach und den Belegordnern werden jetzt nicht mehr
nur als Archiv betrachtet, sondern generisch in Firestore registriert und
fachlich, soweit moeglich, als Fakten gespeichert.

Technik:

- Parser: `automation/src/flatex-document-parser.mjs`
- Sync: `automation/src/reconcile-flatex-documents-local.mjs`
- Firestore:
  - `sourceDocuments`
  - `sourceDocumentFacts`
  - `agentStatus/flatex_documents`

Verifizierter Lauf:

```bash
cd /Users/niklaskofler/Documents/finanztool/automation
npm run sync:flatex-documents -- --pdf-timeout-ms=30000
```

Ergebnis:

- Flatex-PDFs verarbeitet: 283
- Dokumente in `sourceDocuments`: 283
- `PARSED`: 283
- `UNKNOWN`: 0
- Fakten in `sourceDocumentFacts`: 401
- Health nach Lauf: `OK`, 0 Fehler, 0 Warnungen

Aktuell erkannte Dokumentarten:

- Wertpapierabrechnungen und Fonds-/Zertifikatekaeufe
- Dividenden und Fondsertragsausschuettungen
- Fondsthesaurierungen
- Kontoauszuege inklusive Konto-Bewertungspositionen
- Depotauszuege inklusive Positions-Snapshots
- Steuerbescheinigungen inklusive Einzelpositionen
- Kapitalmassnahmen/Fusionen
- Saldenmitteilungen
- Orderbestaetigungen, Orderaenderungen und Auftragsstreichungen
- Sparplan-/Mandats-/SEPA-/Info-/Kosten-/CFD-Dokumente
- fehlabgelegte externe Dokumente als `misfiled_external`

Wichtig:

Neue Flatex-Dokumente, die kuenftig nicht in diese Klassifizierung passen,
werden durch `automation/src/check-health-local.mjs` in
`systemHealth/current` als Warnung `Flatex-Dokument nicht klassifiziert`
gemeldet. Damit soll sichtbar werden, wenn Flatex neue Dokumenttypen einfuehrt
oder ein Parser erweitert werden muss.
