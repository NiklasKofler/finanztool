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
