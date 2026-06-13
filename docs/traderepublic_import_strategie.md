# Trade Republic Import Strategie

Stand: 2026-06-13

## Ziel

Trade-Republic-Transaktionen sollen moeglichst automatisch und zeitnah in die App gelangen.
Wegen 2FA bleibt der direkte automatisierte Broker-Zugriff ungeeignet.

## Neuer Status-Quo ab 2026-06-13

Am 2026-06-13 wurde Trade Republic fachlich neu aufgesetzt. Diese drei frisch
exportierten Dateien sind ab jetzt die Baseline:

- `Transaction export.csv`
- `Account statement.pdf`
- `Tax Report 2025.pdf`

Die Dateien wurden archiviert unter:

```text
/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/01_Originale/TradeRepublic/Baseline/2026-06-13/
```

Firestore wurde aus dieser Baseline neu aufgebaut:

- `sourceDocuments`: 3 Baseline-Dokumente
- `sourceDocumentFacts`: 198 Fakten
- `transactions`: 106 Trades
- `ledgerEntries`: 191 CSV-Zeilen
- `costEvents`: 13 Gebuehren-/Steuerereignisse
- `sourcePositions`: 5 Wertpapierpositionen + Cashkonto

Alter Stand:

- Bisherige Mail-Duplikate und alte Trade-Republic-Imports gelten fachlich als
  obsolet.
- Alte Trade-Republic-`sourcePositions`, `transactions`, `ledgerEntries` und
  `costEvents` wurden geloescht und aus der Baseline neu geschrieben.
- Alte Trade-Republic-`imports` und `rawDocuments` wurden als `OBSOLETE`
  markiert.

Neuer verifizierter Stand nach Kurs-Sync:

- Netto: `2.523,87 EUR`
- Depotwert: `2.374,38 EUR`
- Cashkonto: `149,49 EUR`
- Account-Statement-Zeitraum: `2025-08-01` bis `2026-06-12`

Positionen:

| Position | ISIN | Stueck | Einstand |
| --- | --- | ---: | ---: |
| Stoxx Europe Defense EUR (Acc) | LU3038520774 | 104,072579 | 590,95 EUR |
| Core S&P 500 USD (Acc) | IE00B5BMR087 | 0,295609 | 190,00 EUR |
| NASDAQ100 USD (Acc) | IE00B53SZB19 | 0,267833 | 340,00 EUR |
| Netflix | US64110L1061 | 0,094 | 10,06 EUR |
| Private Equity | LU3176111881 | 11,178226 | 1.145,40 EUR |

Wichtig:

- Der Netflix-Split vom 2025-11-17 wird ueber den CSV-Eintrag
  `CORPORATE_ACTION/SPLIT` eingerechnet.
- Private Equity `LU3176111881` bleibt dokumentbasiert bewertet, weil keine
  stabile Boerse-Frankfurt-Quelle vorhanden ist.
- `agentStatus/traderepublic_mail.reconciliationCutoffDate` steht auf
  `2026-06-13`. Der Mail-Agent darf nur noch Abrechnungen nach diesem Datum
  auf Positionen anwenden.
- Neue Trade-Republic-Dokumente mit `documentType=unknown`,
  `parseStatus=UNKNOWN` oder `parseStatus=UNPARSED` erzeugen in
  `systemHealth/current` eine Warnung
  `Trade-Republic-Dokument nicht klassifiziert`.

## Primaerer Weg: taegliche Abrechnungsmails

Wenn Transaktionen stattgefunden haben, sendet Trade Republic am Ende des Tages automatisch eine Mail:

```text
Duplicates customer Niklas Andre Kofler of DD.MM.YYYY.
```

Diese Mail enthaelt ein oder mehrere passwortgeschuetzte PDFs vom Typ:

```text
duplicates-dispatch_Securities Settlement-<id>.pdf
```

Der geplante Mail-Agent auf dem Mac Studio soll:

1. passende Trade-Republic-Mails erkennen
2. PDF-Anhaenge herunterladen
3. Originaldateien unveraendert archivieren
4. PDF-Passwort aus dem macOS-Schluesselbund lesen
5. PDFs fuer die Textauswertung entschluesseln
6. enthaltene Transaktionen parsen
7. Duplikate erkennen und nach Firestore schreiben

## Passwortbehandlung

Trade Republic sendet das PDF-Passwort separat per Mail:

```text
Password for duplicates of your employees
```

Sicherheitsentscheidung:

- Passwort nicht in der App speichern
- Passwort nicht in Firestore speichern
- Passwort nicht in Git oder Dokumentation speichern
- Passwort lokal im macOS-Schluesselbund des Mac Studio speichern
- Agent soll eine neue Passwort-Mail erkennen und den Schluesselbundwert aktualisieren

## PDF-Text und Entschluesselung

Fuer die woechentlichen bzw. taeglichen Duplicate-/Securities-Settlement-PDFs
ist ein stabiler PDF-Textpfad notwendig.

Technische Regel:

- `qpdf` ist fuer verschluesselte Trade-Republic-PDFs erforderlich, weil der
  Mail-Agent die PDFs zuerst entschluesseln muss.
- `pdftotext` aus Poppler ist fuer die Textextraktion empfohlen.
- `automation/src/pdf-text.mjs` nutzt ab 2026-06-13 automatisch `pdftotext`,
  falls es im `PATH` verfuegbar ist.
- Wenn `pdftotext` fehlt oder fehlschlaegt, faellt der Extractor auf
  `pdfjs-dist` zurueck. Dadurch funktionieren unverschluesselte Reports
  weiterhin, aber fuer den Dauerbetrieb sollte Poppler installiert sein.

Installationscheck:

```bash
command -v qpdf
command -v pdftotext
```

Falls Homebrew auf dem Zielrechner vorhanden ist:

```bash
brew install qpdf poppler
```

## Periodischer Abgleich

Die taeglichen PDFs sind der zeitnahe Transaktionskanal. Folgende Reports bleiben als Kontroll- und Ergaenzungsquellen:

- `Transaction export.csv`: bei manueller Baseline-Erneuerung oder
  Vollstaendigkeitsabgleich
- `Account statement.pdf`: fuer Cash- und Kontoabgleich
- `Tax Report`: jaehrlich als Steuerbeleg

Ein Net-Worth-PDF ist fuer die aktuelle Baseline nicht mehr zwingend, weil
oeffentlich handelbare Positionen ueber Boerse Frankfurt bewertet werden und
Private Equity dokumentbasiert bleibt.

## Noch zu pruefen

1. Welche Transaktionsarten stehen in den taeglichen `Securities Settlement` PDFs?
2. Sind Verkaeufe, Dividenden, Zinsen, Gebuehren und Steuern in den Mail-PDFs
   vollstaendig genug, oder bleiben sie nur Delta-Kanal bis zum naechsten CSV-
   Abgleich?
3. Muss Private Equity monatlich durch einen neuen App-/PDF-Wert aktualisiert
   werden?
4. Kann die Zuordnung anhand einer stabilen Dokument-ID erfolgen?

## Ziel-Aktualitaet

- Transaktionen: automatisch am Folgetag nach Eingang der Sammelmail, aber nur
  nach `2026-06-13`
- Positionen und Marktwerte: oeffentlich handelbare Wertpapiere per
  Boerse-Frankfurt-Kurs-Sync, Private Equity dokumentbasiert
- Cash-Abgleich: periodisch ueber `Account statement.pdf`
