# Import Masterplan

Stand: 2026-06-13

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

## Quellenuebersicht

| Kategorie | Quelle | Aktivitaet | Prioritaet | Ziel-Aktualitaet | Primare Importmethode | Backup-Methode | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Broker | Flatex | aktiv | sehr hoch | taeglich bis intraday per Export | Agent | manueller CSV-Export | teilweise produktiv |
| Broker | Trade Republic | aktiv | sehr hoch | taeglich bei Transaktionen plus periodischer Snapshot | Mail-Agent fuer taegliche Abrechnungs-PDFs | manueller Mobile-Export plus Agent | Mailweg bestaetigt, Umsetzung offen |
| Robo-Advisor | Ginmon | aktiv | hoch | taeglich bis woechentlich je nach Dokumentenlage | Agent | Browser-/Dokumentabruf | teilweise produktiv |
| Edelmetalle | Intergold | aktiv | hoch | Preise taeglich, Bestand bei neuem Beleg | Agent plus Preisimport | manueller Belegimport | teilweise produktiv |
| Krypto | Bitget | aktiv | hoch | alle 5 Minuten | API | CSV/Datei nur Notfall | produktiv auf Mac Studio |
| Mitarbeiteraktien | EquatePlus | passiv/regelmaessig | mittel | bei neuer Benachrichtigung, mindestens monatlich | geplanter Mail-Agent | manueller PDF-Import | erste Benachrichtigung abwarten |
| Bank | Sparkasse George | aktiv | mittel | taeglich | API ueber Open-Banking-Anbieter | Export oder manueller Eintrag | Anbieter pruefen |
| Kreditkarte | Amazon Visa | aktiv | mittel | taeglich | API ueber Open-Banking-Anbieter, falls unterstuetzt | Agent/Export | Anbieter pruefen |
| Kreditkarte | TF Bank Kreditkarte | aktiv | mittel | taeglich | API ueber Open-Banking-Anbieter, falls unterstuetzt | Agent/Export | Anbieter pruefen |
| Bank | Revolut | derzeit inaktiv | niedrig | bei Reaktivierung taeglich | API oder Export | manuell | offen |
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
  - Bitget wird fuer Bitget-only bewertet: keine CoinGecko- oder
    Frankfurter-Boerse-Fallbacks fuer Krypto
  - aktueller sauberer Schnitt:
    - `sourcePositions` enthaelt nur die aktuelle Portfolioansicht
    - TRUMP, MELANIA und auf `0,00 EUR` rundende Dust-Positionen sind aus der
      Portfolioansicht ausgeschlossen
    - diese Rohbestaende bleiben im Rohsnapshot unter `rawPositions` und
      `excludedPositions` nachvollziehbar
  - historische Exporte von 13.06.2024 bis 13.06.2026 sind gesichert
  - TRUMP- und MELANIA-Einstand sind in USDT verifiziert
  - EUR-Einstand und BTC-Einstand werden einmalig mit Bank-/Kreditkartendaten
    vervollstaendigt

### 6. EquatePlus

- Ziel: Mitarbeiteraktien sauber im Gesamtvermoegen zeigen
- Realistisch: monatlich oder bei neuen Belegen ausreichend
- Methode:
  - Ziel ist ein `Mail-Agent`
  - zuerst die erste neu konfigurierte E-Mail-Benachrichtigung abwarten
  - danach Absender, Betreff, Anhaenge und enthaltene Daten analysieren
  - bis dahin bleibt manueller PDF-Import als Rueckfall

### 7. Sparkasse George

- Ziel: Bankguthaben und Zahlungsstrukturen im Gesamtbild
- Realistisch: meist taeglicher Stand ausreichend
- Methode:
  - Ziel ist eine `API` ueber einen bestehenden Open-Banking-Anbieter
  - nicht selbst als regulierter Kontoinformationsdienst auftreten
  - bis zur API-Anbindung Export oder manueller Eintrag
- Zusatz:
  - wichtig fuer Gesamtvermoegen, Cash und spaetere Ausgabenanalyse

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
- Realistisch: monatlich oder quartalsweise ausreichend
- Methode:
  - `manueller Eintrag in der App`
  - kein Automatisierungsprojekt, solange der Aufwand den Nutzen uebersteigt

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
- EquatePlus nach Analyse der ersten E-Mail-Benachrichtigung

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

1. EquatePlus Parser
2. Sparkasse George
3. Betriebliche Altersvorsorge
4. optionale Quellen wie Revolut, Trading 212, Capital.com

## Wichtigste offene Entscheidungen

1. Welcher Open-Banking-Anbieter deckt Sparkasse George, Amazon Visa und TF Bank ab?
2. Welche Informationen enthalten die ersten EquatePlus-E-Mail-Benachrichtigungen?
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
