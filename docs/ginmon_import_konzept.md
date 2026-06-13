# Ginmon Import Konzept

## Ziel

Ginmon wird als eigenes Modul gefuehrt. Die App soll den aktuellen Bestand,
die Performance, die Gebuehren und die Strategie sauber auswerten koennen.

## Was wir schon haben

- `Asset Status` Reports mit Depotwert, Geldkonto, Gesamtvermoegen und Gebuehren
- `Account Statements` mit Kontobewegungen und Wertpapierbewegungen
- `Invoices` fuer die laufenden Verwaltungsgebuehren
- `Quarterly Reports` fuer die Zusammenfassung je Quartal
- `Strategie`-Material zur Zielallokation und Risikoausrichtung

## Aktueller Stand

- Zugriff ist ohne 2FA moeglich
- Struktur ist bereits fuer Download und Archivierung geeignet
- Es gibt mehrere Ginmon-Depots/Konten:
  - `Investment`
  - `Ginmon Top Zinsen`
  - `Risikoklasse 10 Global`
- Die laufende Verwaltungsgebuehr liegt bei `0,75 % p.a.`
- Lokal sind aktuell 369 Ginmon-Dateien im Drive-Bereich vorhanden
- Ginmon-Portalabgleich am 2026-06-13:
  - Portal meldet 333 Dokumente
  - alle 333 Portal-Dokumente waren lokal bereits vorhanden
  - 0 neue Downloads
  - zusaetzliche lokale Dateien sind Vertrags-/Strategie-/Info-Unterlagen
- Firestore enthaelt jetzt den generischen Dokumentfaktenlayer fuer Ginmon:
  - `sourceDocuments`: 369 Ginmon-Dokumente
  - `sourceDocumentFacts`: 698 Ginmon-Fakten
  - `docsWithExternalId`: 333, entspricht den Portal-Dokumenten
  - `parsedDocs`: 363
  - `unknownDocs`: 6, nur noch Welcome-/VL-/Vertrags-/Info-Unterlagen

Das bedeutet: Die App kann Ginmon bereits anzeigen, und die Roh-/Belegbasis ist
jetzt generisch in Firestore registriert. Noch offen ist die naechste Stufe:
`sourcePositions` vollstaendig aus API + Dokumentfakten + Kursdaten ableiten.

## Verbindlicher Ginmon-Datenvertrag

Ginmon darf nicht je Depot unterschiedlich behandelt werden. Fuer alle Ginmon-
Depots gilt dieselbe Reihenfolge der Wahrheit:

1. Originaldokumente sind die Beleg- und Wahrheitsquelle fuer alles, was ein
   Dokument ausdruecklich enthaelt:
   - echte Stueckzahlen
   - Einstandswerte
   - Kauf-/Verkaufsabrechnungen
   - Kontobewegungen
   - Gebuehren
   - Steuern
   - Rechnungen
   - Strategie-/Risikoklassenangaben
2. Die Ginmon-API wird fuer Ginmon nur als aktuelle Bewertungsschicht genutzt:
   - aktueller Depot-/Kontowert
   - aktueller Geldkontostand
   - aktueller Wert je ISIN
   - daraus abgeleiteter aktueller Ginmon-Kurs je ISIN:
     `aktueller API-Wert / dokumentierte Stueckzahl`
3. Kursdaten von Boerse Frankfurt werden fuer Ginmon nicht mehr als Default-
   Quelle verwendet. Sie bleiben fuer Flatex und Trade Republic relevant.
4. Wenn eine echte Stueckzahl fuer ein Depot nicht aus Dokumenten oder API
   vorliegt, darf sie nicht als echte Stueckzahl gespeichert werden. Eine
   rechnerische Naeherung darf nur mit `quantityEstimated=true` und `ca.`
   angezeigt werden.

## Verbindliche Firestore-Datenhaltung

Jedes Ginmon-Dokument muss mindestens in diese Ebenen zerlegt werden:

### `sourceDocuments`

Ein Dokument je Originaldatei.

Pflichtfelder:

- `source = ginmon`
- `filePath`
- `fileName`
- `documentType`
- `parseStatus`
- `parserVersion`
- `accountNumber`
- `customerId`
- `valuationDate` oder `reportDate`, falls im Dokument vorhanden
- `parsed` mit allen strukturiert extrahierten Feldern

Idempotenz:

- Wenn die Datei eine Ginmon-Portal-ID im Dateinamen enthaelt, wird die
  Firestore-ID daraus gebildet: `ginmon_doc_<portalDocumentId>`
- Nur wenn keine Portal-ID vorhanden ist, wird ein stabiler Datei-/Pfad-Fallback
  verwendet
- Dadurch erzeugt Archivieren oder Verschieben desselben Ginmon-Dokuments keine
  neue fachliche Dokumentidentitaet

### `sourceDocumentFacts`

Mehrere Fakten je Dokument. Diese Collection ist der generische Rohdatenlayer
fuer Auswertungen und Reconciliation.

Faktentypen fuer Ginmon:

- `account_snapshot`
  - Gesamtvermoegen
  - Depotwert
  - Cash/Geldkonto
  - Bewertungsdatum
  - Gebuehrenuebersicht
- `position_snapshot`
  - ISIN
  - WKN
  - Name
  - echte Stueckzahl, falls im Dokument vorhanden
  - Kurs laut Dokument
  - Einstandswert
  - aktueller Wert laut Dokument
  - Performance laut Dokument
- `invoice`
  - Rechnungsnummer
  - Rechnungsdatum
  - Zeitraum
  - Gebuehr
  - Rabatt
  - MwSt.
  - Gesamtbetrag
- `quarterly_report`
  - Zeitraum
  - Strategie
  - Managementgebuehren
  - Stichtagswert
- `trade`
  - Kauf/Verkauf
  - ISIN
  - Name
  - Stueckzahl
  - Kurs
  - Handelstag/-zeit
  - Boerse
  - Abrechnungs-/Valutadatum
  - Cashbetrag
  - `dedupeKey`
- `earning`
  - Ertrags-/Vorabpauschalenbeleg
  - ISIN
  - Stueckzahl
  - Ex-Tag/Zahltag
  - Investmentertrag
  - steuerlicher Stichtag
  - Fondsart
  - Teilfreistellung
  - `dedupeKey`
- `account_statement`
  - Kontoauszugsnummer
  - Zeitraum
  - alter/neuer Kontostand
  - Anzahl Cash-Buchungen
- `cash_ledger_entry`
  - Buchungsdatum
  - Valuta
  - Buchungstext
  - Betrag
  - `dedupeKey`
- `corporate_action`
  - Depotnummer
  - ISIN
  - Name
  - Bestand zum Informationszeitpunkt
  - Art der Massnahme, z. B. `fee_change`
  - Wirksamkeitsdatum
  - Informationslink, falls vorhanden
  - `dedupeKey`
- `annual_statement`
  - Depotnummer
  - Auszugsnummer
  - Stichtag
  - deklarierte und geparste Positionsanzahl
- `annual_position_snapshot`
  - ISIN
  - Name
  - echte Stueckzahl
  - Verwahrart
  - Lagerland
  - Stichtag
  - `dedupeKey`

### `sourcePositions`

Diese Collection ist nur die aktuelle App-Ansicht. Sie darf nicht die einzige
Wahrheit sein. Sie wird aus API, Dokumentfakten und Kursdaten abgeleitet.

Regel:

- aktuelle Werte/Kurse bevorzugt aus Ginmon-API
- echte Stueckzahlen bevorzugt aus Dokumentfakten
- Einstand/Kosten/Steuern aus Dokumentfakten
- keine Ginmon-Stueckzahlen, Kosten oder Transaktionen aus API ableiten
- geschaetzte Werte muessen als solche markiert bleiben

## Wichtige Felder fuer die App

- Depotwert
- Geldkonto / Liquiditaet
- Gesamtvermoegen
- Nettoumlauf / Einzahlungen
- Performance
- Verwaltungsgebuehren
- Positionen nach ISIN
- Zielstrategie und Risikoprofil

## Sinnvolle Taktung

- Dokumentimport:
  - taeglich um `02:00`
  - laedt neue Portal-Dokumente
  - schreibt `sourceDocuments` und `sourceDocumentFacts`
  - ueberschreibt keine App-Positionen direkt
- API-Sync:
  - stuendlich
  - aktualisiert aktuelle Werte/Cash/API-Kurse
  - nutzt Dokumentfakten fuer Stueckzahlen, Einstand, Kosten und Transaktionen
- Beide Laeufe sollen im Dauerbetrieb headless laufen:
  - `GINMON_HEADLESS=true`
  - Wenn die Ginmon-Session ablaeuft, muss einmal manuell/headed neu
    eingeloggt werden; danach kann der Headless-Betrieb wieder laufen

## Aktueller Dokumentbestand nach Dateinamenanalyse

Stand 2026-06-13 lokal im Google-Drive-Bereich:

- Gesamt: 369 Ginmon-Dateien
- Nach Ablage:
  - `01_Originale`: 333
  - `02_Archiviert`: 36
- Nach erkennbarem Typ aus Dateiname:
  - `trade`: 94
  - `invoice`: 86
  - `account_statement`: 66
  - `earnings`: 29
  - `quarterly_report`: 28
  - `asset_status`: 27
  - `account_balance`: 10
  - `annual_tax`: 2
  - `unknown_by_name`: 27
- Nach Konto aus Dateiname:
  - `003397078001`: 11
  - `003429072006`: 8
  - `003429071008`: 8
- Nach Customer-ID aus Dateiname:
  - `2153769`: 200
  - `2164405`: 85
  - `2164403`: 48
- Firestore-Fakten nach Typ:
  - `position_snapshot`: 250
  - `trade`: 95
  - `invoice`: 88
  - `account_statement`: 77
  - `cash_ledger_entry`: 62
  - `earning`: 34
  - `quarterly_report`: 30
  - `account_snapshot`: 27
  - `annual_position_snapshot`: 23
  - `corporate_action`: 9
  - `annual_statement`: 3

Diese Analyse plus Portalabgleich beweist: Alle aktuell per Ginmon-Dokument-API
sichtbaren Portal-Dokumente sind lokal vorhanden. Sie beweist nicht, dass Ginmon
historisch nie ein Dokument aus dem Portal entfernt hat. Die lokale Ablage und
Firestore-Registry bleiben deshalb die dauerhafte Wahrheit.

## Naechste technische Pflichtschritte

1. Die 6 verbleibenden `unknown` Dokumente sind Welcome-/VL-/Vertrags-/
   Info-Unterlagen. Sie muessen nur klassifiziert werden, falls sie fuer
   Stammdaten oder Vertragsdokumentation ausgewertet werden sollen.
2. `sourcePositions` aus Dokumentfakten + Ginmon-API-Kursen ableiten, nicht
   direkt aus nur einer Quelle.
3. Health-Check erweitern:
   - Warnung, wenn fuer ein aktives Ginmon-Depot keine aktuellen
     `asset_status`-/`position_snapshot`-Fakten vorhanden sind.
   - Warnung, wenn die App echte Stueckzahlen erwartet, aber nur
     `quantityEstimated=true` vorliegt.

## Ablage

Ginmon-Dokumente liegen im Depot-Ordner unter:

`/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/01_Originale/Ginmon`

## Einordnung

Ginmon ist fuer die App vor allem:

- automatisierbarer Bestand
- klare Kostenquelle
- Strategie- und Risikoquelle
- kein manueller Handelsschwerpunkt

Damit ist Ginmon neben Flatex und Trade Republic ein zentrales Modul fuer die
spaeteren Depot- und Kostenanalysen.
