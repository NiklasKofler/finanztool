# Datenbasis-Cleanup-Plan 2026-06-27

Ziel: Vor Dashboards, Abo-/Research-Integration und KI-Auswertung muss die
Datenbasis fachlich sauber sein. EquatePlus und Kreditkarten bleiben fuer
diesen Cleanup bewusst zurueckgestellt.

## Entscheidung

- EquatePlus bleibt vorerst nur als manuelle Novartis-Position mit SIX-Kurs
  sichtbar. Keine weitere Automatisierung, bis echte EquatePlus-Dokumente
  fachlich relevante Mehrdaten liefern.
- Kreditkarten bleiben vorerst zurueckgestellt. Bestehende Saldo-Unterkonten
  duerfen sichtbar bleiben, aber keine weitere Portal-/Transaktionslogik in
  diesem Sprint.
- Fokus dieses Sprints: Flatex, Trade Republic, Ginmon, Intergold, Bitget,
  VBV und Bankkonten ohne Kreditkarten.

## Bewertung der Firestore-Struktur

Die aktuelle Struktur ist grundsaetzlich richtig und soll nicht neu erfunden
werden. Sie muss konsequenter genutzt werden:

- `sourceSummaries`: aktuelle Wahrheit je Quelle fuer Karten und
  Gesamtvermoegen.
- `sourcePositions`: aktuelle sichtbare Positionen je Quelle.
- `sourceAccounts`: Unterkonten, Depots, Wallets, Cashkonten und Karten.
  Neue/geschlossene Unterkonten muessen erkannt und markiert werden.
- `imports`: jeder Agent-/API-/Dokumentlauf mit Status, Counts, Warnungen und
  Parser-Version.
- `sourceDocuments`: Register aller fachlich relevanten PDFs/CSVs/Reports.
- `sourceDocumentFacts`: alle extrahierbaren Fakten aus Dokumenten, auch wenn
  sie noch nicht in Events normalisiert sind.
- `ledgerEntries`: Cash-, Wallet- und Konto-Bewegungen.
- `transactions`: Wertpapier-, Krypto- und Metall-Transaktionen wie Kauf,
  Verkauf, Transfer, Split, Einlagerung oder Auslagerung.
- `costEvents`: Gebuehren, Spreads, Quellensteuern, Kapitalertragsteuern,
  Produktkosten und sonstige Belastungen.
- `incomeEvents`: Dividenden, Zinsen, Rewards, Cashback und Ausschuettungen.
- `quotesCurrent`: letzter aktueller Kurs, haeufig ueberschreibbar.
- `priceHistory`: taegliche Historie um 22:00 fuer Charts und
  Tagesveraenderungen.
- `documentReviewDecisions`: fachliche Entscheidungen fuer Dokumente, die ein
  Agent nicht sauber verarbeiten kann.

Steuern werden vorerst in `costEvents` mit einem klaren `type` wie `tax`,
`withholding_tax` oder `capital_gains_tax` gespeichert. Eine eigene
`taxEvents`-Collection wird erst eingefuehrt, wenn wir Jahressteuerberichte
oder Steuer-Dashboards mit eigener Struktur brauchen. Bis dahin darf es keine
zweite parallele Steuerwahrheit geben.

## Zentrales Event-Zuordnungsmodell

Festgelegt am 2026-06-27:

- Alle Events in `transactions`, `ledgerEntries`, `costEvents` und
  `incomeEvents` bekommen ein gemeinsames Modell fuer Zuordnung, Vergleich und
  Transparenz.
- Kosten und Ertraege muessen auf mehreren Ebenen auswertbar bleiben:
  Gesamtportfolio, Quelle/Broker, Unterkonto/Depot, Produkt/Instrument,
  Position und einzelner Vorgang.
- Sichere Zuordnungen werden als `allocationStatus=direct` gespeichert.
- Anteilig verteilte Kosten werden als `allocationStatus=allocated` und
  `allocationMethod=proportional` gespeichert.
- Nicht sicher zuordenbare Kosten bleiben mit `allocationStatus=unallocated`
  oder `pending` sichtbar. Sie duerfen nicht verschwinden und werden spaeter
  separat in Dashboards gezeigt.
- Fuer Anbieter-/Produktvergleiche sind besonders relevant:
  - `costClass`
  - `incomeClass`
  - `comparisonScope`
  - `financialImpactEur`
  - `instrumentId`
  - `sourceAccountId`
  - `eventGroupId`
- Capital.com und weitere spaetere Quellen duerfen mit unvollstaendiger
  Datenabdeckung starten; fehlende Kosten-/Steuerdetails werden mit
  `allocationConfidence=unknown` oder `pending` gekennzeichnet, nicht geraten.

Technische Umsetzung:

- `automation/src/event-model.mjs`
- `automation/src/backfill-event-model-local.mjs`
- `npm --prefix automation run reconcile:event-model`
- `npm --prefix automation run sync:event-model`

## Querschnittsregeln

1. Aktuelle App-Werte kommen aus `sourceSummaries` und `sourcePositions`.
2. Kosten, Steuern, Zinsen und Ertraege muessen als Events historisch
   erhalten bleiben, auch wenn Positionen spaeter geschlossen werden.
3. Jedes Dokument mit moeglichem fachlichem Inhalt muss mindestens in
   `sourceDocuments` registriert und als `sourceDocumentFacts` extrahiert
   werden.
4. Unbekannte Dokumente muessen im zentralen Dokumenten-Postfach sichtbar
   bleiben, bis eine Einzeldokument-Entscheidung vorliegt.
   Das gilt auch fuer erkannte, aber fachlich noch nicht geparste
   Informationsdokumente wie Welcome Letters, AGB, Datenschutz,
   Basisinformationen oder Formulare. Kein Agent darf Dokumente automatisch
   als ignoriert/irrelevant markieren.
5. Jeder Agent muss zwischen technischem Lauf, fachlicher Datenveraenderung,
   Dokumentstand und Kursstand unterscheiden.
6. Fuer Preisupdates gilt: `quotesCurrent` wird aktualisiert; `priceHistory`
   wird nicht bei jedem 5-Minuten-Lauf, sondern taeglich um 22:00 geschrieben.
7. Quellen duerfen keine dauerhaften Sondermodelle bekommen. Spezialparser
   sind erlaubt, aber das Ergebnis muss in die kanonischen Collections.
8. Agenten muessen inkrementell und dedupliziert arbeiten:
   - Bereits bekannte Dokumente duerfen nicht erneut heruntergeladen werden.
   - Bereits bekannte Dokumente duerfen im normalen Agentlauf nicht erneut
     vollstaendig geparst werden, wenn sich nichts geaendert hat.
   - Ein voller Reconcile ist nur bei neuen Dokumenten, Parser-Aenderungen
     oder einem bewusstem Force-Lauf erlaubt.
   - Exporte mit identischem Inhalt werden verworfen statt als neue Datei
     abgelegt.
9. Normale Agenten laufen headless. Ein sichtbares Browserfenster ist nur fuer
   bewusste manuelle Anmeldung oder Debugging erlaubt.

## Plan Pro Quelle

### Flatex

Aktuell:

- Broker-Snapshot alle 5 Minuten als primaere Wahrheit fuer Positionen, Cash,
  Kredit, Einstand und Brokerkurse.
- Dokument-/Postbox-Fakten vorhanden und in kanonische Events normalisiert.

Erledigt:

1. Flatex-Dokumentfakten in `transactions`, `ledgerEntries`, `costEvents` und
   `incomeEvents` normalisieren.
2. Gebuehren, Steuern, Dividenden, Ausschuettungen, Thesaurierungen,
   Kapitalmassnahmen und Kontoauszuege sauber typisieren.
3. Nicht mehr vorhandene Broker-Positionen dynamisch aus aktueller Ansicht
   entfernen; Historie bleibt ueber Events/History erhalten.
4. Nicht erkannte Flatex-Dokumente muessen weiterhin im Dokumenten-Postfach
   landen.

Automatisierungsziel:

- 5-Minuten-Brokerstand fuer aktuelle App.
- Taeglicher Dokumentexport fuer neue Belege.
- Kosten-/Steuer-/Ertragsnormalisierung nach jedem neuen Dokumentlauf.

### Trade Republic

Aktuell:

- Portal-Snapshot ist primaere Quelle fuer aktuellen Stand.
- Alter Mail-/Manual-Export-Kanal ist fachlich Legacy und nicht mehr aktiv.
- Portal-Snapshot, Cash, sichtbare Positionen und Private-Markets-Restwert
  werden aus dem Webportal gelesen.
- Portal-Dokumente, Dokumentfehler, Ledger, Kosten und Ertraege sind teilweise
  vorhanden und werden per Signatur dedupliziert.

Erledigt 2026-06-27:

1. Portal-Login beschleunigt: nach Telefon/PIN wird reaktiver auf Feldwechsel
   und Loginzustand gewartet.
2. Snapshot-Schutz eingebaut: unvollstaendige/halb geladene Portaltexte
   duerfen Firestore nicht mehr ueberschreiben.
3. Normaler Portalcheck inkrementell gemacht:
   - kein pauschales komplettes Scrollen der Transaktionshistorie
   - Transaktionen ohne Dokumentbutton blockieren den Abbruch nicht mehr
   - voller Backfill bleibt mit `--full-portal-scan` moeglich.
4. Verifiziert:
   - aktueller Netto-Wert inkl. Cash `2.559,37 EUR`
   - Depotwert `2.409,88 EUR`
   - Cash `149,49 EUR`
   - keine offene Trade-Republic-Health-Warnung.

Naechste Schritte:

1. Erledigt: Portal-Dokumentfakten werden in `transactions`, `ledgerEntries`,
   `costEvents`, `incomeEvents` und Portal-Anwendungen normalisiert, soweit sie
   fachlich Buchungen, Kosten oder Ertraege sind.
2. Erledigt: Tax-Report-Fakten werden als Jahres-/Steuerinformation in
   `sourceDocumentFacts` und Portal-Anwendungen gehalten. Sie erzeugen keine
   Cash-Buchung, damit Jahreszusammenfassungen nicht als echte
   Kontobewegungen doppelt zaehlen.
3. Private Markets explizit als Sonderbewertung kennzeichnen, weil nicht jede
   Position einen normalen Boersenpreis hat.
4. Doppelte oder nicht verarbeitbare Portal-Dokumente bleiben im zentralen
   Dokumenten-Postfach sichtbar.
5. Verifiziert: `69` Portal-Datenfakten, `69` Portal-Anwendungen,
   `0` offene erkannte Portal-Fakten.

Automatisierungsziel:

- On-demand schneller Portal-Refresh.
- Regelmaessiger, aber sparsamer Dokument-/Transaktionsscan.
- Kein Trade-Republic-Mail-Agent als produktiver Standard.

### Ginmon

Aktuell:

- API liefert aktuelle Depots, Werte und Kurse.
- Dokumente liefern nachvollziehbare Stueckzahlen, Kosten, Transaktionen,
  Ertraege, Cashbewegungen und Depotinformationen.

Erledigt:

1. Alle Ginmon-Dokumentfakten je Depot und Produkt in Events normalisieren.
2. Produktkosten, Rechnungen, Zinsen, Cashbewegungen und Umschichtungen in
   `costEvents`, `incomeEvents`, `ledgerEntries` und `transactions`
   ueberfuehren.
3. API-Stand und Dokumentstand getrennt halten.
4. Informations-/Rechtsdokumente werden klassifiziert, aber nicht automatisch
   ignoriert. Sie bleiben mit `UNPARSED` im Dokumenten-Postfach, bis der User
   sie als nicht relevant, wichtig/spaeter oder parserwuerdig markiert.

Automatisierungsziel:

- API alle 5 Minuten fuer aktuelle Werte.
- Dokumentagent taeglich 02:00 fuer Belege.
- Kosten-/Steuer-/Produktdaten aus Dokumenten als Eventbasis.

### Intergold

Aktuell:

- Metallpositionen und Website-Preise sind fuer Bewertung vorhanden.
- Kauf-/Einlagerungsbelege werden als `sourceDocuments`,
  `sourceDocumentFacts`, `transactions` und `costEvents` gespeichert.

Erledigt:

1. Alle Intergold-Belege in `sourceDocuments` registrieren.
2. Belegpositionen, Kaufdatum, Menge, Einheit, Einstand, Lager-/Kaufkosten und
   anteilige Kauf-/Lagerkosten als `sourceDocumentFacts` speichern.
3. Metalltransaktionen in `transactions` normalisieren.
4. Kosten in `costEvents` schreiben.
5. Website-Preisstand, letzter Agentlauf und letzte echte Preisaenderung
   getrennt halten.
6. Alle Intergold-Anhaenge, die nicht als Kauf-/Einlagerungsbeleg geparst
   werden, bleiben als `UNPARSED` oder `UNKNOWN` im zentralen
   Dokumenten-Postfach. Sie werden nicht automatisch ignoriert.
7. `not_relevant` oder eine vergleichbare Erledigt-Entscheidung darf bei
   Intergold nur durch deine manuelle Entscheidung im Dokumenten-Postfach
   entstehen, nie automatisch durch den Agenten.
8. Verkaufs-/Auslagerungsdokumente werden aktuell bewusst nicht verarbeitet,
   sondern bleiben im Postfach, bis es echte Verkaufsdaten gibt und der Parser
   sauber gebaut ist.
9. Die GUI zeigt verarbeitete Intergold-Dokumente zusaetzlich als
   Kontrollarchiv im Dokumenten-Postfach, auch wenn sie keine offenen
   Problemfaelle mehr sind.

Aktueller verifizierter Stand 2026-06-27:

- `sourceDocuments`: 2 Intergold-Kaufbelege, beide in Firebase Storage
  hochgeladen.
- `sourceDocumentFacts`: 19 Fakten.
- `transactions`: 17 Metall-Kaufzeilen.
- `costEvents`: 17 anteilige Kauf-/Lagerkosten.
- `sourcePositions`: 13 Metallpositionen.
- `sourceSummaries/intergold.currentValue`: `29.895,52 EUR` konservativer
  Ankaufwert.
- `sourceSummaries/intergold.saleValue`: `34.863,99 EUR`.
- `sourceSummaries/intergold.costValue`: `23.040,51 EUR`.
- `sourceSummaries/intergold.performanceValue`: `+6.855,01 EUR`.
- Preisstand Website: `2026-06-23`.
- Dokumentstand Bestand: `2026-03-23`.

Automatisierungsziel:

- Preise taeglich ueber Website.
- Bestand nur bei neuen oder geaenderten Belegen.
- Historische Bewertung ueber Preis-History.

### Bitget

Aktuell:

- API liefert aktuelle Wallet-/Earn-/Cash-Werte.
- Ledger-Agent schreibt Bills, Fills, Fees, Earn-Zinsen und Facts.

Erledigt:

1. Aktueller Bitget-Bestand kommt ausschliesslich aus der Bitget-Read-only-API.
2. Neue und geschlossene Positionen werden dynamisch behandelt:
   `sourcePositions` enthaelt nur die aktuelle Portfolioansicht.
3. TRUMP, MELANIA und Nicht-Cash-Dust unter `1 EUR` bleiben im Rohsnapshot
   nachvollziehbar, werden aber nicht als aktuelle Position angezeigt.
4. Ledger-Kategorien werden in die kanonischen Collections geschrieben:
   `ledgerEntries`, `transactions`, `costEvents`, `incomeEvents` und
   `sourceDocumentFacts`.
5. Der Ledger-Agent arbeitet ab 2026-06-27 inkrementell:
   nach einem erfolgreichen Lauf wird nur noch ab dem letzten Fensterende
   minus Ueberlappung abgerufen. Voller Backfill ist bewusst per
   `--backfill`, `--full` oder `BITGET_LEDGER_FORCE_BACKFILL=true` moeglich.
6. Der alte npm-Alias `import:bitget` zeigt auf den aktuellen lokalen
   REST-Import, damit der Legacy-Admin-SDK-Import nicht versehentlich genutzt
   wird.

Aktueller verifizierter Stand 2026-06-27:

- Sichtbare Positionen: `BTC Earn`, `EUR`, `USDT`.
- `agentStatus/bitget=OK`, `sourceDataProvider=bitget_api`,
  `quoteDataProvider=bitget_api`.
- `agentStatus/bitget_ledger=OK`, zuletzt `incremental` mit kleinem
  Deltafenster, ohne Warnungen.
- Historische Counts nach Firestore-Rueckpruefung: `ledgerEntries=2817`,
  `transactions=2`, `costEvents=2`, `incomeEvents=96`,
  `sourceDocumentFacts=877`.

Offen:

- BTC-Einstand ist nutzerbestaetigt mit `3.000 EUR`.
- EUR-Einstand der ausgeschlossenen TRUMP-/MELANIA-Historie bleibt offen, bis
  die damaligen USDT-Finanzierungen aus Bank-/Kreditkartenumsatz eindeutig
  rekonstruiert sind.

Automatisierungsziel:

- 5-Minuten-API-Snapshot fuer aktuellen Stand.
- Stuendlicher inkrementeller Ledger-Agent fuer Bewegungen, Kosten und Rewards.
- Keine externe Kursquelle fuer Bitget.

### VBV

Aktuell:

- Kontoinformation-PDF ist primaere Quelle.
- Keine Einzelpositionen erwartet.

Naechste Schritte:

1. Nur bei neuem Dokumentdatum herunterladen und parsen.
2. Alle relevanten Vertrags- und Wertdaten aus dem PDF in
   `sourceDocumentFacts` halten.
3. Bei veraendertem Wert Summary aktualisieren; unveraenderte Dokumente nicht
   doppelt speichern.

Automatisierungsziel:

- Woechentlicher Check reicht.
- Dokumentbasierte Wahrheit, kein Kursagent noetig.

### Bankkonten Ohne Kreditkarten

Aktuell:

- Erste/Sparkasse, Revolut und bank99 sind ueber Enable Banking angebunden.
- Kontostaende und Transaktionen werden als Bankdaten importiert.

Naechste Schritte:

1. Kreditkarten in diesem Sprint ausklammern.
2. Bankkonto-Transaktionen inkrementell ab letztem Umsatz minus
   Sicherheitsfenster importieren.
3. Bankkosten, Zinsen, Rueckerstattungen, Gehalt und wiederkehrende Ausgaben
   sauber typisieren.
4. bank99-Abruflimit von 4 pro Tag beibehalten.
5. Revolut beobachten, weil aktuell keine Umsaetze geliefert wurden.

Automatisierungsziel:

- Wenige Abrufe pro Tag.
- Neue Transaktionen idempotent nachziehen.
- Ausgabenanalyse spaeter auf dieser Ledger-Basis aufbauen.

## Zurueckgestellt

### EquatePlus

- Nur manuelle Novartis-Anteile, Einstandswert EUR und SIX-Kurs.
- Kein Dokument-/Portal-Agent im Datenbasis-Cleanup.
- Status 2026-06-27: fuer den aktuellen Bedarf abgeschlossen. Depotbestand,
  Einstand und G/V reichen vorerst, weil wegen des Mitarbeiterbonus nur wenig
  Bewegung erwartet wird.
- Spaeter pruefen: Vesting, Mitarbeiterkauf, Rabattvorteil, Steuern und
  Verkaufs-/Transferhistorie.

### Kreditkarten

- Amazon Visa, TF Bank und George Visa werden fuer den Datenbasis-Cleanup
  zurueckgestellt.
- Bestehende Saldo-Unterkonten bleiben als Transparenzwerte erlaubt.
- Keine weitere Portal-/Transaktions-/Abrechnungsautomatisierung in diesem
  Sprint.
- Spaeter pruefen: offene Salden, Abrechnungen, Zinsen, Fremdwaehrungsgebuehren
  und Einzeltransaktionen.

### Capital.com Und Trading 212

- Capital.com ist technisch vorbereitet und soll vor Nutzung reaktiviert
  werden:
  - API liest Konto und offene Positionen.
  - Vorhandener API-Key ist laut Test 2026-06-27 ungueltig
    (`401 error.invalid.api.key`).
  - Vor produktiver Nutzung neuen API-Key anlegen, Schluesselbund aktualisieren
    und `check:capitalcom` ausfuehren.
- Trading 212 ist ab 2026-06-28 technisch vorbereitet:
  - API-Key/Secret muessen noch lokal im Schluesselbund hinterlegt werden.
  - Snapshot-Agent schreibt aktuelle Positionen, Cash, Einstand und Bewertung.
  - History-Agent schreibt Orders, Dividenden, Cash-Bewegungen, Steuern und
    Fees in die kanonischen Event-Collections.
  - Vor produktiver Nutzung `setup:trading212`, `check:trading212` und
    `sync:trading212` ausfuehren.

## Empfohlene Reihenfolge

1. Flatex: Dokumentfakten in Kosten, Steuern, Ertraege und Transaktionen
   normalisieren.
2. Trade Republic: Portal-Dokumente und Tax-/Transaction-Fakten normalisieren.
3. Ginmon: Kosten, Rechnungen, Transaktionen und Produktdaten je Depot
   normalisieren.
4. Intergold: Belege als Dokumente/Fakten/Transaktionen nachziehen.
5. Bitget: Ledger-Kategorien und Kosten-/Ertragsnormalisierung auditieren.
6. Bankkonten ohne Kreditkarten: Kategorien fuer Ausgaben, Zinsen und
   wiederkehrende Kosten stabilisieren.
7. Erst danach Dashboards und KI-Ueberwachung aufbauen.

## Fertig-Kriterium Fuer Den Datenbasis-Sprint

Eine Quelle gilt fuer den ersten Dashboard-Ausbau als sauber, wenn:

- aktueller Stand in `sourceSummaries` und `sourcePositions` stimmt,
- Unterkonten in `sourceAccounts` aktuell sind,
- alle verfuegbaren Dokumente registriert und klassifiziert sind,
- relevante Fakten extrahiert wurden,
- Bewegungen, Kosten, Steuern und Ertraege entweder als Events vorliegen oder
  als bewusst dokumentierte Datenluecke markiert sind,
- Agentstatus, Datenstand, Dokumentstand und Kursstand getrennt sichtbar sind,
- unbekannte Dokumente im zentralen Postfach erscheinen.
