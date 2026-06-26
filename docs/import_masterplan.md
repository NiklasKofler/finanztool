# Import Masterplan

Stand: 2026-06-26

## Hauptziel

Alle relevanten Depots, Bankkonten und Vermoegenswerte sollen moeglichst nah an Echtzeit in der App verfuegbar sein.

Wichtig:

- "Echtzeit" bedeutet in der Praxis je nach Quelle etwas anderes.
- Wo eine offizielle API vorhanden ist, ist echte oder nahezu echte Aktualisierung moeglich.
- Wo nur Dokumente oder Exporte verfuegbar sind, ist das Ziel "moeglichst aktuell", nicht sekunden-genau.

## Prioritaetslogik

1. Quellen mit hohem Vermoegenswert und aktiver Nutzung zuerst
2. Quellen mit stabiler Automatisierung vor manuellen Sonderfaellen
3. Erst saubere Datenbasis, dann feinere Bewertungen und spaeter KI

## Architekturregel fuer Agents

- Zuerst zaehlt die aktuelle Finanzlage in der App.
- Danach wird die Kurs-/Preis-Historie gespeichert.
- Danach werden Kosten, Steuern, Zinsen, Gebuehren und Produktdetails
  moeglichst vollstaendig nachgezogen.
- API-/Online-Integrationen sind gegenueber lokalen Studio-Agenten zu
  bevorzugen, wenn sie stabil und read-only moeglich sind.
- Der Mac Studio soll nur dort als Agent-Host noetig sein, wo lokale Logins,
  lokale Dateien oder Browser-Sessions technisch unvermeidbar sind.
- Agents duerfen nicht bei jedem Refresh unnoetig alte Historie neu
  herunterladen oder parsen. Sie muessen Dedupe, Cursors, Hashes,
  Dokumentstatus oder Provider-Zeitstempel nutzen.
- Der Mac Studio ist nicht das zentrale Archiv. Relevante Originale bleiben
  beim Broker/Provider oder in Firebase Storage/Drive nachvollziehbar; lokal
  benoetigte Kopien sind Arbeits- und Fallbackdaten.

## Quellenuebersicht

| Kategorie | Quelle | Aktivitaet | Prioritaet | Ziel-Aktualitaet | Primare Importmethode | Backup-Methode | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Broker | Flatex | aktiv | sehr hoch | taeglich bis intraday per Export | Agent | manueller CSV-Export | teilweise produktiv |
| Broker | Trade Republic | aktiv | sehr hoch | taeglich bei Transaktionen plus periodischer Snapshot | Mail-Agent fuer taegliche Abrechnungs-PDFs | manueller Mobile-Export plus Agent | Mailweg bestaetigt, Umsetzung offen |
| Robo-Advisor | Ginmon | aktiv | hoch | taeglich bis woechentlich je nach Dokumentenlage | Agent | Browser-/Dokumentabruf | teilweise produktiv |
| Edelmetalle | Intergold | aktiv | hoch | Preise taeglich, Bestand bei neuem Beleg | Agent plus Preisimport | manueller Belegimport | teilweise produktiv |
| Krypto | Bitget | aktiv | hoch | alle 5 Minuten | API | CSV/Datei nur Notfall | produktiv auf Mac Studio |
| Mitarbeiteraktien | EquatePlus | passiv/regelmaessig | mittel | bei neuer Benachrichtigung, mindestens monatlich | spaeter Mail-Agent nach erster echter Mail | manueller PDF-Import | zurueckgestellt bis erste Mail-Dokumente vorliegen |
| Bank | Bankkonten via Enable Banking | aktiv | mittel | wenige Abrufe pro Tag, bank99 max. 4/Tag | read-only Open Banking ueber Enable Banking | Export oder manueller Eintrag | Erste/Sparkasse produktiv, Revolut/bank99 Sessions offen, Umsaetze offen |
| Kreditkarte | Amazon Visa | aktiv | mittel | taeglich | API ueber Open-Banking-Anbieter, falls unterstuetzt | Agent/Export | Anbieter pruefen |
| Kreditkarte | TF Bank Kreditkarte | aktiv | mittel | taeglich | API ueber Open-Banking-Anbieter, falls unterstuetzt | Agent/Export | Anbieter pruefen |
| Bank | Revolut | aktiv/vorbereitet | mittel | wenige Abrufe pro Tag | read-only Open Banking ueber Enable Banking | Export oder manueller Eintrag | im Control Panel verlinkt, Session noch offen |
| Broker | Trading 212 | derzeit inaktiv | niedrig | bei Reaktivierung taeglich | Export/API falls verfuegbar | manuell | offen |
| Trading | Capital.com | derzeit inaktiv | niedrig | bei Reaktivierung taeglich | Export/API falls verfuegbar | manuell | offen |
| Vorsorge | Betriebliche Altersvorsorge | passiv | niedrig | monatlich bis quartalsweise | manueller Eintrag in der App | manueller Belegimport | entschieden |

## Zielbild pro Quelle

### 1. Flatex

- Ziel: Transaktionen, Cash, Positionen und aktueller Broker-Stand in der App
- Realistisch: kein echtes Streaming, aber sehr gute Aktualitaet ueber regelmaessige CSV-Exporte
- Methode:
  - primaer `Agent`
  - Exportdateien landen in Drive
  - Watcher importiert automatisch
- Zusatz:
  - laufender Bestand wird rechnerisch aus Depot- und Kontoumsaetzen gebildet
  - aktueller Depot-Snapshot aus der Flatex-Oberflaeche ist primaere
    Bewertungsquelle fuer Flatex
  - Boerse-Frankfurt-Kurse dienen als Vergleichs-/Historienwerte und duerfen
    die Flatex-Brokerwerte nicht still ueberschreiben
  - Postbox bleibt optionales Belegarchiv

### 2. Trade Republic

- Ziel: Positionen, Einstand, aktueller Marktwert, Cash, Performance
- Realistisch:
  - Trade Republic sendet am Ende eines Transaktionstages automatisch eine Sammelmail
  - die Mail enthaelt passwortgeschuetzte `Securities Settlement` PDFs
  - periodische Reports bleiben fuer Abgleich und Snapshot wichtig
- Methode:
  - primaer `Mail-Agent`
  - Agent erkennt die taeglichen Abrechnungsmails, laedt PDF-Anhaenge und importiert sie
  - PDF-Passwort wird lokal im macOS-Schluesselbund gespeichert und bei neuer Passwort-Mail aktualisiert
  - Passwort wird nicht in App, Firestore, Git oder Dokumentation gespeichert
- Zusatz:
  - `Transaction export.csv` periodisch fuer Vollstaendigkeit und Historienabgleich
  - `Net Worth.pdf` periodisch fuer aktuellen Stand
  - `Account statement.pdf` periodisch fuer Konto-/Cash-Abgleich
  - `Tax Report` jaehrlich

### 3. Ginmon

- Ziel: aktueller Bestand, Marktwert, Gebuehren, Einzahlungen
- Realistisch: keine Echtzeit im Boersen-Sinn, aber gute Naehe ueber Portal-Dokumente
- Methode:
  - primaer `Agent`
  - Dokumente und Reports automatisiert ablegen/importieren
- Zusatz:
  - falls Browserabruf stabil wird, spaeter staerker automatisieren

### 4. Intergold

- Ziel: metallgenauer Bestand plus taegliche Bewertung mit Intergold-Preisen
- Realistisch:
  - Preise taeglich oder mehrmals taeglich
  - Bestand aktualisiert bei neuen Einlagerungs-/Verkaufsbelegen
- Methode:
  - Preise: `Agent`/Script
  - Belege: `Agent`
- Zusatz:
  - Preisimport und Belegimport bleiben getrennt

### 5. Bitget

- Ziel: Wallet, offene Positionen, Cash, Marktwerte moeglichst live
- Realistisch: das ist die beste Quelle fuer echte API-Naehe
- Methode:
  - primaer `API`
  - spaeter automatischer Polling-Job
- Zusatz:
  - neuer API-Key `Finanztool-Codex` ist ausschliesslich Read-only
  - Spot- und Earn-Bestand werden erfasst
  - kontenuebergreifender Bitget-Wert wird fuer die Summary verwendet
  - automatische Aktualisierung laeuft auf dem Mac Studio alle 5 Minuten
  - der 5-Minuten-Lauf ueberschreibt `imports/api_bitget_latest` und
    `rawDocuments/api_bitget_latest`; er erzeugt keine endlose 5-Minuten-
    Historie
  - zusaetzlicher Bitget-Ledger-Agent laeuft stuendlich und schreibt Bills,
    Fills, Fees, Earn-Zinsen und Tax-Facts historisch/idempotent nach Firestore
  - Ledger-Teilabrufe mit Rate-Limit/Netzwerkfehler schreiben `WARNUNG` plus
    `warnings`; sie duerfen nicht still als voller OK-Lauf erscheinen
  - Transparenzfelder:
    - `sourceDataUpdatedAt` / `sourceDataProvider=bitget_api`
    - `quoteDataUpdatedAt` / `quoteDataProvider=bitget_api`
    - `lastAgentRunAt` / `lastAgentSuccessAt`
  - Bitget wird fuer Bitget-only bewertet: keine CoinGecko- oder
    Frankfurter-Boerse-Fallbacks fuer Krypto
  - aktueller sauberer Schnitt:
    - `sourcePositions` enthaelt nur die aktuelle Portfolioansicht
    - TRUMP, MELANIA und Nicht-Cash-Dust unter `1 EUR` sind aus der
      Portfolioansicht ausgeschlossen
    - diese Rohbestaende bleiben im Rohsnapshot unter `rawPositions` und
      `excludedPositions` nachvollziehbar
  - historische Exporte von 13.06.2024 bis 13.06.2026 sind gesichert
  - TRUMP- und MELANIA-Einstand sind in USDT verifiziert
  - BTC-Einstand `3.000 EUR` ist aktuell nutzerbestaetigt in
    `sourceCostBasis`; langfristig soll er mit Bank-/Kreditkartendaten
    rekonstruiert werden

### 6. EquatePlus

- Ziel: Mitarbeiteraktien sauber im Gesamtvermoegen zeigen
- Realistisch: monatlich oder bei neuen Belegen ausreichend
- Methode:
  - Quelle ist zurueckgestellt, bis die ersten echten EquatePlus-Mail-
    Dokumente eintreffen
  - erst danach Absender, Betreff, Anhaenge, Dokumenttypen und enthaltene
    Daten analysieren
  - erst danach entscheiden, ob ein Mail-Agent ausreicht oder zusaetzlich
    ein manueller PDF-Import/Portalweg noetig ist
  - keine Annahmen ueber Holdings, Transaktionen, Vesting, Steuern oder Kosten
    hart codieren, bevor echte Dokumente vorliegen

### 7. Bankkonten ueber Enable Banking

- Ziel: Bankguthaben und Zahlungsstrukturen im Gesamtbild
- Realistisch: wenige Abrufe pro Tag ausreichend; bank99 maximal 4 Abrufe pro
  Tag
- Methode:
  - read-only `API` ueber Enable Banking
  - nicht selbst als regulierter Kontoinformationsdienst auftreten
  - Enable-Banking-App ist aktiv und auf eigene verlinkte Konten
    eingeschraenkt
  - Balance-Import schreibt `sourceSummaries`, `sourcePositions`,
    `sourceAccounts`, `imports` und `agentStatus`
  - Quelle ist generisch `bank_accounts`
  - echte Kontostaende zaehlen als Cash/Netto-Wert und damit zum Vermoegen
  - verfuegbar inkl. Kredit wird separat gespeichert und nicht als Vermoegen
    gezaehlt
- Zusatz:
  - wichtig fuer Gesamtvermoegen, Cash, Kreditlinien und spaetere
    Ausgabenanalyse
  - Transaktionen werden je Konto idempotent in `ledgerEntries` gespeichert
  - Initialbestand ist vorhanden; normaler Sync ist inkrementell ab letztem
    gespeicherten Umsatz je Konto minus 2 Tage Sicherheitsfenster
  - Backfill: `npm run sync:bank-accounts:backfill` fuer 180 Tage
  - Bankkosten/Steuern werden als `costEvents`, Zinsen/Bonus/Cashback als
    `incomeEvents` abgeleitet, wenn der Umsatztext eindeutig ist
  - keine Zahlungsfunktion und kein Bank-Web-Scraping
  - eigener Detailplan:
    `docs/sparkasse_george_integration_plan.md`

### 8. Amazon Visa

- Ziel: offener Kreditkartensaldo und Transaktionen
- Methode:
  - bevorzugt `API` ueber denselben Open-Banking-Anbieter, falls unterstuetzt
  - sonst `Agent` ueber Abrechnung/Export

### 9. TF Bank Kreditkarte

- Ziel: offener Kreditkartensaldo und Transaktionen
- Methode:
  - bevorzugt `API` ueber denselben Open-Banking-Anbieter, falls unterstuetzt
  - sonst `Agent` ueber Abrechnung/Export

### 10. Revolut

- Ziel: nur bei spaeterer Reaktivierung relevant
- Methode:
  - spaeter `API` oder Export

### 11. Trading 212

- Ziel: nur bei spaeterer Reaktivierung relevant
- Methode:
  - spaeter `API` oder Export

### 12. Capital.com

- Ziel: nur bei spaeterer Reaktivierung relevant
- Methode:
  - spaeter `API` oder Export

### 13. Betriebliche Altersvorsorge

- Ziel: langfristige Vermoegenskomponente im Gesamtbild
- Realistisch: fachlicher Datenwechsel selten, aber taegliche technische
  Pruefung ist robust und erzeugt keine Dubletten
- Methode:
  - `Meine VBV` Portal-Stichtag
  - PDF-Kontoinformation als Primaerbeleg
  - Speicherung in `sourceSummaries`, `sourceDocuments` und
    `sourceDocumentFacts`

## Importmethoden - klare Definition

### API

Verwendung, wenn:

- eine stabile offizielle oder praktikable Schnittstelle existiert
- Aktualitaet hoch sein soll
- keine manuelle Dateiablage noetig ist

Aktuelle Hauptquelle:

- Bitget
- Sparkasse George ueber einen Open-Banking-Anbieter
- Amazon Visa und TF Bank Kreditkarte, falls vom Anbieter unterstuetzt

### Agent

Verwendung, wenn:

- Dateien, Mails oder Webdaten lokal verfuegbar sind
- der Mac Studio als dauerhafter Importknoten dient
- Dateien automatisch erkannt und verarbeitet werden koennen

Aktuelle Hauptquellen:

- Flatex
- Trade Republic
- Ginmon
- Intergold
- EquatePlus erst nach Analyse der ersten echten E-Mail-Dokumente

### Manueller Eintrag

Verwendung, wenn:

- Quelle selten aktualisiert wird
- keine stabile API/Exportstrecke existiert
- Aufwand fuer Automatisierung zunaechst nicht lohnt

Aktuelle Hauptquellen:

- Betriebliche Altersvorsorge

## Empfohlene Umsetzungsreihenfolge

### Phase 1 - Bitget abschliessen

1. Bitget Read-only API auf MacBook und Mac Studio einrichten
2. Einmaligen Startbestand kontrollieren und Einstand manuell festhalten
3. Laufende API-Updates automatisieren

### Phase 2 - Download-Agents auf dem Mac Studio

1. Flatex-Agent legt neue Exporte automatisch im Drive ab
2. Ginmon-Agent legt neue Dokumente automatisch im Drive ab
3. Trade-Republic-Mail-Agent legt neue Dokumente automatisch im Drive ab

In dieser Phase werden die Agents zuerst nur fuer eine verlaessliche
Dateiablage gebaut. Parser und Firestore-Import folgen danach getrennt.

### Phase 3 - Parser und Firestore-Updates

1. Erstbestand je Quelle gemeinsam und kontrolliert erfassen
2. Flatex-Updates parsen und importieren
3. Ginmon-Updates parsen und importieren
4. Trade-Republic-Updates parsen und importieren
5. Source-Summaries vereinheitlichen und gegen Kontrollwerte pruefen

### Phase 4 - Gesamtvermoegen schliessen

1. Weitere Bank-Sessions fuer Revolut und bank99 erzeugen
2. Amazon Visa und TF Bank Kreditkarte
3. EquatePlus Parser nach Eingang der ersten echten Mail-Dokumente
4. optionale Quellen wie Revolut, Trading 212, Capital.com

## Wichtigste offene Entscheidungen

1. Welcher Open-Banking-Anbieter deckt Sparkasse George, Amazon Visa und TF Bank ab?
2. Welche Informationen enthalten die ersten EquatePlus-Mail-Dokumente?
3. Welche Trade-Republic-Abrechnungstypen decken die taeglichen PDFs ab und was fehlt gegenueber den periodischen Reports?

## Arbeitsregel fuer die naechsten Sessions

Wenn eine neue Quelle diskutiert wird, dokumentieren wir immer sofort:

1. Quelle
2. Prioritaet
3. Ziel-Aktualitaet
4. Importmethode: `API`, `Agent` oder `manuell`
5. Was als "fertig" fuer diese Quelle gilt

Zusatzregel Datenhaltung:

- Vor jeder neuen Quelle oder groesseren Agent-Aenderung
  `docs/firestore_data_contract.md` pruefen.
- Keine Quelle soll dauerhaft ein Sondermodell bekommen.
- Aktuelle Werte muessen in `sourcePositions`/`sourceSummaries` landen.
- Bewegungen, Kosten, Zinsen, Steuern und Dokumentfakten muessen historisch in
  den kanonischen Collections gespeichert werden.
