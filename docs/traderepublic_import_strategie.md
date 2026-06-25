# Trade Republic Import Strategie

Stand: 2026-06-22

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

## Verifizierter Stand nach Mail-Fix am 2026-06-21

Nach dem Fix des Apple-Mail-Account-Filters und des Settlement-PDF-Parsers
wurden die drei Abrechnungen aus der Mail vom 17.06.2026 erkannt und
angewendet. `agentStatus/traderepublic_mail` meldete danach:

- `11` Settlement-PDFs verarbeitet
- `3` neue PDFs auf Positionen angewendet
- `0` unparsebare PDFs
- Health: `OK`, `0` Warnungen

Firestore-Stand nach anschließendem Kurs-Sync:

- Netto inkl. Cash: `2.581,03 EUR`
- Wertpapiere/Private Markets: `2.431,54 EUR`
- Cashkonto: `149,49 EUR`
- Einstand Wertpapiere/Private Markets: `2.306,41 EUR`
- G/V: `125,13 EUR` bzw. `5,43 %`

Positionen:

| Position | ISIN | Stueck | Einstand | Letzte Transaktion |
| --- | --- | ---: | ---: | --- |
| Stoxx Europe Defense EUR (Acc) | LU3038520774 | 105,815346 | 600,95 EUR | 2026-06-16 |
| Core S&P 500 USD (Acc) | IE00B5BMR087 | 0,309876 | 200,00 EUR | 2026-06-16 |
| NASDAQ100 USD (Acc) | IE00B53SZB19 | 0,274471 | 350,00 EUR | 2026-06-16 |
| Netflix | US64110L1061 | 0,094 | 10,06 EUR | 2025-11-17 |
| Private Equity | LU3176111881 | 11,178226 | 1.145,40 EUR | 2026-06-08 |

Abgleich gegen `Net Worth.pdf` vom 21.06.2026:

- Mengen stimmen mit dem Report ueberein.
- Werte koennen abweichen, weil die App nach dem Import mit aktuellen
  Boerse-Frankfurt-Kursen bewertet. Der Net-Worth-Report nutzt fuer
  Brokerage Positionen Kursstand 19.06.2026 und fuer Private Equity
  Kursstand 08.06.2026.

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

## Pausierter Weg: automatische Abrechnungsmails

Status seit 2026-06-22:

- Die automatischen `Duplicates customer ...` Mails werden vorerst nicht mehr
  als aktiver fachlicher Aktualisierungskanal genutzt.
- Der Code bleibt im Projekt als Reserve erhalten.
- Der LaunchAgent `com.niklas.finanztool.traderepublic-mail` soll im
  Normalbetrieb nicht geladen sein.
- Full-Refresh und GUI verwenden fuer Trade Republic nur noch
  `traderepublic_manual_exports`.

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

Wichtige Betriebserkenntnis vom 2026-06-21:

- Apple Mail nennt das Gmail-Postfach auf dem Mac Studio `Google`.
- Der Agent darf deshalb nicht fest auf eine Mailadresse als Account-Namen
  filtern. Standard ist jetzt: alle Apple-Mail-Accounts durchsuchen.
- Optional kann mit `TR_MAIL_ACCOUNT` trotzdem ein Account eingeschraenkt
  werden, wenn ein Zielgeraet mehrere passende Postfaecher hat.
- Die Mail vom 17.06.2026 war in Apple Mail vorhanden, wurde aber vorher wegen
  dieses Account-Filters nicht aus dem Postfach in den Drive-Inbox-Ordner
  gespeichert.

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

Hinweis nach dem Abgleich vom 2026-06-21:

- Das Net-Worth-PDF ist trotzdem ein wertvoller Kontrollreport, weil es
  Gesamtwert, Cash, Brokerage und Private Markets aus Trade Republic selbst
  enthaelt.
- Ein eigener Net-Worth-Parser ist noch sinnvoll, damit die App Abweichungen
  zwischen Firestore-Stand und Trade-Republic-Stand aktiv melden kann.
- Der Kurs-Sync berechnet `costValue`, `performanceValue` und
  `performancePct` in `sourceSummaries` wieder aus den aktuellen
  `sourcePositions`. Dadurch bleiben alte Gewinnsummen nach Mail-Updates nicht
  mehr stehen.

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

## Architekturpruefung 2026-06-22

### Aktueller technischer Aufbau

Trade Republic besteht derzeit aus vier Schichten:

1. Manuelle Baseline
   - Script: `automation/src/reconcile-traderepublic-baseline-local.mjs`
   - Quelle: `Transaction export.csv`, `Account statement.pdf`,
     `Tax Report 2025.pdf`
   - Schreibt:
     - `sourceDocuments`
     - `sourceDocumentFacts`
     - `transactions`
     - `ledgerEntries`
     - `costEvents`
     - `sourcePositions`
     - `sourceSummaries/traderepublic`
   - Zweck: sauberer Status-Quo mit vollstaendiger Historie bis zum
     Baseline-Stichtag.

2. Automatischer Mail-Delta-Agent
   - Script: `automation/src/trade-republic-mail-agent.mjs`
   - LaunchAgent: `com.niklas.finanztool.traderepublic-mail`
   - Taktung: stuendlich
   - Mail-Suche:
     - Passwort-Mail: `Password for duplicates`
     - Abrechnungs-Mail: `Duplicates customer ...`
   - Dateipfade:
     - Inbox:
       `00_Inbox/TradeRepublic/MailAttachments`
     - verschluesselte Originale:
       `01_Originale/TradeRepublic/Abrechnungen/Verschluesselt`
     - entschluesselte Kopien/Text:
       `02_Archiviert/TradeRepublic/Abrechnungen/...`
   - Schreibt aktuell:
     - `imports`
     - `rawDocuments`
     - `ledgerEntries`
     - direkte Delta-Anwendung auf `sourcePositions`
     - `agentStatus/traderepublic_mail`
   - Wichtig: Es werden nur neue Abrechnungen nach
     `agentStatus/traderepublic_mail.reconciliationCutoffDate` auf Positionen
     angewendet.

3. Kurs-Sync fuer oeffentlich handelbare Wertpapiere
   - Script: `automation/src/sync-quotes-local.mjs`
   - Quelle: Boerse Frankfurt
   - Betrifft: Trade-Republic-Positionen mit ISIN, soweit Mapping/Kursquelle
     verfuegbar ist.
   - Schreibt aktuelle Kurse, Tagesaenderung und Summary-Werte.
   - Private Equity `LU3176111881` bleibt dokumentbasiert, weil keine stabile
     Boerse-Frankfurt-Quelle existiert.

4. Health/Reconciliation
   - Script: `automation/src/check-health-local.mjs`
   - Warnungen:
     - unklassifizierte Trade-Republic-Dokumente
     - zu alter `traderepublic_mail`-Agent
     - zu alter dokumentbasierter Private-Equity-Wert

### Was die automatischen `Duplicates`-Mails gut koennen

Wenn alle Trade-Republic-Transaktionen als `Securities Settlement`-PDF in den
automatischen `Duplicates customer ...` Mails ankommen und der Parser das Format
kennt, koennen diese Mails nach der Baseline automatisch aktuell halten:

- neue Kaeufe
- Sparplanausfuehrungen
- Verkaeufe, soweit sie im gleichen Settlement-Muster stehen
- Stueckzahlen je ISIN
- Einstandswerte fuer gekaufte Wertpapiere
- realisierte Gewinne bei Verkaeufen naeherungsweise nach vorhandener
  Durchschnittskostenlogik
- Rohnachweis je Abrechnung als verschluesseltes Original, entschluesseltes PDF
  und Textdatei
- zeitnaher Stand fuer oeffentlich handelbare Wertpapiere, wenn danach der
  Kurs-Sync laeuft

Damit sind die automatischen Mails ein guter Delta-Kanal fuer Wertpapier-
Transaktionen.

### Was mit `Duplicates`-Mails allein nicht sicher aktuell bleibt

Nach einem sauberen Status-Quo in der DB koennen die automatischen Mails allein
folgende Daten nicht sicher wahrheitsgetreu halten:

- Vollstaendiger Cash-Stand:
  - Einzahlungen, Auszahlungen, Zinsen, Kartenumsatz, Cashbewegungen ohne
    Wertpapierabrechnung und reine Kontoereignisse sind nicht zwingend in
    `Securities Settlement` enthalten.
  - Der aktuelle Cash-Wert braucht deshalb `Account statement.pdf` oder
    `Net Worth.pdf` als Kontroll-/Snapshotquelle.

- Vollstaendige Konto-/Ledger-Historie:
  - `Transaction export.csv` enthaelt alle CSV-Zeilen mit Kategorien wie
    `INTEREST_PAYMENT`, `TRANSFER_*`, `DIVIDEND`, `TAX`, `FEE`,
    `CORPORATE_ACTION`.
  - Der aktuelle Mail-Agent schreibt aus Settlement-PDFs noch keine
    vollwertigen `transactions`, `costEvents` und `incomeEvents`, sondern
    primaer `ledgerEntries` plus Positionsdelta.

- Dividenden, Zinsen und Steuern:
  - Wenn Trade Republic dafuer keine passenden `Securities Settlement`-PDFs
    sendet oder der Parser das PDF nicht erkennt, fehlen diese Ereignisse bis
    zum naechsten CSV-/Statement-/Tax-Report-Abgleich.
  - Der Tax Report bleibt jaehrlich manuell.

- Corporate Actions:
  - Die Baseline-CSV kann z. B. `CORPORATE_ACTION/SPLIT` sauber verarbeiten.
  - Der Mail-Settlement-Parser verarbeitet aktuell nur BUY/SELL-nahe Muster.
    Splits, Stornos, Korrekturen, Verschmelzungen oder Namensaenderungen
    brauchen CSV-/Dokumentabgleich oder Parser-Erweiterung.

- Private Equity aktueller Wert:
  - Die automatische Mail kann Kaeufe/Einstand fortschreiben.
  - Der aktuelle Wert/Kurs von Private Equity kommt nicht von Boerse Frankfurt.
    Er muss aus Trade-Republic-Dokumenten wie `Net Worth.pdf` kommen.
  - Health markiert diesen Wert als stale, wenn er zu alt wird.

- Offizieller Trade-Republic-Gesamtwert:
  - Die App kann oeffentliche Wertpapiere mit externen Boerse-Frankfurt-Kursen
    aktueller bewerten als Trade Republic selbst.
  - Das ist fachlich okay, aber nicht dasselbe wie der offizielle
    Trade-Republic-Snapshot. Fuer Reconciliation braucht es `Net Worth.pdf`.

- Neue Konten/Unterbereiche:
  - Aktuell modelliert Trade Republic in der App `Broker`; Private Markets ist
    noch kein eigenes `sourceAccounts`-Unterkonto.
  - Wenn Trade Republic spaeter neue Bereiche/Konten einfuehrt, erkennen
    Duplicates-Mails das nicht zwingend als vollstaendige Struktur.

- Manuelle App-Exporte ohne Betreff:
  - Der bestehende Mail-Agent sucht gezielt nach `Duplicates customer ...`.
  - Selbst gemailte App-Exporte ohne Betreff werden aktuell nicht automatisch
    klassifiziert.
  - Dafuer braucht es einen separaten Inbox-/Attachment-Klassifizierer, der nach
    Inhalt statt nach Betreff entscheidet.

## Moegliche Zielmodelle

### Option A: Nur automatische `Duplicates`-Mails plus Kurs-Sync

Beschreibung:

- Mail-Agent laeuft stuendlich.
- Neue Settlement-PDFs werden importiert.
- Danach laeuft Kurs-Sync fuer oeffentlich handelbare Positionen.

Vorteile:

- Kein manueller Eingriff im Normalfall.
- Kaeufe/Sparplaene/Verkaeufe kommen zeitnah in die App.
- Oeffentliche Wertpapiere koennen sehr aktuell bewertet werden.

Nachteile:

- Cash ist nicht garantiert aktuell.
- Private Equity wird nicht aktuell bewertet.
- Dividenden/Zinsen/Steuern/Kosten sind nicht garantiert vollstaendig.
- Corporate Actions und Korrekturen koennen fehlen.
- Offizieller Trade-Republic-Gesamtwert fehlt als Kontrollwert.

Einordnung:

- Gut fuer taegliche Naehe.
- Nicht genug als alleinige Wahrheit.

### Option B: Duplicates-Mails als Delta, periodischer manueller Snapshot als Wahrheit

Beschreibung:

- Automatische Duplicates-Mails laufen weiter stuendlich.
- Zusaetzlich wird z. B. woechentlich oder monatlich ein manueller App-Export
  abgelegt:
  - `Transaction export.csv`
  - `Account statement.pdf`
  - `Net Worth.pdf`
  - `Tax Report` jaehrlich
- Die App vergleicht den Delta-Stand gegen den neuesten Snapshot und warnt bei
  Abweichungen.

Vorteile:

- Sehr hohe fachliche Verlaesslichkeit.
- Cash, Private Equity und offizieller Trade-Republic-Gesamtwert bleiben
  kontrollierbar.
- Duplicates-Mails halten den Alltag aktuell, Snapshot korrigiert die Luecken.

Nachteile:

- Nicht vollautomatisch.
- Snapshot muss aktiv vom Handy exportiert/gesendet werden.
- Ohne weiteren Klassifizierer sind selbst gemailte App-Exporte noch manuell in
  den richtigen Ordner zu legen oder mit separatem Agenten zu erkennen.

Einordnung:

- Fachlich aktuell beste Zielarchitektur.

### Option C: Zusätzlicher No-Subject-Export-Agent

Beschreibung:

- Neben `traderepublic_mail` gibt es einen zweiten Agenten, z. B.
  `traderepublic_manual_exports`.
- Dieser Agent sucht nicht nach Betreff, sondern nach neuen PDF-/CSV-Anhaengen
  von dir selbst oder in einem Drive-Inbox-Ordner.
- Er klassifiziert nach Inhalt:
  - Net Worth
  - Account Statement
  - Transaction Export
  - Tax Report
  - unbekanntes Dokument

Vorteile:

- Wenn ein manueller App-Export doch noetig ist, reicht senden/ablegen; der Rest
  laeuft automatisch.
- Kein Betreff noetig.
- Unbekannte Dokumenttypen erzeugen Health-Warnungen.

Nachteile:

- Der manuelle Export am Handy bleibt.
- Es braucht neue Parser-/Klassifizierlogik.
- Mail-Zugriff nach beliebigen Anhaengen muss vorsichtig gefiltert werden, damit
  keine fremden Dateien importiert werden.

Einordnung:

- Sinnvolle Ergaenzung, falls Option B genutzt wird.

## Empfohlener Zielbetrieb

Empfehlung fuer Trade Republic:

1. Selbst gemailte No-Subject-Exporte sind der aktive Importkanal.
2. Boerse-Frankfurt-Kurse bleiben der aktuelle Kurskanal fuer oeffentlich
   handelbare Wertpapiere.
3. `Net Worth.pdf` wird als offizieller Kontroll-Snapshot eingefuehrt:
   - Gesamtwert
   - Brokerage
   - Private Markets
   - Cash
   - Positionen, Stueck, Trade-Republic-Kurs, Trade-Republic-Kursdatum
4. `Account statement.pdf` wird fuer Cash-Reconciliation verwendet.
5. `Transaction export.csv` bleibt die taegliche Vollstaendigkeitsquelle fuer
   Ledger, Kosten, Zinsen, Steuern, Dividenden und Corporate Actions.
6. `Tax Report` bleibt jaehrlich manuell.

Damit ist die App im Alltag automatisch aktuell, aber sie markiert klar, welche
Bestandteile nur Delta-basiert sind und wann der letzte offizielle
Trade-Republic-Snapshot vorliegt.

## Verbindliche Betriebsentscheidung 2026-06-22

Die Trade-Republic-Aktualisierung besteht ab jetzt aus einem aktiven Agenten:

1. `traderepublic_manual_exports`
   - verarbeitet selbst an die eigene Mailadresse gesendete App-Exporte ohne
     Betreff.
   - durchsucht aus Sicherheits- und Laufzeitgruenden nur No-Subject-Mails der
     letzten 14 Tage.
   - erwartete Anhaenge:
     - `Net Worth.pdf`
     - `Transaction export.csv`
     - `Account statement.pdf`
     - `Tax Report ...pdf` jaehrlich, falls neu verfuegbar
   - laeuft auf dem Mac Studio alle 15 Minuten.
   - wird auch beim App-Button `Alles aktualisieren` ueber den Full-Refresh
     sofort ausgefuehrt.

Der fruehere Agent `traderepublic_mail` fuer automatische
`Duplicates customer ...` Mails ruht vorerst. Diese Mails werden nicht mehr
automatisch auf den Trade-Republic-Bestand angewendet, solange der Nutzer nicht
ausdruecklich entscheidet, diesen Kanal wieder zu aktivieren.

Duplikatregel:

- `Transaction export.csv` darf ueberlappende Zeitraeume enthalten.
- Eine Transaktion wird in Firestore ueber `source + transaction_id`
  eindeutig gemacht.
- Ueberlappende CSV-Zeilen werden nicht doppelt auf Einstand, Kosten, Zinsen,
  Dividenden oder Ledger angerechnet.
- Nach einem Transaction-Export wird
  `agentStatus/traderepublic_mail.reconciliationCutoffDate` als
  Reaktivierungs-Schutz auf das neueste CSV-Buchungsdatum fortgeschrieben.

Kurs-/Snapshotregel:

- Oeffentlich handelbare Wertpapiere werden weiterhin mit Boerse-Frankfurt-
  Kursen aktuell bewertet.
- Der Net-Worth-Export speichert zusaetzlich den offiziellen
  Trade-Republic-Broker-Snapshot je Position.
- Private Markets werden aus dem Net-Worth-Dokument bewertet.
- Die App zeigt bei Positionen an, ob der aktive Kurs aus Frankfurt, dem Broker
  oder einer anderen Quelle kommt.

Manueller Exportplan:

- Bis Trade Republic eine bessere automatische Exportmoeglichkeit anbietet,
  sendet der Nutzer moeglichst taeglich drei App-Exporte ohne Betreff an die
  eigene Mailadresse.
- Die Uhrzeit ist nicht verbindlich. Wenn der Nutzer den Export vergisst, bleibt
  der letzte bekannte Stand gueltig und die App muss den Stand klar anzeigen.
- Pflichtpaket:
  - `Net Worth.pdf`, weil dieses Dokument den offiziellen Trade-Republic-
    Snapshot fuer Brokerage, Private Markets, Cash und Gesamtwerte enthaelt.
  - `Transaction export.csv`, weil daraus Einstand, Stueckzahlen,
    Gebuehren, Steuern, Zinsen, Dividenden, Corporate Actions und Ledger-
    Historie nachvollzogen werden.
  - `Account statement.pdf`, weil Cash und Kontoereignisse damit kontrolliert
    werden.
- `Tax Report ...pdf` wird nur jaehrlich oder nach neuer Bereitstellung
  importiert.
- Der Manual-Export-Agent muss ueberlappende Transaction-Exports idempotent
  behandeln. Gleiche Transaktions-IDs duerfen Einstand, Kosten, Zinsen,
  Dividenden und Ledger nicht doppelt veraendern.
- Der Agent importiert, sobald die Dokumente im Postfach sind und ein
  15-Minuten-Lauf sie erkennt.
- Der App-Button `Alles aktualisieren` muss diesen Manual-Export-Agent sofort
  mit ausfuehren, damit frisch gemailte Dokumente direkt verarbeitet werden.
- Bekannte Mail-Anhaenge duerfen bei Wiederholungsscans nicht erneut
  ueberschrieben werden. Grund: Ein Ueberschreiben waehrend des 15-Minuten-
  Laufs kann dazu fuehren, dass das Net-Worth-PDF kurz als `UNVOLLSTAENDIG`
  gelesen wird.
- Wenn ein Dokument bereits einmal vollstaendig als `PARSED` angewendet wurde,
  darf ein spaeterer transient schlechter Wiederholungsscan keine Health-
  Warnung erzeugen.

Abweichungsbefund vom 2026-06-22:

- Handy-App Screenshot 2026-06-22 01:39:
  - Total: `2.623,72 EUR`
  - Brokerage: `1.241,90 EUR`
  - Private Markets: `1.381,82 EUR`
- Net-Worth-PDF 2026-06-22 01:26:
  - Gesamt: `2.570,22 EUR`
  - Brokerage: `1.238,91 EUR`
  - Private Markets: `1.181,82 EUR`
  - Cash: `149,49 EUR`
- Der groesste Unterschied ist Private Markets: exakt `200,00 EUR`.
- Schlussfolgerung: Trade Republic App-Livewerte und Net-Worth-Export koennen
  auseinanderlaufen. Die App darf diese Werte nicht still vermischen, sondern
  muss Quelle, Stand und Abweichung sichtbar machen.

## Umsetzungsplan Trade Republic

1. Pausierten Mail-Agent nur bei Reaktivierung fachlich vervollstaendigen:
   - `lastAgentRunAt` und `lastAgentSuccessAt` sauber schreiben.
   - Settlement-PDFs auch in `sourceDocuments` registrieren.
   - Settlement-Fakten in `sourceDocumentFacts` schreiben.
   - BUY/SELL in `transactions` schreiben, nicht nur in `ledgerEntries`.
   - Gebuehren/Steuern aus Settlement-PDFs extrahieren, falls im Text vorhanden.
   - Falls nicht vorhanden: explizit `costBasisCompleteness=delta_only` oder
     aehnliches Feld setzen.

2. Net-Worth-Parser bauen:
   - `Brokerage`, `Private Markets`, `Cash`, `GESAMT` extrahieren.
   - Positionen mit ISIN, Stueck, Kurs, Kurswert und Kursdatum extrahieren.
   - `sourceDocuments` und `sourceDocumentFacts` schreiben.
   - Private-Equity-Position aus Net Worth aktualisieren.
   - Reconciliation gegen App-Positionen erzeugen.

3. Account-Statement-Update als Snapshot-Import bauen:
   - Cash-Schlussbestand und Zeitraum extrahieren.
   - `sourcePositions/traderepublic_cash` aktualisieren.
   - Abweichung zwischen Cash laut Delta und Cash laut Statement melden.

4. Optionalen No-Subject-Export-Agent bauen:
   - eigener Agent fuer selbst gemailte App-Exports oder Drive-Inbox.
   - Klassifizierung nach Inhalt statt Betreff.
   - Unbekannte Dokumente als `UNKNOWN` speichern und Health-Warnung erzeugen.
   - Status 2026-06-22: umgesetzt als
     `automation/src/trade-republic-manual-export-agent.mjs`.
   - npm-Scripte:
     - `npm --prefix automation run reconcile:traderepublic-manual-exports`
     - `npm --prefix automation run sync:traderepublic-manual-exports`
     - `npm --prefix automation run install:traderepublic-manual-export-agent`

5. Health-Regeln erweitern:
   - Warnung, wenn Cash-Snapshot zu alt ist.
   - Warnung, wenn Private-Equity-Wert zu alt ist.
   - Warnung, wenn Net-Worth-Gesamtwert stark vom App-Wert abweicht.
   - Warnung, wenn Settlement-PDFs `PARSED_PARTIAL` oder `UNPARSED` sind.

6. GUI-Transparenz:
   - Trade-Republic-Karte zeigt:
     - Manual-Export-Stand
     - offizieller Snapshot-Stand aus Net Worth/Account Statement
     - Kursstand Boerse Frankfurt
     - Agentenbox mit Manual-Export-Agent
   - Positionen zeigen, ob Wert aus Boerse Frankfurt oder Trade-Republic-Dokument
     kommt.

## Manuelle Stichprobe 2026-06-22

Read-only geprueft mit:

- `/Users/niklaskofler/Downloads/Transaction export 2.csv`
- `/Users/niklaskofler/Downloads/Account statement 2.pdf`
- `/Users/niklaskofler/Downloads/Net Worth.pdf`

Ergebnis:

- Transaction Export 2:
  - `196` Datenzeilen
  - gleiche 5 Positionen wie erwartet
  - Cash laut Account Statement 2: `149,49 EUR`
  - Account-Statement-Zeitraum bis `2026-06-20`
- Net Worth vom `2026-06-21`:
  - Brokerage: `1.238,91 EUR`
  - Private Markets: `1.181,82 EUR`
  - Cash: `149,49 EUR`
  - Gesamt: `2.570,22 EUR`
  - Private Equity Kursstand: `08.06.2026`
  - Brokerage-Kursstand: `19.06.2026`

Schlussfolgerung:

- Die Duplicates-Mails haben die Mengen/Einstandswerte nach Baseline gut
  fortgeschrieben.
- Der offizielle Trade-Republic-Gesamtwert, Cash-Snapshot und Private-Equity-
  Marktwert kommen aber nur aus den manuellen Snapshot-Dokumenten.

Umsetzungstest 2026-06-22:

- Neuer Manual-Export-Agent im Dry-Run gegen die drei Beispiel-Dateien
  erfolgreich:
  - `Account statement 2.pdf`: `account_statement`, `PARSED`,
    Periodenende `2026-06-20`
  - `Net Worth.pdf`: `net_worth`, `PARSED`, Snapshot `2026-06-21`,
    `5` Positionen
  - `Transaction export 2.csv`: `transaction_export`, `PARSED`,
    `196` CSV-Zeilen
- Testmodus nutzte `--no-mail --no-firestore --no-quotes` und einen
  temporaeren Test-Drive, damit keine produktiven Firestore-Daten veraendert
  wurden.
- Ein erster zu breiter Mail-Scan hatte alte Mai-Exportkopien und ein
  fachfremdes PDF in `00_Inbox/TradeRepublic/ManualExports` gespeichert.
  Diese Staging-Kopien wurden nach
  `02_Archiviert/TradeRepublic/ManualExports/Ignored` verschoben; die
  produktive Inbox enthaelt danach nur die drei aktuellen Juni-Dateien.
- Produktivstand nach Korrekturlauf:
  - `agentStatus/traderepublic_manual_exports=OK`
  - `3` Dokumente geprueft
  - `latestTransactionDate=2026-06-16`
  - `skippedKnownDocumentCount=3` im Wiederholungslauf, also keine
    erneute Vollschreibung bekannter Exportdateien
  - LaunchAgent auf dem Mac Studio geladen:
    `com.niklas.finanztool.traderepublic-manual-exports`

## Portal-Refresh per App-Button 2026-06-22

Ziel:

- In der Trade-Republic-Karte gibt es einen eigenen `Refresh`-Button.
- Der Button schreibt den Firestore-Command
  `automationCommands/traderepublic_portal_refresh` mit
  `type=traderepublic_portal_refresh`.
- Der lokale Command-Runner auf dem Mac Studio fuehrt daraufhin
  `automation/src/download-traderepublic-local.mjs --write` aus.

Ablauf:

1. Chrome wird mit einem eigenen lokalen Profil geoeffnet:
   `~/.finanztool/browser-profiles/traderepublic`.
2. Telefon und PIN werden nur aus dem macOS-Schluesselbund oder lokalen
   Umgebungsvariablen gelesen:
   - `finanztool-traderepublic-phone`
   - `finanztool-traderepublic-pin`
3. Nach Telefon/PIN wartet der Agent auf die Bestaetigung in der
   Trade-Republic-App.
4. Danach liest er im Portal drei Bereiche read-only:
   - `Portfolio`: aktueller Investmentwert, gelistete Positionen und
     Tagesveraenderung.
   - `Transactions`: aktueller Cashstand und sichtbare neue Bewegungen.
   - `Activity`: Portalhinweise und Dokument-/Supportaktivitaeten als
     Transparenzsignal.
5. Die Portfolio-Liste wird vor dem Parsen auf `Since buy` gestellt.
   `Daily trend` enthaelt nur Tagesbewegungen und darf nicht als
   Positionsbestand verwendet werden.
6. Geschrieben wird ein Portal-Snapshot:
   - lokale JSON-Datei in
     `02_Archiviert/TradeRepublic/ManualExports/PortalSnapshots`
   - `sourceDocumentFacts/traderepublic_portal_snapshot_latest`
   - `sourcePositions` fuer eindeutig per Name gematchte sichtbare
     Brokerage-Positionen mit `quoteProvider=traderepublic_portal_web`
   - `sourcePositions/traderepublic_cash` aus dem Cashwert der
     Transaktionsseite
   - Private Markets nur als `traderepublic_portal_total_implied`, also
     Portfolio-Gesamtwert minus gelistete Positionen
   - `sourceSummaries/traderepublic` mit `netValue` inklusive Cash und
     `depotValue` als Investmentwert ohne Cash
7. Danach sucht der Agent einen offiziellen CSV/PDF-Download. Nur wenn Chrome
   wirklich eine Datei herunterlaedt, wird diese in
   `00_Inbox/TradeRepublic/ManualExports/Portal` abgelegt.
8. Anschliessend laeuft derselbe Parser/Dedupe-Pfad wie fuer selbst gemailte
   Exporte:
   `trade-republic-manual-export-agent.mjs --write --no-mail --inbox-dir ...`

Fail-Safe:

- Wenn die Web-App keinen offiziellen Download anbietet, ist das seit
  2026-06-23 kein harter Fehler mehr, solange der Portal-Snapshot erfolgreich
  gelesen wurde.
- Der Agent schreibt dann `agentStatus/traderepublic_portal=OK` mit Hinweis,
  dass kein offizieller Download-Button gefunden wurde, und legt zusaetzlich
  einen Diagnose-Snapshot ab.
- Browsertext ist eine aktuelle Bewertungs- und Transparenzquelle, aber kein
  vollstaendiger Audit-Ersatz. Kosten, Steuern, Einstand und Historie bleiben
  ueber `Transaction export`, Abrechnungs-PDFs, `Account statement`,
  `Net Worth` und Tax-Reports abzusichern.

Bekannte Einschraenkung:

- Die Trade-Republic-Webseite liefert in der sichtbaren Transaktionsliste nur
  geladene Eintraege. Diese werden als Portal-Beobachtung gespeichert, aber
  nicht als vollstaendige Ledger-Historie interpretiert.
- Fuer historische Vollstaendigkeit bleiben die App-Exporte per Mail
  notwendig.
- Echte Abrechnungs-PDFs, die im Portal hinter einzelnen Transaktionen liegen,
  sind fachlich wertvoll, werden aber erst in einem naechsten Schritt
  automatisch pro Transaktion geoeffnet, heruntergeladen, gehasht und geparst.

Verifikation 2026-06-23:

- Trockenlauf und echter `--write`-Lauf erfolgreich.
- Korrigierter Zahlenparser verarbeitet englisches Portalformat wie
  `€10.00` und deutsches Format wie `10,00 EUR`.
- Portal-Snapshot im Write-Lauf:
  - Portfolio-Gesamtwert: `2.445,65 EUR`
  - gelistete Positionen: `1.263,83 EUR`
  - implizite Private Markets: `1.181,82 EUR`
  - Cash: `149,49 EUR`
  - `netValue`: `2.595,14 EUR`
  - sichtbare Positionen: `4`
  - sichtbare Transaktionen: `30`

## Zielbild ohne Mail-Agent ab 2026-06-23

Fachliches Ziel:

- Der Trade-Republic-Mail-Agent soll mittelfristig entfallen.
- Der Webportal-Agent soll alle fachlich relevanten Daten direkt aus dem
  authentifizierten Trade-Republic-Webportal holen.
- Bevorzugte Quelle sind offizielle PDFs/Downloads aus dem Portal.
- DOM-Scraping ist zulaessig fuer:
  - aktuelle Portalwerte
  - Transaktionsdetails, wenn kein PDF existiert
  - Fallback bei PDF-Fehlern, muss aber klar als Portal-DOM-Quelle markiert
    werden.

Login-/Approval-Regel:

- Der Agent nutzt lokal gespeicherte Telefonnummer/PIN.
- Nach PIN-Eingabe wartet er auf die Freigabe in der Trade-Republic-App.
- Die App-Karte muss diesen Zustand sichtbar anzeigen.
- Umsetzung: Der Refresh-Button liest waehrend des laufenden Commands
  `agentStatus/traderepublic_portal.message`. Bei Meldungen zur
  App-Bestaetigung zeigt der Button `App bestätigen`.

## Portal-PDF-Inventarisierung 2026-06-23

Technische Beobachtung:

- Transaktionen in `Profile > Transactions` sind im DOM als
  `div role=button` greifbar.
- Detailansichten enthalten strukturierte Portaltexte mit:
  - Titel, Datum/Uhrzeit
  - Status
  - Asset/Payment/Sender/Recipient
  - Menge x Kurs, Betrag, Gebuehr, Steuer
  - Dokumentbereich
- Echte Dokumente oeffnen typischerweise einen neuen PDF-Tab mit temporaerer
  Presigned-URL. Diese URLs duerfen nicht gespeichert werden; der Agent muss
  die PDF sofort herunterladen, hashen und lokal/Storage archivieren.

Gefundene Dokumenttypen:

1. `Billing Execution`
   - Typische Quelle: ETF-/Wertpapier-Sparplanausfuehrungen.
   - Mechanismus: PDF-Popup-URL, erfolgreich herunterladbar.
   - Beispielinhalt:
     - `WERTPAPIERABRECHNUNG SPARPLAN`
     - Datum, Ausfuehrungs-ID, Sparplan-ID, Depot
     - Handelsplatz/Kontrahent
     - Position, ISIN, Stueck, Durchschnittskurs, Betrag
     - Verrechnungskonto, Wertstellung, Buchungsbetrag
   - Fachlich wichtig fuer:
     - `transactions`
     - `ledgerEntries`
     - Einstandswert/Menge/Kurs
     - Dokumentnachweis in `sourceDocuments/sourceDocumentFacts`

2. `Inbound Invoice`
   - Typische Quelle: Einzahlung per Lastschrift.
   - Mechanismus: PDF-Popup-URL, erfolgreich herunterladbar.
   - Beispielinhalt:
     - `ABRECHNUNG EINZAHLUNG`
     - Gesamtbetrag
     - Gebuehr fuer Einzahlung via Lastschrift
     - Verrechnungskonto und Wertstellung
   - Fachlich wichtig fuer:
     - Cash-`ledgerEntries`
     - moegliche Einzahlungsgebuehren als `costEvents`
     - Cash-Reconciliation

3. `Statement`
   - Typische Quelle: Zinsereignisse.
   - Portal-Detail enthaelt bereits:
     - `Accrued`
     - `Taxes`
     - `Total`
   - Dokumentbutton war sichtbar, lieferte im Test aber
     `Something went wrong`. Der Crawler braucht hier Retry/Diagnose.
   - Bis PDF stabil ladbar ist, kann das DOM als Fallback fuer
     `incomeEvents` und Steuer-`costEvents` dienen, muss aber als
     `traderepublic_portal_dom` gekennzeichnet werden.

4. `Transaction confirmation`
   - Typische Quelle: Bankueberweisungen aus/ein.
   - Portal-Detail enthaelt Sender/Recipient, IBAN, Total.
   - Dokumentbutton ist sichtbar, im ersten Test aber ebenfalls nicht
     heruntergeladen worden und erzeugte `Something went wrong`.
   - Crawler braucht Retry und frische Detailoeffnung je Dokument.

5. `Dividend equivalent`
   - Typische Quelle: Dividenden-/Steuerereignis.
   - Portal-Detail enthaelt Status, Asset und Tax.
   - Dokumentbereich zeigt Label plus Datum; DOM-Struktur ist zweizeilig.
   - Crawler muss Dokumentcontainer statt nur exakten Labeltext klicken.

6. Private Markets
   - Neu angelegte Sparplan-Transaktion `Created` hat im Test kein PDF.
   - Aeltere ausgefuehrte Private-Equity-Transaktion hat `Billing Execution`
     mit Menge x Kurs.
   - Daraus koennen Menge, Einstandskurs und Einstandswert fuer Private Equity
     fachlich besser abgeleitet werden als aus dem reinen Net-Worth-Snapshot.

Naechster Implementierungsschritt:

1. Portal-PDF-Crawler bauen:
   - Transaktionsliste bis zum letzten bekannten Dokument/Datum scrollen.
   - Jede neue Transaktion oeffnen.
   - Dokumentbuttons/-container erkennen.
   - PDF sofort herunterladen.
   - SHA-256 bilden.
   - Original in `01_Originale/TradeRepublic/PortalDocuments` archivieren.
   - Text in `02_Archiviert/TradeRepublic/PortalDocuments/Text` ablegen.
   - `sourceDocuments` schreiben.
2. Parser pro Dokumenttyp:
   - `Billing Execution`
   - `Inbound Invoice`
   - `Interest Statement`
   - `Transaction confirmation`
   - `Dividend equivalent`
3. Dedupe:
   - Primaer ueber PDF-Hash.
   - Wenn vorhanden zusaetzlich ueber Ausfuehrungs-ID, Sparplan-ID,
     Datum, ISIN/Menge/Betrag.
4. Warnungen:
   - Sichtbarer Dokumentbutton, aber PDF-Download fehlgeschlagen.
   - Neuer Dokumenttyp/Label unbekannt.
   - DOM-Transaktion ohne PDF und ohne Parserklassifikation.
   - Portalwert weicht stark von letztem offiziellen Net-Worth-Export ab.

## Portal-PDF-Crawler Umsetzung 2026-06-23

Umgesetzt in `automation/src/download-traderepublic-local.mjs`:

- Nach dem Portal-Snapshot oeffnet der Agent `Profile > Transactions`.
- Er scannt begrenzt die sichtbaren Transaktionskarten
  (`TR_PORTAL_DOCUMENT_SCAN_LIMIT`, Default `16`).
- Er erkennt derzeit diese Dokumentlabels:
  - `Billing Execution`
  - `Inbound Invoice`
  - `Statement`
  - `Transaction confirmation`
  - `Dividend equivalent`
- PDF-Popups werden sofort geladen; temporaere Presigned-URLs werden nicht
  gespeichert.
- Jede PDF wird per SHA-256 dedupliziert.
- Originale werden lokal archiviert unter
  `01_Originale/TradeRepublic/PortalDocuments/<documentType>/`.
- Extrahierter Text wird abgelegt unter
  `02_Archiviert/TradeRepublic/PortalDocuments/Text/<documentType>/`.
- Bei `--write` schreibt der Agent:
  - `sourceDocuments/traderepublic_portal_document_<hash>`
  - `sourceDocumentFacts/traderepublic_portal_fact_<hash>`
  - bei Fehlern `sourceDocumentFacts/traderepublic_portal_document_failure_*`
- Der Agent-Status enthaelt danach:
  - wie viele Portal-Transaktionen gescannt wurden
  - wie viele Dokumente gefunden/heruntergeladen/geparst wurden
  - welche Dokumente fehlgeschlagen oder unbekannt sind.

Parserstand:

- `Billing Execution` wird fachlich als `security_execution` geparst:
  Datum, Ausfuehrungs-ID, Sparplan-ID, Depot, Handelsplatz, Kontrahent, Name,
  ISIN, Stueck, Durchschnittskurs, Betrag, Verrechnungskonto, Wertstellung und
  Buchungsbetrag.
- `Inbound Invoice` wird fachlich als `cash_deposit` geparst:
  Datum, Depot, Gesamtbetrag, Einzahlungsgebuehr, Verrechnungskonto,
  Wertstellung und Buchungsbetrag.
- `Statement`, `Transaction confirmation` und `Dividend equivalent` werden in
  dieser Stufe als Portal-Dokument-Fakten abgelegt, aber noch nicht voll in
  `incomeEvents`, `costEvents`, `transactions` und `ledgerEntries`
  ueberfuehrt.

Teststand:

- Syntaxcheck fuer den Agenten erfolgreich.
- App-Build erfolgreich.
- Login-Erkennung wurde korrigiert: authentifizierte URLs wie
  `/profile/activities` gelten als eingeloggt, auch wenn der Seitentext noch
  nicht voll geladen ist.
- Die Trade-Republic-Detailansicht ist keine ARIA-Dialogstruktur, sondern eine
  `.sideModal`. Dokumentbuttons liegen darunter in `.detailDocuments`.
  Der Crawler darf deshalb nicht die ganze Seite nach Dokumentlabels scannen,
  weil sonst Transaktionskarten mit aehnlichem Text als Dokumente
  fehlinterpretiert werden koennen.
- Echter `--write`-Lauf am 2026-06-23 erfolgreich:
  - `sourceDocuments`: 4 Portal-Dokumente
  - `sourceDocumentFacts`: 4 Portal-Fakten
  - 3 `security_execution` aus `Billing Execution`
  - 1 `cash_deposit` aus `Inbound Invoice`
  - 0 Portal-Dokumentfehler
  - `agentStatus/traderepublic_portal=OK`
- Der Status zeigt kuenftig sowohl die im aktuellen Lauf gespeicherten PDFs als
  auch die kumulierte Portal-Dokumentanzahl.

## Portal-Fakten operative Anwendung 2026-06-23

Umgesetzt in `automation/src/download-traderepublic-local.mjs`:

- Portal-Dokumente bekommen neben dem PDF-Hash eine fachliche
  `portalTransactionSignature` aus:
  - Dokumentlabel
  - Portal-/Dokumentdatum
  - Transaktionstitel
  - Betrag
- Dadurch weiss der Agent schon vor dem Klick auf ein Dokument, ob ein
  sichtbarer Portalvorgang bereits heruntergeladen wurde.
- Bereits geladene Portal-Dokumente koennen ohne Browser neu angewendet
  werden:
  - `npm --prefix automation run sync:traderepublic-portal-facts`
- Die operative Anwendung schreibt idempotent:
  - `transactions/traderepublic_portal_tx_*`
  - `ledgerEntries/traderepublic_portal_ledger_*`
  - bei Gebuehren `costEvents/*`
  - aktualisierte `sourcePositions` fuer Menge/Einstand, wenn kein manueller
    Export denselben Vorgang bereits enthaelt
  - `sourceDocumentFacts/traderepublic_portal_application_*` als
    Anwendungsspur
- Jeder angewendete Portalvorgang wird in `sourceDocumentFacts` mit
  `factType=portal_document_application` und `status=APPLIED` markiert.
- Wenn derselbe Vorgang im manuellen Trade-Republic-Export bereits vorhanden
  ist, wird er nicht operativ geschrieben, sondern als
  `status=SKIPPED_DUPLICATE_MANUAL` dokumentiert.
- Wertpapierausfuehrungen werden ueber Datum, ISIN, Menge und Betrag gegen
  manuelle CSV-Fakten abgeglichen.
- Cash-Einzahlungen werden ueber Wertstellung, Betrag und Konto gegen manuelle
  CSV-Fakten abgeglichen.

Verifikation 2026-06-23:

- `node --check automation/src/download-traderepublic-local.mjs` erfolgreich.
- Grosser Portal-Lauf mit `TR_PORTAL_DOCUMENT_SCAN_LIMIT=80`:
  - 67 Portal-Dokumente insgesamt
  - 65 `billing_execution`
  - 1 `inbound_invoice`
  - 1 `tax_report`
  - alle 67 als `PARSED`
- Tax Report 2025:
  - im Webportal unter `Profile > Activity > Annual Tax Report 2025`
  - Dokumentbutton `Tax Report 2025`
  - echtes PDF ueber temporaere PDF-URL
  - als `sourceDocuments/...documentType=tax_report` und
    `sourceDocumentFacts/...factType=tax_report` gespeichert
- Portal-Anwendung:
  - 66 Portal-Dokumentanwendungen fuer Transaktions-/Cash-Dokumente
  - 4 `APPLIED`:
    - 3 neue Wertpapierausfuehrungen vom 23.06.2026
    - 1 Einzahlung vom 23.06.2026
  - 62 `SKIPPED_DUPLICATE_MANUAL`, weil im manuellen Export bereits bekannt
- Private-Markets-Korrektur:
  - Private-Equity-Portal-PDFs bleiben als Dokumentfakten erhalten.
  - Sie duerfen nicht zusaetzlich operativ zaehlen, wenn dieselben Cashflows
    bereits als `private_market_cash` im `Transaction export.csv` existieren.
  - Sechs zuvor angewendete Private-Equity-Portalbuchungen wurden auf
    `SKIPPED_DUPLICATE_MANUAL` gesetzt und aus `transactions`/`ledgerEntries`
    entfernt.
  - Private-Equity-Einstand kommt nicht aus allen
    `private_market_cash`-Fakten, weil diese auch Vorabzahlungen/Cashflows
    enthalten koennen, die noch nicht als ausgefuehrte Einheiten im Bestand
    stehen.
  - Regel seit 2026-06-23: Fuer Private Equity `LU3176111881` haben
    ausgefuehrte Trade-Fakten Vorrang. Einstand = Summe `Stueck * Kurs` aus
    `factType=trade`; Stand Gegencheck: `11,178226` Stueck,
    `1.145,40 EUR` Einstand.
  - `private_market_cash` ist nur noch Rueckfallquelle, wenn keine
    ausgefuehrten Private-Equity-Trade-Fakten vorhanden sind.
- Firestore danach:
  - 67 Portal-Dokumente
  - 67 Portal-Dokumentfakten plus 66 Anwendungsspuren
  - 3 vorlaeufige Portal-Transaktionen
  - 4 vorlaeufige Portal-Ledger-Eintraege

Noch offene Portal-Fehler:

- Drei `Transaction confirmation`-Dokumentbuttons fuer Bank-/Cashbewegungen
  waren sichtbar, lieferten aber `Something went wrong`.
- Zinsen sind im Portal-Detail fachlich sichtbar:
  - `Accrued`
  - `Taxes`
  - `Total`
  - Dokumentbutton `Statement`
- Der `Statement`-Button loeste im Test aber kein PDF/Popup/Download aus.
  Deshalb braucht der Agent fuer Zinsen einen DOM-Fallback.

## Informationsluecken Portal vs. Export 2026-06-23

Der Web-App-Agent deckt deutlich mehr ab als zuerst angenommen, reicht aber
noch nicht als alleinige Quelle fuer alle Kosten/Zinsen/Steuern, solange der
DOM-Fallback fuer Zinsen und Cash-Confirmations nicht produktiv ist.

Aktuell durch Portal-Web nachweislich abgedeckt:

- aktuelle sichtbare Portfolio-/Cash-Werte aus dem Portal-Snapshot
- `Billing Execution` fuer Sparplan-/Wertpapierausfuehrungen
- `Inbound Invoice` fuer Einzahlungen
- `Tax Report 2025` aus `Profile > Activity`
- Duplicate-Statement-Mails sind fuer Wertpapierabrechnungen nicht mehr
  erforderlich, weil dieselben `Billing Execution`-PDFs aus der Web-App
  erreichbar sind.

Aktuell noch nicht voll automatisiert:

- DOM-Fallback ist implementiert, aber bewusst streng:
  - `Statement` wird nur als Zinsfakt akzeptiert, wenn im sichtbaren
    Detailtext echte Zinsmerkmale wie `Interest`, `Accrued`, `You received`
    oder `Zins` vorkommen.
  - Ein zu grosszuegig erkannter Test-Fallback wurde am 2026-06-23 wieder aus
    Firestore entfernt, damit keine falschen Zinsertraege entstehen.
- `Transaction confirmation` fuer manche Bank-/Cashbewegungen: Button sichtbar,
  PDF-Oeffnung scheitert im Portal aktuell mit `Something went wrong`.
- Vollstaendige historische Transaktionsliste aus dem Web muss noch
  systematisch per Scroll/DOM-Fallback importiert werden.

Regel fuer manuelle Zusendungen ab diesem Stand:

- Keine Duplicate-Statement-Mails mehr erforderlich.
- Tax Report muss nicht mehr manuell per Mail kommen, wenn er im Portal
  erreichbar bleibt.
- Net-Worth-PDF ist fuer den taeglichen aktuellen Wert nicht mehr zwingend,
  weil `traderepublic_portal` aktuelle Portfolio-/Cash-Werte liest. Es bleibt
  optional als Kontrollreport.
- Bis Zins-/Cash-DOM-Fallback produktiv ist, bleibt `Transaction export.csv`
  die sichere Quelle fuer Zinsen, Steuern, Dividenden, Cash-Historie und
  Private-Markets-Cashflows.
- `Account statement.pdf` ist nur noch fuer Cash-Reconciliation sinnvoll,
  solange einzelne `Transaction confirmation`-PDFs im Portal fehlschlagen.

## Fallback- und Warnlogik 2026-06-23

- Wenn ein Trade-Republic-Portal-Dokumentbutton kein PDF liefert, versucht der
  Agent einen DOM-Fallback aus der sichtbaren Detailansicht.
- DOM-Fakten werden nicht als PDF-Fakten getarnt, sondern mit
  `sourceChannel=traderepublic_portal_dom` gespeichert.
- Operative Anwendung:
  - `interest`: schreibt `ledgerEntries`, `incomeEvents` und bei Steuer
    `costEvents`
  - `cash_transfer`: schreibt `ledgerEntries`
  - Dedupe gegen `Transaction export.csv` bleibt Pflicht; bekannte Vorgänge
    werden als `SKIPPED_DUPLICATE_MANUAL` markiert.
- Wenn weder PDF noch DOM-Fallback ausreichen, bleibt ein
  `portal_document_failure` erhalten.
- `agentStatus/traderepublic_portal` darf dann nicht `OK` melden, sondern muss
  `WARNUNG` schreiben.
- `systemHealth/current` erzeugt depotuebergreifend Warnungen fuer:
  - unbekannte Dokumente
  - unbekannte Dokumentfakten
  - ungelöste Trade-Republic-Portal-Dokumentfehler

Verifikation 2026-06-23 nach Fallback-Umsetzung:

- `68` Trade-Republic-Portal-PDFs:
  - `66` `billing_execution`
  - `1` `inbound_invoice`
  - `1` `tax_report`
- `0` aktive DOM-Fallback-Fakten nach Bereinigung des zu grosszuegigen
  Testfalls.
- `3` ungelöste `Transaction confirmation`-Fehler bleiben bewusst als
  Warnung sichtbar.
- `npm --prefix automation run sync:health` meldet deshalb korrekt
  `WARNUNG`, nicht `OK`.

## Portal-Gegencheck und UI-Fix 2026-06-23

- Echter Portal-Refresh mit App-Freigabe durchgefuehrt.
- Firestore/Portal-Snapshot danach:
  - Depotwert ohne Cash: `2.437,42 EUR`
  - Cash: `149,49 EUR`
  - Netto inkl. Cash: `2.586,91 EUR`
  - Einstand: `2.336,41 EUR`
  - G/V: `+101,01 EUR` / `+4,3 %`
  - Brokerage sichtbar: `1.255,61 EUR`
  - Private Markets implizit aus Portal-Gesamtwert minus sichtbare
    Brokerage-Positionen: `1.181,81 EUR`
- Positionsgegencheck:
  - Private Equity: `+36,41 EUR`
  - NASDAQ100: `+57,05 EUR`
  - Core S&P 500: `+16,11 EUR`
  - Netflix: `-4,04 EUR`, Einstand weiterhin `10,06 EUR` aus Stockperk/Bonus
  - Stoxx Europe Defense: `-4,52 EUR` nach aktuellem Portalwert. Damit ist
    Trade Republic insgesamt positiv, aber laut aktuellem Portal ist nicht nur
    Netflix negativ.
- Der Trade-Republic-Portal-Button war in der engen Kartenkopfzeile zu leicht
  zu uebersehen bzw. auf sehr schmalen Screens nur als Icon sichtbar.
  Umsetzung: Button als eigene breite Aktionszeile in der Trade-Republic-Karte.
  Waehrend des Logins zeigt er `Trade Republic: App bestätigen`, sobald
  `agentStatus/traderepublic_portal.message` auf App-Freigabe wartet.
- Health bleibt korrekt `WARNUNG`, weil drei alte
  `Transaction confirmation`-Portal-Dokumentbuttons weiter `Something went
  wrong` liefern. Das betrifft Dokumentvollstaendigkeit, nicht den aktuellen
  Portalwert.

## Preislogik und Redundanz-Audit 2026-06-24

Aktuelle Bewertungslogik in der App:

- Gelistete Trade-Republic-Positionen mit ISIN werden vom Kurs-Sync mit
  Boerse-Frankfurt/Xetra-Kursen bewertet:
  - `quoteProvider=boerse-frankfurt`
  - `priceSource=boerse-frankfurt`
  - `valuationMethod=boerse-frankfurt_quote_v1`
- Der letzte Trade-Republic-Portalwert bleibt separat als Brokervergleich in
  der Position erhalten:
  - `brokerCurrentValue`
  - `brokerQuoteProvider=traderepublic_portal_web`
- Private Equity `LU3176111881` bleibt nicht ueber Boerse Frankfurt bewertet,
  sondern aus dem Trade-Republic-Portal abgeleitet:
  - `quoteProvider=traderepublic_portal_total_implied`
  - Wert = Trade-Republic-Portfolio-Gesamtwert minus sichtbare gelistete
    Brokerage-Positionen
- Cash kommt aus dem Trade-Republic-Portal:
  - `valuationMethod=traderepublic_portal_cash_v1`
- `sourceSummaries/traderepublic` trennt damit:
  - `sourceDataProvider`: Herkunft von Bestand/Dokumentstand
  - `quoteDataProvider`: Herkunft der aktiven Kursbewertung
  - `valuationMethod`: Methode der aktuellen Summenbewertung

Fix 2026-06-24:

- Nach einem Boerse-Frankfurt-Kurslauf blieb bei einigen Positionen noch ein
  alter `priceSource`-Text aus dem Portal stehen, obwohl
  `quoteProvider=boerse-frankfurt` korrekt war.
- `automation/src/sync-quotes-local.mjs` schreibt jetzt bei jedem Kurslauf
  konsistent:
  - `priceSource=quoteProvider`
  - `priceSourceUrl`
  - `sourceSummaries.<source>.quoteDataProvider`
  - `sourceSummaries.<source>.quoteDataUpdatedAt`

Stand nach Kurs-Sync 2026-06-24:

- Trade Republic gesamt:
  - Depotwert ohne Cash: `2.428,22 EUR`
  - Cash: `149,49 EUR`
  - Netto inkl. Cash: `2.577,71 EUR`
  - Einstand: `2.336,41 EUR`
  - G/V: `+91,81 EUR` / `+3,9 %`
- Positionen:
  - Private Equity: `1.181,81 EUR`, G/V `+36,41 EUR`,
    Quelle `traderepublic_portal_total_implied`
  - Stoxx Europe Defense: `601,27 EUR`, G/V `-9,68 EUR`,
    Quelle `boerse-frankfurt`
  - NASDAQ100: `412,44 EUR`, G/V `+52,44 EUR`,
    Quelle `boerse-frankfurt`
  - Core S&P 500: `226,73 EUR`, G/V `+16,73 EUR`,
    Quelle `boerse-frankfurt`
  - Netflix: `5,97 EUR`, G/V `-4,09 EUR`,
    Quelle `boerse-frankfurt`; Einstand `10,06 EUR` aus Stockperk/Bonus
  - Cash: `149,49 EUR`, Quelle Trade-Republic-Portal

Redundanz-/Dedupe-Audit:

- Keine doppelten `transactions.transactionId`.
- Portal-Dokumente, die bereits durch manuelle Exporte abgedeckt sind, werden
  nicht operativ doppelt angewendet:
  - `63` Portal-Anwendungen stehen auf `SKIPPED_DUPLICATE_MANUAL`
  - `5` Portal-Anwendungen stehen auf `APPLIED`
- Die zwei Private-Equity-Ledgerzeilen am 2026-06-08 ueber je `50 EUR` sind
  keine Dopplung:
  - zwei unterschiedliche Trade-Republic-Transaktions-IDs
  - zwei unterschiedliche Uhrzeiten im `Transaction export`
- Eine echte redundante Dokumentspur bleibt:
  - `Tax Report 2025.pdf` hat denselben `fileHash` dreimal:
    Baseline, manueller Mail-Import und Portal-Import.
  - Diese Redundanz wirkt nicht auf Positionen, G/V, Kosten oder Steuerwerte,
    weil der Tax Report nicht dreifach operativ angewendet wird.
  - Naechste technische Verbesserung: Hash-Dedupe fuer `sourceDocuments`
    ueber alle Trade-Republic-Importkanäle, sodass derselbe PDF-Hash nur noch
    eine kanonische Dokumentspur bekommt und weitere Funde nur als
    `seenVia`/`duplicateOf` referenziert werden.

UI-Fix 2026-06-24:

- Der Trade-Republic-Portal-Button wurde aus dem unteren Kartenbereich ganz
  nach oben direkt unter den Trade-Republic-Kopf verschoben.
- Text: `Trade Republic: Refresh`, im Loginlauf je nach Agentphase
  `Trade Republic: App bestätigen`, `... Login`, `... PIN`,
  `... Liest Portal`.
- Fehlerfall repariert:
  - Wenn der Button keinen Firestore-Command schreiben konnte, blieb in der
    Karte nur `Trade Republic: Fehler` stehen und in der Trade-Republic-App
    erschien keine Freigabe.
  - Die UI zeigt bei fehlgeschlagener Anforderung jetzt `Erneut starten` plus
    technische Fehlermeldung unter dem Button.
  - Firestore-Regeln wurden am 2026-06-24 gezielt fuer
    `automationCommands/traderepublic_portal_refresh` deployed.
  - End-to-End-Test danach erfolgreich:
    Command `REQUESTED -> RUNNING -> DONE`, Chrome/Login gestartet,
    Nutzer-App-Freigabe bestaetigt, Portal-Snapshot aktualisiert.
  - Ergebnis des Testlaufs:
    - `agentStatus/traderepublic_portal.status=WARNUNG`
    - Grund der Warnung bleiben die drei alten
      `Transaction confirmation`-Dokumentbuttons mit `Something went wrong`
    - aktueller Portal-Snapshot: Depotwert `2.423,14 EUR`, Cash
      `149,49 EUR`, Netto `2.572,63 EUR`

## Dokumenten-Postfach und Warnabschluss 2026-06-25

Ziel:

- Trade-Republic-Warnungen duerfen nicht nur als Kartentext sichtbar sein.
- Nicht verarbeitete oder unbekannte Dokumente muessen als pruefbare
  Postfach-Eintraege in der App erscheinen.
- Der Nutzer muss pro Dokument oder Dokumenttyp entscheiden koennen:
  - fachlich abgedeckt
  - nicht relevant
  - Parser/Importlogik muss erweitert werden

Umsetzung:

- Neue Firestore-Collection:
  - `documentReviewDecisions`
- Zulaessige Entscheidungen:
  - `covered`
  - `not_relevant`
  - `needs_parser`
- Scope:
  - `item`: nur genau dieser Dokument-/Faktenfall
  - `document_type`: alle passenden Dokumente mit gleichem Label/Typ
- Die App liest problematische Eintraege aus:
  - `sourceDocuments`
  - `sourceDocumentFacts`
  - `documentReviewDecisions`
- In der App gibt es jetzt ein zentrales `Dokumenten-Postfach` oberhalb der
  Depotkarten.
- Das Postfach ist depotuebergreifend: Trade Republic, Flatex, Ginmon,
  Intergold, Bitget, Capital.com, VBV und spaetere Bankkonten/Kreditkarten.
- Zunaechst werden dort nur offene/fehlerhafte oder unbekannte Dokumentfaelle
  angezeigt.
- Offene Eintraege zaehlen als Warnung.
- Geschlossene Eintraege bleiben sichtbar, zaehlen aber nicht mehr als
  offener Fehler.

Wichtige fachliche Regel:

- `Transaction confirmation` wird nicht pauschal ignoriert.
- Dieser Dokumenttyp kann grundsaetzlich relevant sein.
- Die drei alten Portalfehler wurden deshalb nur einzeln als
  `covered` markiert:
  - `2026-02-02`
  - `2026-03-03`
  - `2026-03-31`
- Grund:
  - Trade Republic liefert fuer diese alten Portalbuttons kein PDF
    (`Something went wrong`).
  - Die fachlichen Transaktionsdaten sind bereits ueber vorhandene
    Trade-Republic-Transaktionsdaten abgedeckt.

Verifizierter Stand nach Umsetzung:

- `agentStatus/traderepublic_portal.status=OK`
- `portalDocumentUnresolvedFailureCount=0`
- `portalDocumentReviewedFailureCount=3`
- `systemHealth/current` enthaelt keine Trade-Republic-Warnung mehr.
- Uebrig ist aktuell nur eine Ginmon-Warnung fuer zwei nicht klassifizierte
  Vertrags-/Datenschutzdokumente.

Technische Regel fuer die Zukunft:

- Neue unbekannte Trade-Republic-Dokumente duerfen nicht stillschweigend
  verschwinden.
- Sie muessen als offener Eintrag im Dokumenten-Postfach erscheinen.
- Erst eine explizite Review-Entscheidung darf sie aus Health-Warnungen
  herausnehmen.
