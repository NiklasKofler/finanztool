# Working Memory

Dieses Dokument ist das gemeinsame Projektgedaechtnis fuer Codex auf MacBook Pro und Mac Studio.
Es ersetzt nicht den Chat, aber es bewahrt die wichtigen Entscheidungen, den letzten Stand und die naechsten Schritte.

## Nutzung

Vor jeder neuen Session:

1. Wenn das Projekt vom anderen Geraet uebernommen werden soll: `ftd`
2. `docs/device_workflow.md` lesen
3. `docs/device_switch_log.md` lesen
4. dieses Dokument lesen
5. dann erst mit Codex weiterarbeiten

Nach `ftd` muss Codex im Chat kurz melden:

- auf welchem Geraet gearbeitet wird
- welcher Stand/Commit aktiv ist
- wo am alten Geraet aufgehoert wurde
- welche naechsten Schritte geplant sind
- ob Wechselprobleme, fehlende Secrets oder lokale Abweichungen bestehen

Nach jeder wichtigen Session:

1. dieses Dokument aktualisieren
2. bei Geraetewechseln oder Problemen `docs/device_switch_log.md`
   aktualisieren
3. lokal sichern mit `fts` oder veroeffentlichen/uebergeben mit `ftp`

## Projektziel

Eine persoenliche Finanzperformance-App, die Vermoegenswerte aus mehreren Quellen moeglichst automatisiert sammelt, vereinheitlicht, bewertet und spaeter fuer KI-gestuetzte Entscheidungen nutzbar macht.

## Gemeinsamer Arbeitsmodus

- Das Repo ist die gemeinsame Wahrheit
- Der Chat ist hilfreich, aber nicht der verlaessliche geraeteuebergreifende Speicher
- Wichtige Entscheidungen, Beschluesse und offener Stand muessen waehrend der
  Arbeit im Repo dokumentiert werden, vor allem in dieser Datei
- MacBook Pro und Mac Studio arbeiten auf demselben Branch `main`
- Der gemeinsame Standardpfad auf beiden Geraeten ist
  `/Users/niklaskofler/Documents/finanztool`
- Waehrend aktiver Entwicklung wird nicht automatisch gepusht oder deployed.
  Lokal wird ueber `localhost:5173` gearbeitet. GitHub/Firebase erst am Ende
  oder wenn der Nutzer es ausdruecklich verlangt.
- Wenn Codex mit dem Nutzer etwas fachlich oder technisch festlegt, muss Codex
  die Entscheidung direkt in `docs/working_memory.md` nachziehen, damit ein
  Geraetewechsel nicht den Kontext verliert.
- Wenn beim Wechsel zwischen Mac Studio und MacBook Pro ein Problem auftritt,
  muss Codex es in `docs/device_switch_log.md` festhalten.
- Agenten werden kuenftig vereinfacht: API-/Online-first, Mac-Studio-Agenten
  nur wenn lokal wirklich noetig, und Refreshes sollen den aktuellen Stand
  schnell liefern statt unnoetig alte Historie erneut zu pruefen.
- Prioritaet der Datenhaltung: aktuelle Finanzlage, dann Preis-/Kurshistorie,
  dann Kosten, Steuern, Zinsen und Produktdetails.
- Entscheidung 2026-06-28: Fuer den ersten Dashboard-Ausbau gilt der
  Importumfang als ausreichend vollstaendig. Es gibt keine separate Quelle
  `Quate Plus`; gemeint ist ausschliesslich `EquatePlus`. George Visa bleibt
  pausiert, weil aktuell kein belastbarer API-/Portal-/Dokumentweg verfuegbar
  ist. Amazon Visa, TF Bank, Trading 212, EquatePlus und die vorhandenen
  Bankkonten sind als Basis angebunden. bank99 und N26 sind wegen geringem
  Vermoegensanteil und API-Limits fuer den Dashboard-Start nicht kritisch und
  koennen spaeter nach dem naechsten geplanten 06:00-/16:00-Lauf nachgeprueft
  werden.
- Entscheidung 2026-06-28: In der sichtbaren Portfolio- und Dashboard-Logik
  wird nicht mehr die rohe Broker-Kategorie angezeigt, sondern eine
  normalisierte `Assetklasse`. Die Rohkategorie bleibt im Hintergrund fuer
  Nachvollziehbarkeit, Suche, Tooltips und Parser-/Backfill-Arbeit erhalten.
  Fuer die sichtbare Sicht gelten vorerst: `Aktie`, `ETFs`, `Fonds`, `Cash`,
  `Krypto`, `Metalle`, `Vorsorge`, `CFD`, `Bankkonto`, `Kreditkarte`,
  `Private Equity` und `Sonstiges`. Wichtig: Die Normalisierung darf nicht
  pauschal aus dem Depotnamen abgeleitet werden. Ginmon, Flatex, Trade
  Republic und Trading 212 duerfen also nicht als ganze Quelle zu ETF oder
  Aktie geraten werden. Cash wird positionsgenau erkannt, EquatePlus/Novartis
  zaehlt als `Aktie`. Eine rohe Kategorie `Wertpapier` wird nach
  ETF-/Fonds-/Cash-Erkennung als `Aktie` angezeigt, weil das fuer die
  aktuellen Flatex-Einzelpositionen die richtige sichtbare Einordnung ist.
  Unklare Positionen ohne solche Hinweise bleiben sichtbar als `Sonstiges`,
  bis die Agents/Backfills
  `assetClass`, `assetClassLabel`, `assetClassConfidence` und
  `assetClassSource` dauerhaft schreiben.
- Befund 2026-06-28: TF-Bank-Agent ist technisch geladen, scheitert aber im
  LaunchAgent-Kontext am automatischen TAN-Lesen aus Messages
  (`authorization denied` auf `~/Library/Messages/chat.db`). Das Terminal kann
  die Messages-DB lesen, der LaunchAgent aber nicht. Der TF-Bank-LaunchAgent
  nutzt deshalb ab jetzt zusaetzlich den Messages-UI-Fallback und wartet 120s.
  `TAN_NOT_RECEIVED` ist wieder retrybar, damit die maximal 5 Loginversuche
  tatsaechlich greifen. Der alte Firestore-Fehler bleibt sichtbar, bis ein
  neuer TF-Bank-Lauf erfolgreich abgeschlossen ist.
- Update 2026-06-28: TF Bank bleibt instabil. Debug zeigt, dass der Agent
  neue SMS-Codes erkennt, das Portal diese aber wiederholt als
  `Einmalpasswort aus SMS ungueltig` ablehnt. Gleichzeitig ist der
  Messages-UI-Fallback nicht immer stabil (`NO_TFBANK_TAN_CODE_MATCH` in
  separatem Debuglauf), waehrend direkter SQLite-Zugriff im Terminal Codes
  findet. Fuer die App gibt es jetzt einen Reparaturbutton, der den
  TF-Bank-Agenten ueber `automationCommands/tfbank_manual_refresh` startet.
  Sicherer Fallback bleibt die TAN-Datei `~/.finanztool/tfbank-tan.txt`, falls
  automatisches Messages-Lesen wieder fehlschlaegt.
- Fix 2026-06-28: Die Firestore-Regeln erlauben jetzt auch
  `tfbank_manual_refresh` (`tfbank_refresh`) und `capitalcom_manual_refresh`
  (`capitalcom_refresh`). Wenn die GUI bei einem Reparaturbutton
  `Missing or insufficient permissions` zeigt, ist das zuerst ein
  Firestore-Rules-Thema und nicht automatisch ein SMS-/Portalproblem.
- Stand Quellenzaehlung 2026-06-28: 16 integrierte Quellen = 9
  Depot-/Brokerquellen plus 7 einzelne Bank-/Kreditkartenquellen. Nur
  `tfbank` ist aktuell fachlich fehlerhaft; nach frischem Health-Sync muss die
  Anzeige daher `15/16` lauten. Doppelte TF-Bank-Alerts reduzieren die aktive
  Quellenzahl nur einmal.
- TF Bank Debug-Regel: Erste Diagnosequelle ist
  `automation/runtime/tfbank-debug.ndjson`. Der direkte SMS-Zugriff liest
  `/Users/niklaskofler/Library/Messages/chat.db` ueber `sqlite3` und braucht
  macOS Full Disk Access fuer die ausfuehrende Node-Binary
  `/Users/niklaskofler/.nvm/versions/node/v22.22.3/bin/node`; bei manuellen
  Laeufen zusaetzlich fuer Codex/Terminal.
- Korrektur 2026-06-28: Capital.com war im Health-Check nur veraltet, nicht
  API-defekt. `check:capitalcom` war erfolgreich, anschliessend wurde
  `import:capitalcom:local` ausgefuehrt. Aktueller Stand: Live-Konto,
  `0,00 EUR`, 0 offene Positionen, 0 History-Eintraege.
- Entscheidung 2026-06-27: Kosten, Steuern, Ertraege und Transaktionen werden
  nicht in eine neue parallele Wahrheit verschoben, sondern in den bestehenden
  Collections `transactions`, `ledgerEntries`, `costEvents` und
  `incomeEvents` mit einem gemeinsamen Zuordnungsmodell vereinheitlicht.
  Zentrale Felder sind `eventGroupId`, `instrumentId`, `sourceAccountId`,
  `financialImpactEur`, `allocationStatus`, `allocationMethod`,
  `allocationConfidence`, `comparisonScope`, `costClass` und `incomeClass`.
  Damit koennen Kosten spaeter auf Gesamtportfolio, Broker, Konto, Produkt,
  Position und Einzelvorgang ausgewertet werden. Unsichere Daten bleiben als
  `unallocated`, `pending`, `inferred` oder `estimated` sichtbar.
- Umsetzung 2026-06-27:
  - `automation/src/event-model.mjs`
  - `automation/src/backfill-event-model-local.mjs`
  - NPM-Befehle `reconcile:event-model` und `sync:event-model`
  - bestehende Firestore-Events aktualisiert: `294` Transaktionen,
    `3550` Ledger-Eintraege, `283` Kostenereignisse, `178` Ertragsereignisse.
  - Folgelauf ist effizient: `reconcile:event-model` meldet danach
    `changed=0`.
- Datenbasis-Cleanup-Plan:
  [docs/data_basis_cleanup_plan_2026-06-27.md](/Users/niklaskofler/Documents/finanztool/docs/data_basis_cleanup_plan_2026-06-27.md)
- Kreditkarten werden als Unterkonten der Bankkarte `bank_accounts` gefuehrt,
  nicht als eigene Depotkarten. Der offene Saldo zaehlt als negativer Wert zum
  Vermoegen/Geldstand. Verfuegbarer Kredit und Kreditlimit sind
  Transparenzwerte und duerfen nicht als Vermoegen gezaehlt werden.
- Die bevorzugten Terminal-Kurzbefehle sind:
  - `ftd` = Download/Update
  - `fts` = Save/lokaler Commit
  - `ftp` = Publish/Push/Firebase Deploy/Handoff
  - `ftu` = alter Alias fuer `ftp`, bleibt kompatibel
- Installation der Kurzbefehle pro Geraet:
  `npm run ft:install`
- `ftd` wird dabei als Shell-Funktion installiert. Nach erfolgreichem Download
  muss das Terminal in `/Users/niklaskofler/Documents/finanztool` stehen.
  Wird nur `bin/ftd` als Script ausgefuehrt, kann es das Terminal-Verzeichnis
  nach dem Ende technisch nicht dauerhaft aendern.
- Der Projektpfad muss exakt `/Users/niklaskofler/Documents/finanztool` sein.
  Alte Checkouts wie `/Users/niklaskofler/Documents/Finanztool` duerfen fuer
  die Kurzbefehle nicht benutzt werden.
- Alte numerische Befehle sind deaktiviert.
- Sicherheitsregeln:
  - `ftd` ueberschreibt keine lokalen Aenderungen.
  - Bei auseinander gelaufenen lokalen/remote Commits erstellt `ftd` einen
    Backup-Branch und rebasiert lokale Commits auf `origin/main`.
  - `ftd --force` ist der bewusste Notfall-Download mit Backup-Branch und
    Datei-Backup.
  - `ftp`/`ftu` prueft vor dem Commit, ob GitHub neuer ist, und bricht dann ab.
  - `ftp`/`ftu` deployed Firebase erst nach verifiziertem Push und nur Hosting.

## Aktueller Trade-Republic-Fahrplan ab 2026-06-23

Zielbild:

- Der Trade-Republic-Mail-Agent soll fachlich abgeloest werden.
- Zielquelle ist das authentifizierte Trade-Republic-Webportal.
- Prioritaet der Datenquellen:
  1. Portal-Snapshot aus dem Webportal fuer aktuelle Werte, Cash,
     Brokerage-Positionen und Private Markets.
  2. Einzelne Portal-Dokumente aus Transaktions-/Activity-Details fuer Kosten,
     Zinsen, Steuern und Dokumentfakten.
  3. Kein globaler CSV/PDF-Export: Diese Suche ist seit 2026-06-27 bewusst
     aus dem Agenten entfernt.
  4. Selbst gemailte App-Exporte bleiben nur Rueckfall-/Kontrollkanal, bis der
     Portal-Agent alle notwendigen Informationen nachweislich vollstaendig
     liefert.

Arbeitsreihenfolge:

1. Login stabilisieren:
   - Web-Login mit lokal gespeicherter Telefonnummer/PIN.
   - Nutzer bestaetigt Login in der Trade-Republic-App.
   - Die Trade-Republic-Karte muss waehrenddessen sichtbar zeigen, dass auf
     die App-Bestaetigung gewartet wird.
2. Portal inventarisieren:
   - Wo sind PDF-/Dokumentdownloads erreichbar?
   - Welche Dokumenttypen gibt es je Transaktion/Activity/Portfolio?
   - Welche Links sind echte Downloads und welche sind nur temporaere
     Presigned-URLs?
3. PDFs herunterladen, hashen, archivieren und parsen:
   - Abrechnungen/Sparplanausfuehrungen
   - Zins-/Cash-/Einzahlungsbelege, falls vorhanden
   - Private-Markets-Dokumente, falls vorhanden
   - Tax/Annual/Legal nur soweit fachlich relevant
4. Datenlueckenanalyse:
   - Was liefert das Portal vollstaendig?
   - Was liefert nur das Net-Worth-/Transaction-/Account-Statement-Exportpaket?
   - Welche Kosten, Steuern, Zinsen, Einstandswerte oder Historienfelder fehlen
     noch?

Umsetzung 2026-06-23:

- Der Trade-Republic-Refresh-Button zeigt waehrend eines laufenden
  Portal-Refreshs jetzt Agentphasen aus `agentStatus/traderepublic_portal`.
- Wenn die Agentmeldung auf App-Bestaetigung/Freigabe wartet, zeigt der Button
  `App bestätigen`.

Update 2026-06-27:

- Trade Republic bleibt Portal-first. Der alte Mail-/Manual-Export-Kanal ist
  kein produktiver Standard.
- Loginlauf wurde getestet; die gespeicherte Portal-Session konnte
  wiederverwendet werden.
- Der schnelle Portal-Snapshot aktualisiert aktuelle Werte, Cash und
  sichtbare Positionen.
- Der normale Portalcheck ist inkrementell:
  - kein pauschales Durchscrollen der ganzen Historie
  - Abbruch nach bekannten/neuenlosen Transaktionen
  - voller Backfill nur bewusst mit `--full-portal-scan`
- Schutzregel eingebaut: Ein Trade-Republic-Snapshot wird nur noch angewendet,
  wenn Gesamtwert, sichtbare Positionen und Cash erkannt wurden. Leere oder
  halb geladene Portaltexte duerfen Firestore nicht ueberschreiben.
- Verifizierter aktueller Stand nach Reparaturlauf:
  - Netto inkl. Cash `2.559,37 EUR`
  - Depotwert `2.409,88 EUR`
  - Cash `149,49 EUR`
  - G/V `+73,47 EUR` bzw. `+3,14 %`
- Portal-Faktenstand nach Portal-only-Normalisierung:
  - `69` Portal-Datenfakten
  - `69` Portal-Anwendungen
  - `0` offene erkannte Portal-Fakten
  - `63` Portal-Fakten als historische/manuelle Baseline-Duplikate markiert
  - `6` Portal-Fakten angewendet
  - Tax Report 2025 als Jahresinformation angewendet, ohne Cash-Buchung
- Befund/Fix 2026-06-27:
  - Ein Trade-Republic-Portal-Snapshot kann formal geladen sein und trotzdem
    fachlich falsch sein, z. B. gelistete Positionen mit Stueckzahl, aber Wert
    `0`.
  - Solche Snapshots werden ab jetzt als unvollstaendig abgelehnt.
  - Der letzte schlechte Snapshot wurde verworfen und der plausible
    Portal-Snapshot `20260627_09-10-11_portal_snapshot.json` wiederhergestellt.
  - Trade Republic bleibt primaer `traderepublic_portal_web`.
  - Boerse Frankfurt wird nur als externe Vergleichsquelle in
    `externalQuote*` Feldern gespeichert und darf den Portalwert nicht mehr
    ueberschreiben.
- UI-Entscheidung 2026-06-27:
  - Trade-Republic-Karte startet standardmaessig im Modus `Aktuell`.
  - `Aktuell` verwendet Frankfurt-Kurse fuer gelistete Positionen, damit die
    Anzeige ohne manuellen Portal-Refresh naehere Kurswerte hat.
  - `Broker` zeigt die letzte echte Trade-Republic-Portalbewertung.
  - Cash und Private Markets bleiben in beiden Modi aus dem Portal.
  - Die Karte zeigt getrennt `TR Stand` und `Frankfurt`, damit jederzeit
    sichtbar ist, wann welche Quelle zuletzt aktualisiert wurde.
  - Korrektur 2026-06-27: Der Frankfurt-Vergleichswert
    `externalQuoteDifference` wird nur gegen den Brokerage-Wert der gelisteten
    Wertpapiere gerechnet, nicht gegen Private Markets oder Cash.
- Abschlusscheck 2026-06-27 11:13 CEST:
  - schneller Portal-Refresh erfolgreich:
    `20260627_11-12-49_portal_snapshot.json`
  - `agentStatus/traderepublic_portal=OK`
  - keine offenen Trade-Republic-Dokumente im zentralen Postfach
  - Firestore-Stand:
    - `6` Positionen inkl. Cash
    - `78` Source-Dokumente
    - `351` Source-Dokumentfakten
    - `112` Transaktionen
    - `212` Ledger-Zeilen
    - `13` Kostenereignisse
    - `15` Ertragsereignisse
  - Werte:
    - Netto inkl. Cash `2.559,37 EUR`
    - Depotwert ohne Cash `2.409,88 EUR`
    - Cash `149,49 EUR`
    - Einstand `2.336,41 EUR`
    - G/V `+73,47 EUR` bzw. `+3,14 %`
  - Trade Republic ist fuer den aktuellen Ausbaustand abgeschlossen. Der
    naechste Trade-Republic-Schritt waere nur noch ein bewusst geplanter
    Vollscan/Backfill oder eine spaetere Kosten-/Tax-Dashboard-Auswertung.
- Details:
  [docs/traderepublic_import_strategie.md](/Users/niklaskofler/Documents/finanztool/docs/traderepublic_import_strategie.md)

## Rollen der Geraete

### MacBook Pro

- aktive Entwicklung
- UI, Parser, Architektur, Debugging, Review
- keine produktiven Studio-LaunchAgents starten

### Mac Studio

- Dauerbetrieb
- produktive Import-/API-/Kurs-Agents
- Dateiueberwachung und Google-Drive-Sync
- Backfills und Automationen

## Wichtige Architekturentscheidungen

- Frontend: React + Vite in `app/`
- Datenhaltung: Firestore
- Firestore-Datenvertrag: `docs/firestore_data_contract.md`
  - alle Quellen schreiben in dieselben fachlichen Collections
  - aktuelle Anzeige: `sourcePositions` und `sourceSummaries`
  - Historie/Analyse: `transactions`, `ledgerEntries`, `costEvents`,
    `incomeEvents`, `sourceDocumentFacts`, `priceHistory`
  - neue/geschlossene Depots, Konten und Positionen muessen automatisch erkannt
    und nachvollziehbar markiert werden
- Hosting: Firebase Hosting
- Regeln: `firestore.rules`, `storage.rules`
- Import-Automation: lokaler Agent in `automation/`
- Originaldokumente kommen aus Google Drive
- Importierte Dokumente koennen nach `02_Archiviert` verschoben werden

## Wichtige Quellen

- Flatex
- Trade Republic
- Ginmon
- Intergold
- Bitget
- Capital.com
- VBV Vorsorgekasse
- EquatePlus
- Bankkonten/Kreditkarten:
  - Sparkasse/George
  - Revolut
  - bank99
  - N26
  - PayPal
  - Amazon Visa
  - TF Bank Kreditkarte
- Bankkonten/Kreditkarten, noch offen:
  - George Visa bleibt ohne aktuelle Loesung pausiert
- Trading 212 ist angebunden und derzeit nur mit Cash relevant

## Aktueller Produktivstand

- Firebase-Projekt: `finanzperformance-tool`
- Hosting URL: `https://finanzperformance-tool.web.app`
- Letzter Deploy: 2026-06-20 18:43 CEST, Hosting, Firestore Rules/Indexes
  und Storage Rules
- Letzter gezielter Firestore-Rules-Deploy: 2026-06-27, fuer
  `manualInputs/equateplus_novartis` mit `entryValueEur`
- Firestore Database ist erstellt
- Firebase Hosting ist konfiguriert
- Die App liest Live-Daten aus Firestore
- App-Login ist auf `niklas.kofler@gmail.com` begrenzt
- App darf `automationCommands/sync_quotes_manual`,
  `automationCommands/traderepublic_portal_refresh`,
  `documentReviewDecisions/*` und das eng begrenzte manuelle
  Eingabedokument `manualInputs/equateplus_novartis` schreiben.
  Der Command-Runner interpretiert `sync_quotes_manual` historisch so benannt
  inzwischen als Full-Refresh.
- Finanzdaten werden lokal durch Agents geschrieben, nicht direkt aus der App
- Mac Studio ist der Zielort fuer Dauerbetrieb

## Aktueller Geraete-Handoff

- Stand: 2026-06-28 21:51 CEST
- Aktion: `ftp` vom Mac Studio von Niklas Richtung MacBook Pro
- Ausgangscommit: `6dc9dc9`
- Handoff-Commit: wird in diesem `ftp`-Lauf erstellt
- Firebase Deploy: wird in diesem `ftp`-Lauf ausgefuehrt
- Naechster Schritt auf MacBook Pro: `ftd` ausfuehren
- Bekannte Wechselpunkte:
  - Secrets und produktive LaunchAgents werden nicht per Git uebertragen
  - Mac Studio bleibt produktiver Agent-Knoten
  - Kurzbefehle sind `ftd`, `fts`, `ftp`; `ftu` ist alter Alias

## Fachlich bereits umgesetzt

### Flatex

- Browser-Export-Agent ist gebaut
- Zugangsdaten liegen im macOS-Schluesselbund
- Session-TAN bleibt deaktiviert
- Exportzeitraum: `zwei Wochen`
- Zeitplan: taeglich 08:00, 10:00, 13:00, 17:00, 22:00
- Bestand und Cash werden aus Konto-/Depotumsaetzen berechnet
- Seit 2026-06-21 liest der Flatex-Agent nach dem Umsatzexport zusaetzlich den
  aktuellen Broker-Snapshot aus `Mein flatex Depot`
  - Dashboardwerte: Depotwert, Kontosaldo, Gesamtvermoegen, verfuegbares
    Guthaben, Kreditlinie
  - Positionswerte: ISIN, WKN, Handelsplatz, Stueck, Kurszeit, Kurs,
    Gesamtwert, Einstand, Gesamtentwicklung, Tagesentwicklung
  - Firestore:
    - `sourcePositions`: aktuelle Flatex-Positionen aus Broker-Snapshot
    - `sourceSummaries/flatex`: Broker-Depotwert als primaerer Flatex-Wert
    - `rawDocuments/flatex_broker_snapshot_latest`
    - `imports/flatex_broker_snapshot_latest`
- Boerse-Frankfurt-Kurse bleiben fuer Flatex Vergleichs-/Historienquelle und
  duerfen den Flatex-Brokerwert nicht mehr still ueberschreiben
- Verifizierter Stand 2026-06-21 00:43 CEST:
  - Flatex Broker-Depotwert: `22.435,45 EUR`
  - Flatex Cash: `-5.843,79 EUR`
  - Flatex Gesamtvermoegen: `16.591,66 EUR`
  - Boerse-Frankfurt-Vergleichswert: `22.578,42 EUR`
  - Differenz Broker vs. externe Kursbewertung: `142,97 EUR`
  - Health: `OK`, 0 Fehler, 0 Warnungen
- Flatex-Postfach inklusive PDFs ist jetzt als generischer Dokumentfaktenlayer
  in Firestore abgebildet:
  - Parser: `automation/src/flatex-document-parser.mjs`
  - Reconcile/Sync: `automation/src/reconcile-flatex-documents-local.mjs`
  - Firestore-Collections: `sourceDocuments`, `sourceDocumentFacts`
  - Stabile Dokument-IDs: bevorzugt `flatex_doc_<PostboxDocumentId>`,
    sonst Hash-Fallback
  - Verifizierter Stand 2026-06-13:
    - `sourceDocuments`: 283 Flatex-Dokumente
    - `PARSED`: 283
    - `UNKNOWN`: 0
    - `sourceDocumentFacts`: 401 Flatex-Fakten
- Flatex-Faktentypen:
  - Wertpapierabrechnungen/Kaeufe: `security_trade`
  - Dividenden/Ausschuettungen: `income_distribution`
  - Thesaurierungen: `fund_accumulation`
  - Kontoauszuege: `account_statement`,
    `account_position_market_value`
  - Depotauszuege: `depot_statement`, `depot_position_snapshot`
  - Steuerbescheinigungen: `tax_certificate`, `tax_certificate_entry`
  - Kapitalmassnahmen/Info-/Order-/SEPA-/CFD-/Kosten-/Saldo-Dokumente als
    eigene generische Faktentypen
- Falls kuenftig ein Flatex-Dokument nicht klassifiziert werden kann, erzeugt
  `systemHealth/current` eine Warnung `Flatex-Dokument nicht klassifiziert`.

### Trade Republic

- Aktiver Kanal ist seit 2026-06-27 der Trade-Republic-Portal-Agent.
- Mail-Agent und Manual-Export-Agent sind Legacy/Fallback und nicht mehr
  produktiver Standard.
- App-Refresh nutzt den schnellen Portal-Snapshot; ein voller Portal-Scan fuer
  Dokumente, Kosten, Steuern und Transaktionen wird nur gezielt oder geplant
  ausgefuehrt.
- PDF-Passwort liegt lokal im macOS-Schluesselbund, falls alte/verschluesselte
  PDF-Fallbacks spaeter nochmals ausgewertet werden muessen.
- Wichtige Baseline-Entscheidung 2026-06-13:
  - Die am 2026-06-13 frisch exportierten Dateien sind ab jetzt der neue
    Trade-Republic-Status-Quo
  - alte Mail-Duplikate und fruehere Trade-Republic-Imports sind fachlich
    obsolet und wurden in Firestore entsprechend ersetzt/markiert
  - die selbst gemailten Exporte `Net Worth.pdf`, `Transaction export.csv` und
    `Account statement.pdf` waren nur der Zwischenstand/Fallback bis zur
    Portal-Integration
- Aktueller Zielbetrieb seit 2026-06-27:
  - aktueller Wert, Cash, sichtbare Brokerpositionen und Private-Markets-
    Restwert kommen aus dem Trade-Republic-Webportal
  - Portal-Dokumente liefern neue Transaktions-, Kosten-, Steuer- und
    Zinsinformationen
  - Mail-Agent und Manual-Export-Agent bleiben Legacy/Fallback und sollen im
    normalen Betrieb nicht mehr gebraucht werden
- Neue Baseline-Dateien:
  - `Transaction export.csv`: komplette Transaktions-/Positionsbasis
  - `Account statement.pdf`: Cashkonto-Abgleich, Periodenende `2026-06-12`
  - `Tax Report 2025.pdf`: Jahressteuerbeleg
- Baseline-Sync:
  - Script: `automation/src/reconcile-traderepublic-baseline-local.mjs`
  - Befehl: `npm run sync:traderepublic-baseline`
  - archivierte Originale:
    `01_Originale/TradeRepublic/Baseline/2026-06-13/`
- Verifizierter Firestore-Stand nach Baseline:
  - `sourceDocuments`: 3 Trade-Republic-Baseline-Dokumente
  - `sourceDocumentFacts`: 198 Trade-Republic-Fakten
  - `transactions`: 106
  - `ledgerEntries`: 191
  - `costEvents`: 13
  - `sourcePositions`: 6 inklusive Cashkonto
  - `sourceSummaries/traderepublic.netValue`: `2.523,87 EUR`
  - `sourceSummaries/traderepublic.cashValue`: `149,49 EUR`
  - `sourceSummaries/traderepublic.depotValue`: `2.374,38 EUR`
- Trade-Republic-Positionen nach Baseline:
  - Stoxx Europe Defense EUR (Acc): `104,072579` Stk.,
    Einstand `590,95 EUR`
  - Core S&P 500 USD (Acc): `0,295609` Stk., Einstand `190,00 EUR`
  - NASDAQ100 USD (Acc): `0,267833` Stk., Einstand `340,00 EUR`
  - Netflix: `0,094` Stk., Einstand `10,06 EUR`; Split vom
    2025-11-17 ist eingerechnet
  - Private Equity `LU3176111881`: `11,178226` Stk.,
    Einstand `1.145,40 EUR`
  - Cashkonto: `149,49 EUR`
- Private Equity `LU3176111881` bleibt dokumentbasiert, weil keine stabile
  Boerse-Frankfurt-Quelle gefunden wurde
- PDF-Passwort bleibt lokal im macOS-Schluesselbund und wird nie in App, Firestore oder Git gespeichert
- PDF-Tooling-Entscheidung 2026-06-13:
  - `qpdf` ist fuer verschluesselte Trade-Republic-Duplicate-PDFs erforderlich
  - `pdftotext`/Poppler ist fuer robuste Textextraktion empfohlen
  - `automation/src/pdf-text.mjs` nutzt jetzt automatisch `pdftotext`, falls
    im `PATH` vorhanden, und faellt sonst auf `pdfjs-dist` zurueck
  - Auf dem aktuellen Shell-Pfad waren `qpdf`, `pdftotext` und `brew` nicht
    sichtbar; unverschluesselte PDFs wurden trotzdem erfolgreich per `pdfjs`
    extrahiert

### Ginmon

- Browser/API-Agent ist gebaut
- Login funktioniert ohne 2FA
- Mehrere Portfolios/Konten werden dynamisch verarbeitet
- Positionsdaten werden in `sourcePositions` geschrieben
- Summary wird in `sourceSummaries/ginmon` geschrieben
- Ginmon `Investment`, `Ginmon Top Zinsen` und `Risikoklasse 10 Global`
  werden als drei eigene Depots erkannt
- Positions-Quotes werden durch den lokalen Kurs-Sync ergaenzt, ohne den
  Ginmon-API-Gesamtwert zu ueberschreiben
- Falls Ginmon fuer eine Position keinen positionsgenauen Einstand liefert,
  wird aktuell anteilig `netInflow * allocation.ratio` als Arbeitswert
  verwendet; Steuerdetails muessen spaeter vertieft werden
- Wichtige Korrektur 2026-06-13: Die bisherige Ginmon-Datenhaltung ist noch
  nicht generisch genug. `sourcePositions` darf nur die aktuelle App-Ansicht
  sein, nicht die einzige Wahrheit.
- Verbindlicher Ginmon-Datenvertrag liegt in
  [Ginmon Konzept](/Users/niklaskofler/Documents/finanztool/docs/ginmon_import_konzept.md):
  - Dokumente liefern echte Stueckzahlen, Einstand, Kosten, Steuern,
    Transaktionen, Rechnungen und Strategie-/Risikoinformationen
  - API liefert fuer Ginmon nur noch aktuelle Werte und daraus abgeleitete
    aktuelle Ginmon-Kurse je ISIN
  - Boerse-Frankfurt-Kurs-Sync laeuft standardmaessig nicht mehr fuer Ginmon,
    sondern fuer Flatex und Trade Republic
  - Geschaetzte Stueckzahlen duerfen nur mit `quantityEstimated=true` und
    `ca.` angezeigt werden
- Lokale Dateianalyse: 369 Ginmon-Dateien vorhanden
- Ginmon-Portalabgleich am 2026-06-13:
  - Portal meldet 333 Dokumente
  - alle 333 Portal-Dokumente waren lokal bereits vorhanden
  - 0 neue Downloads
  - zusaetzliche lokale Dateien sind Vertrags-/Strategie-/Info-Unterlagen
- Firestore-Stand nach generischer Befuellung:
  - `sourceDocuments`: 369 Ginmon-Dokumente
  - `sourceDocumentFacts`: 663 Ginmon-Fakten
  - `docsWithExternalId`: 333
  - `parsedDocs`: 351
  - `unknownDocs`: 18
- Ginmon-Faktentypen in `sourceDocumentFacts`:
  - `position_snapshot`: 250
  - `trade`: 95
  - `invoice`: 88
  - `account_statement`: 77
  - `cash_ledger_entry`: 62
  - `earning`: 34
  - `quarterly_report`: 30
  - `account_snapshot`: 27
- Dedupe-Regel: Portal-Dokumente verwenden stabile Firestore-IDs
  `ginmon_doc_<portalDocumentId>`. Verschieben/Archivieren erzeugt dadurch
  keine neue fachliche Dokumentidentitaet.
- Ginmon-Betriebsregel ab 2026-06-13:
  - Dokumentimport taeglich um `02:00`
  - API-Sync stuendlich
  - beide LaunchAgents laufen mit `GINMON_HEADLESS=true`
  - installierte LaunchAgents:
    - `com.niklas.finanztool.ginmon-documents`
    - `com.niklas.finanztool.ginmon-sync`
  - frischer Headless-API-Kickstart wurde verifiziert:
    `last exit code = 0`, Error-Log leer

### Intergold

- Preisimport ist gebaut
- Bestandsbewertung aus Belegen ist gebaut
- Preisimport und Belegimport bleiben getrennt
- Kurzfassung liegt in [intergold_preisimport_kurzfassung.md](/Users/niklaskofler/Documents/finanztool/docs/intergold_preisimport_kurzfassung.md)
- Daten-Audit liegt in [intergold_data_audit_2026-06-22.md](/Users/niklaskofler/Documents/finanztool/docs/intergold_data_audit_2026-06-22.md)
- LaunchAgent: `com.niklas.finanztool.intergold-sync`, taeglich 08:20
- Verifizierter Stand 2026-06-27:
  - `sourcePositions`: 13 Metallpositionen
  - aktueller Lauf: 19 gueltige Preisbloecke aus der Intergold-Webseite
  - `sourceSummaries/intergold.currentValue`: `29.895,52 EUR`
  - `sourceSummaries/intergold.saleValue`: `34.863,99 EUR`
  - `sourceSummaries/intergold.costValue`: `23.040,51 EUR`
  - `sourceSummaries/intergold.performanceValue`: `+6.855,01 EUR`
  - `sourceSummaries/intergold.performancePct`: `+29,75 %`
  - Dokumentstand: `2026-03-23`
  - Preisstand Website: `2026-06-23`
  - `sourceDocuments`: 2 Intergold-Kaufbelege, beide in Firebase Storage
  - `sourceDocumentFacts`: 19
  - `transactions`: 17 Metall-Kaufzeilen
  - `costEvents`: 17 anteilige Kauf-/Lagerkosten
  - offene Intergold-Info-Dokumente im Postfach: 0
- Intergold schreibt jetzt Transparenzfelder:
  - `sourceDataUpdatedAt`, `sourceDataProvider=intergold_confirmation_pdf`
  - `documentDataUpdatedAt`, `documentDataProvider=intergold_confirmation_pdf`
  - `quoteDataUpdatedAt`, `quoteDataProvider=intergold_website`
  - `quoteDataChangedAt`
  - `lastAgentRunAt`, `lastAgentSuccessAt`
- Preis-History ist idempotent nach
  `Metall + Preisstand + Einheit + Verkaufspreis + Ankaufspreis`
- Intergold-Dokumentregel ab 2026-06-27:
  - Kauf-/Einlagerungsbelege werden geparst und in Bestand, Fakten,
    Transaktionen und Kosten uebernommen
  - sonstige Intergold-Anhaenge bleiben als `UNPARSED`/`UNKNOWN` im zentralen
    Dokumenten-Postfach und werden nicht automatisch ignoriert
  - `not_relevant`/nicht relevant darf nur durch deine manuelle Entscheidung
    im Dokumenten-Postfach gesetzt werden, nie automatisch durch den Agenten
  - Verkaufs-/Auslagerungsdokumente werden erst verarbeitet, wenn echte
    Verkaufsdaten vorhanden sind und der Parser dafuer explizit gebaut wurde
  - Die GUI zeigt im Dokumenten-Postfach neben offenen Faellen auch
    verarbeitete Intergold-Dokumente als Kontrollarchiv an, damit die
    Intergold-Anhaenge dort auffindbar bleiben.
- Offen:
  - automatische Mailablage neuer Intergold-Anhaenge muss noch mit einem
    echten neuen Mailanhang end-to-end auditiert werden

### EquatePlus

- Entscheidung 2026-06-27: EquatePlus wird fuer den aktuellen Stand bewusst
  vereinfacht.
- Keine Mail-/PDF-/Portal-Automatisierung, bis echte relevante Dokumente
  vorliegen oder ein fachlicher Mehrwert entsteht.
- App-Karte erlaubt manuelle Eingabe fuer:
  - Novartis-Anteile
  - gesamten Einstandswert in EUR
- Der Kurs-Agent bewertet ausschliesslich Novartis (`ISIN CH0012005267`) ueber
  SIX Swiss Exchange (`six_swiss_exchange`) und rechnet CHF mit Frankfurter/ECB-
  FX in EUR um.
- Firestore-Ziele:
  - `manualInputs/equateplus_novartis`
  - `sourcePositions/equateplus_novartis`
  - `sourceSummaries/equateplus`
  - `quotesCurrent/isin_CH0012005267`
  - optional `priceHistory/isin_CH0012005267_<datum>`
  - `agentStatus/equateplus`
- Startwert aus Screenshot/aktueller Nutzerangabe:
  - `16,2` Anteile
  - `1.500 EUR` Einstandswert
  - Einstand kann in der Karte ueberschrieben werden
- Wenn spaeter EquatePlus-Dokumente eintreffen, werden sie zuerst klassifiziert;
  ein Parser wird erst gebaut, wenn daraus Kosten, Steuern, Vesting,
  Transaktionen oder andere fachlich relevante Felder ableitbar sind.
- Fachlicher Abschluss 2026-06-27:
  - EquatePlus gilt vorerst als erledigt.
  - Fuer den aktuellen Zweck reicht es, Depotbestand, Einstandswert und G/V zu
    kennen.
  - Wegen des Mitarbeiterbonus und der voraussichtlich geringen Bewegung wird
    keine zusaetzliche Bewegungs-, Dokument- oder Portalautomation gebaut.

### Bankkonten / Enable Banking

- Entscheidung 2026-06-26: Bankkonten werden read-only ueber Open
  Banking/Enable Banking integriert
- Kein Bank-Web-Scraping und keine Zahlungsfunktion
- Konten und aktuelle Salden sind integriert.
- Umsaetze werden als `ledgerEntries` gespeichert.
- Bankkosten/Steuern werden als `costEvents`, Zinsen/Bonus/Cashback als
  `incomeEvents` gespeichert, wenn sie im Umsatztext eindeutig erkannt werden.
- Quelle ist generisch `bank_accounts`, nicht mehr nur Sparkasse George
- Enable-Banking-Production-App ist eingerichtet und aktiv:
  `5df43790-b2b4-4920-987e-df41f7393250`
- Service ist `Account Information` und auf eigene verlinkte Konten
  eingeschraenkt (`Restricted`)
- Im Control Panel verlinkt sind Erste Bank/Sparkasse, Revolut, bank99, N26
  und PayPal. Fuer alle fuenf Quellen ist auf dem Mac Studio eine
  Enable-Banking-Session im macOS-Schluesselbund gespeichert.
- Bank99 darf vom Agenten maximal 4-mal pro Kalendertag abgerufen werden; das
  Limit wird lokal in `automation/runtime/enable-banking-rate-limits.json`
  erzwungen.
- Private Key liegt lokal unter
  `/Users/niklaskofler/Documents/finanztool/secrets/enable-banking/5df43790-b2b4-4920-987e-df41f7393250.pem`
  und zusaetzlich im macOS-Schluesselbund unter
  `finanztool.enablebanking.privateKey.5df43790-b2b4-4920-987e-df41f7393250`
- App-ID liegt im Schluesselbund unter
  `finanztool.enablebanking.applicationId`
- Import schreibt aktuelle Kontostaende in `sourceSummaries/bank_accounts`,
  `sourcePositions`, `sourceAccounts`, `imports` und `agentStatus`
- Transaktionsimport schreibt zusaetzlich `ledgerEntries`,
  `sourceDocumentFacts`, `costEvents` und `incomeEvents`.
- Initialbestand ist vorhanden. Normaler Sync liest inkrementell ab letztem
  gespeicherten Umsatz je Konto minus 2 Tage Sicherheitsfenster, damit die
  App-Aktualisierung schnell bleibt. Historischer Backfill:
  `npm run sync:bank-accounts:backfill` fuer 180 Tage.
- Gepruefter Stand 2026-06-26 22:10:
  - Erste/Sparkasse-Session aktiv
  - Kontostand `2041.64 EUR`
  - verfuegbar inkl. Kredit `5041.64 EUR`
  - erkannte Kreditlinie `3000.00 EUR`
  - `ledgerEntries` fuer `bank_accounts`: 255 gespeicherte Umsaetze
  - letzter Umsatz: `2026-06-26`
  - letzter normaler Sync: 57 Umsaetze geprueft, 0 neue, 57 Duplikate
  - `costEvents`: 2, `incomeEvents`: 0
- Entscheidung 2026-06-27: laufende George/Bankkonten-Transaktionslaeufe
  sollen nicht mehr 30 Tage starr pruefen, sondern je Konto ab
  `latestTransactionDate - 2 Tage`. Backfill bleibt manuell.
- Gepruefter Stand 2026-06-27 00:27 lokal:
  - Sync-Modus: `incremental`
  - API-Fenster: `2026-06-24` bis `2026-06-27`
  - 4 Umsaetze geprueft, 0 neue, 4 Duplikate
  - gespeicherte Screenshot-Umsaetze vom 2026-06-26 vorhanden:
    Novartis `3032.70`, OEGK `66.01`, TF Bank `-260.00`,
    PayPal `-21.76`
  - Future/geplante Umsaetze wie `29.06.2026` werden im normalen BOOK-Ledger
    nicht als gebuchte Historie behandelt.
- Gepruefter Stand 2026-06-27 01:25 lokal:
  - Revolut-Session erzeugt und im Schluesselbund gespeichert
  - bank99-Session erzeugt und im Schluesselbund gespeichert
  - Bankkonten-Sync `OK`, Health `OK`, keine Warnungen
  - `sourceSummaries/bank_accounts`: 3 Konten, Geldstand `2183.15 EUR`,
    verfuegbar inkl. Kredit `5183.15 EUR`, Kreditlinie ca. `3000.00 EUR`
  - Erste/Sparkasse: `2041.64 EUR`, letzter Umsatz `2026-06-26`,
    `255` gespeicherte Umsaetze
  - Revolut: `100.00 EUR`, aktuell keine Umsaetze aus der API geliefert;
    Bankdatenstand laut API `2025-06-19`, deshalb beobachten
  - bank99: `41.51 EUR`, `9` initiale Umsaetze gespeichert, letzter Umsatz
    `2026-06-23`
  - bank99-Limit genutzt: 1 von 4 erlaubten Abrufen am Kalendertag
- Gepruefter Stand 2026-06-27 02:05 lokal:
  - George/Erste-Freigabe wurde neu gestartet, um zu pruefen, ob die Visa
    Kreditkarte ueber denselben PSD2-Zugriff sichtbar ist.
  - Ergebnis: Enable Banking liefert fuer Erste/Sparkasse weiterhin genau
    1 Account und keinen Karten-/Visa-/PAN-Hinweis. George Visa wird damit
    ueber diesen Zugriff aktuell nicht sichtbar.
  - TF Bank ist in der Enable-Banking-ASPSP-Liste nicht als eigener Treffer
    auffindbar; daher vorerst nicht ueber denselben Open-Banking-Weg.
  - Technische Schutzregel im Bank-Agent ergaenzt: Wenn eine Neufreigabe eine
    neue Provider-Account-ID liefert, aber je Bank genau ein bestehendes und
    ein neues Konto existiert, wird die alte Kontoidentitaet weiterverwendet,
    damit keine doppelten Konten/Umsaetze entstehen.
- Der echte Kontostand zaehlt als Cash/Netto-Wert. Ein von Enable Banking
  hoeher gelieferter verfuegbarer Betrag wird als `availableWithCredit`
  gespeichert; die Differenz wird als `creditLineEstimate` behandelt und nicht
  als Vermoegen gezaehlt
- GUI-Regel: Bankkonten zeigen Geldstand, verfuegbaren Betrag, Kreditlinie,
  Bankstand und Agentstatus. Keine Einstand/G/V/Heute-Depotlogik auf
  Bankkonten anwenden.
- Offener Schritt: George Visa bleibt pausiert; Revolut Datenstand beobachten,
  weil die API aktuell keine Umsaetze geliefert hat.
- Gepruefter Stand 2026-06-27 22:34 lokal:
  - N26-Session erzeugt und im Schluesselbund gespeichert
  - PayPal-Session erzeugt und im Schluesselbund gespeichert
  - N26: `3.51 EUR`, aktuell keine Umsaetze im Initialfenster geliefert
  - PayPal: `0.00 EUR`, `14` initiale Umsaetze gespeichert, letzter Umsatz
    `2026-06-24`
  - `sourceSummaries/bank_accounts`: `7` Unterquellen, Geldstand
    `1930.27 EUR`
  - Korrektur 2026-06-28: Der normale Bankkonten-Agent liest stuendlich nur
    `erste,revolut,paypal`.
  - N26 und bank99 bleiben separate, lokal rate-limitierte Agenten und werden
    nicht durch `sync:bank-accounts` oder `sync:all` mitgelesen.
  - PayPal-Dedupe-Fix: Bestehende Bankkonto-Ledger-Schluessel muessen den
    bisherigen `identificationHash` weiterverwenden, wenn dieser beim ersten
    Import genutzt wurde. Sonst schreibt PayPal denselben Umsatz nach einem
    Folgelauf mit Provider-ID ein zweites Mal. Der doppelte PayPal-Umsatz vom
    Testlauf wurde entfernt; PayPal steht wieder bei `14` Ledger-Umsaetzen,
    `0` Duplikatgruppen.
  - N26 hat nach mehreren schnellen Testabrufen einen Enable-Banking-429
    (`Too many requests`) geliefert. Letzter Wert `3.51 EUR` bleibt erhalten;
    der naechste normale Stundenlauf sollte den Status wieder aktualisieren.
- Detailplan liegt in
  [Sparkasse George Integration](/Users/niklaskofler/Documents/finanztool/docs/sparkasse_george_integration_plan.md)

### Kreditkarten-Portale

- Entscheidung 2026-06-27: Kreditkarten-Portale sind fuer den aktuellen
  Datenbasis-Cleanup zurueckgestellt. Bestehende Saldo-Unterkonten duerfen als
  Transparenzwerte sichtbar bleiben; keine weitere Abrechnungs-,
  Transaktions- oder Portal-Automatisierung, bis die Kernquellen bereinigt
  sind.
- Historischer technischer Stand 2026-06-27: Amazon Visa und TF Bank wurden
  nicht ueber Enable Banking sichtbar, sondern zunaechst als Portal-Agenten mit
  aktuellem Kreditkartensaldo vorbereitet.
- Firestore-Regel:
  - `sourceSummaries/<source>.currentValue` ist negativ, weil offener
    Kreditkartensaldo eine Schuld ist.
  - `debtValue` ist der positive offene Saldo.
  - `availableWithCredit` und `creditLineEstimate` sind Transparenzwerte und
    zaehlen nicht als Vermoegen.
- App-Regel:
  - Kreditkarten werden in der Bankkarte als Unterkonten angezeigt.
  - Kreditkarten-Unterkonten zeigen Saldo, Verfuegbar und Kreditlimit.
  - Keine Einstand/G/V/Heute-Depotlogik auf Kreditkarten anwenden.
- Amazon Visa:
  - Portal: `https://kunden.openbankpay.com/amazon/login`
  - Agent: `automation/src/sync-amazon-visa-local.mjs`
  - Script: `npm --prefix automation run sync:amazon-visa`
  - Secrets im macOS-Schluesselbund:
    `finanztool-amazon-visa-email`, `finanztool-amazon-visa-pin`
  - Gepruefter Stand 2026-06-27 02:55 lokal:
    - Login per Schluesselbund erfolgreich
    - offener Saldo `1.620,23 EUR`
    - verfuegbar `379,77 EUR`
    - Kreditkartenlimit `2.000,00 EUR`
    - Firestore geschrieben als Bank-Unterkonto nach
      `sourceSummaries/bank_accounts`,
      `sourcePositions/bank_accounts_amazon_visa_card`,
      `sourceAccounts/bank_accounts_amazon_visa_card`,
      `agentStatus/amazon_visa`
- TF Bank Kreditkarte:
  - Portal: `https://meine.tfbank.at/login`
  - Agent: `automation/src/sync-tfbank-local.mjs`
  - Script: `npm --prefix automation run sync:tfbank`
  - Secrets im macOS-Schluesselbund:
    `finanztool-tfbank-customer-number`, `finanztool-tfbank-birthdate`
  - Gepruefter Stand 2026-06-27 03:05 lokal:
    - Loginformular wird ausgefuellt
    - Portal geht bis zur SMS-TAN
    - `--tan-stdin` erlaubt Eingabe des frischen SMS-Codes im selben
      Browserlauf
    - offener Saldo `256,39 EUR`
    - verfuegbar `5.743,61 EUR`
    - Kreditrahmen `6.000,00 EUR`
    - reserviert `0,00 EUR`
    - Firestore geschrieben als Bank-Unterkonto nach
      `sourceSummaries/bank_accounts`,
      `sourcePositions/bank_accounts_tfbank_card`,
      `sourceAccounts/bank_accounts_tfbank_card`, `agentStatus/tfbank`
- Gepruefter Gesamtstand Bankkarte 2026-06-27 03:10 lokal:
  - 5 Unterkonten: Erste/Sparkasse, Revolut, bank99, Amazon Visa, TF Bank
  - Geldstand netto `306,53 EUR`
  - verfuegbar `11.306,53 EUR`
  - Kreditlinie `11.000,00 EUR`
  - Health: `OK`, 0 Fehler, 0 Warnungen

### Betriebliche Altersvorsorge

- VBV Vorsorgekasse ist als eigene Quelle gebaut
- Keine Einzelpositionen
- Summary/Karte `sourceSummaries/vbv`
- Dokumentbasierte Kontoinformation in `sourceDocuments` und
  `sourceDocumentFacts`
- Taeglicher headless Agentlauf um 06:45; gleicher Stichtag wird nicht neu
  importiert

### Bitget

- Firestore enthaelt aktuelle Bitget-Positionen aus einem erfolgreichen Lauf
- API-Key, Secret und Passphrase liegen lokal im macOS-Schluesselbund
- Spot- und Earn-Bestand werden in `sourcePositions` geschrieben
- Der produktive Bitget-LaunchAgent laeuft auf dem Mac Studio alle 5 Minuten
- Bitget nutzt fuer Bitget-Bewertungen ausschliesslich Bitget-Daten:
  Bitget-Ticker, `all-account-balance`, Spot-Assets und Earn-Assets
- Keine externen Preisfallbacks fuer Bitget, also kein CoinGecko und keine
  Frankfurter Boerse fuer Krypto
- Sauberer Schnitt vom 2026-06-20:
  - TRUMP und MELANIA sind keine aktuellen Portfolio-Positionen mehr
  - Spot-BTC-Dust unter `1 EUR` wird ausgeblendet, weil solche Reste in der
    GUI als sinnlose Null-/Centposition erscheinen
  - Ausgeschlossene Bitget-Bestaende bleiben im Rohsnapshot
    `rawDocuments/api_bitget_latest.rawPositions` und in
    `excludedPositions` nachvollziehbar
  - `sourcePositions` ist fuer Bitget ab diesem Schnitt die saubere aktuelle
    Portfolioansicht, nicht die ungefilterte API-Rohliste
- `sourceSummaries/bitget.currentValue` und `netValue` nutzen den von Bitget
  gelieferten kontenuebergreifenden Kontowert (`all-account-balance`, in USDT,
  mit Bitget `USDTEUR` nach EUR umgerechnet)
- Zusaetzlich werden gespeichert:
  - `positionsValue`: Summe aller Bitget-Positionen
  - `includedPositionsValue`: Summe aller bewertbaren Bitget-Positionen
  - `positionSummaryDifference`: Differenz zwischen bewertbarer
    Positionssumme und Bitget-Kontowert
  - `exchangeAccountValue`: Wert aus Bitget `all-account-balance` in EUR
  - `totalAccountValueUsdt`: Bitget-Kontowert in USDT
  - `componentsUsdt`: Bitget-Kontokomponenten
  - `unpricedPositionCount` und `unpricedPositions`: Assets, die Bitget als
    Bestand liefert, fuer die Bitget aber keinen Kurs liefert
  - `excludedPositionCount` und `excludedPositions`: Rohbestaende, die bewusst
    nicht in die aktuelle Portfolioansicht geschrieben werden
- `agentStatus/bitget` dokumentiert den letzten erfolgreichen Lauf
- `sourceSummaries/bitget` und die Bitget-Positionen schreiben getrennt:
  `sourceDataUpdatedAt`, `sourceDataProvider=bitget_api`,
  `quoteDataUpdatedAt`, `quoteDataProvider=bitget_api`,
  `lastAgentRunAt` und `lastAgentSuccessAt`
- Der aktuelle Mac-Studio-Test vom 2026-06-27 war erfolgreich:
  `npm run check:bitget`, `npm run import:bitget:local`,
  `npm run sync:bitget-ledger`, `npm run sync:health`
- Firestore ueberschreibt ab 2026-06-20 bei jedem Lauf denselben aktuellen
  Importstand:
  - `imports/api_bitget_latest`
  - `rawDocuments/api_bitget_latest`
- Damit schreibt der 5-Minuten-Lauf keine endlose 5-Minuten-Historie. Historie
  soll separat ueber geplante Tages-/Preishistorie entstehen.
- Historische Self-Service-Exporte von 13.06.2024 bis 13.06.2026 liegen in
  `My Drive/Depot/01_Originale/Bitget/API_Exports/`
- Verifizierte Einstandswerte:
  - TRUMP: `990,80114 USDT` fuer urspruenglich `20,20977 TRUMP`; bei aktueller
    Restposition wird die Kostenbasis proportional auf die aktuelle Menge
    heruntergerechnet
  - MELANIA: `289,53119 USDT` fuer aktuell `66,20373 MELANIA`
- Persistente Kostenbasis liegt in Firestore unter `sourceCostBasis` und wird
  bei jedem Bitget-Import zugemischt
- Coins ohne aktuellen Bitget-Ticker bleiben sichtbar, werden aber nicht
  bewertet und mit `quoteStatus=NO_BITGET_PRICE` markiert; nach dem sauberen
  Schnitt betrifft das keine aktuelle Bitget-Position mehr, weil MELANIA
  ausgeschlossen ist
- BTC-Einstand wurde vom Nutzer mit insgesamt `3.000 EUR` fuer den Earn-Bestand
  von `0,066856 BTC` bestaetigt; rechnerischer Einstandskurs:
  `44.872,561924 EUR/BTC`
- EUR-Einstandswerte fuer TRUMP und MELANIA bleiben bis zum Abgleich mit Bank-
  oder Kreditkartenbuchungen bewusst leer
- Health-Fehler zu alten Bitget-Importen werden ab 2026-06-20 ignoriert, wenn
  danach ein erfolgreicher `agentStatus/bitget.lastSuccessAt` vorhanden ist
- Verifizierter Stand 2026-06-27:
  - `agentStatus/bitget`: `OK`
  - `sourcePositions`: 3 Bitget-Positionen (`BTC Earn`, `EUR`, `USDT`)
  - `sourceSummaries/bitget.currentValue`: ca. `3.632 EUR`
  - `sourceSummaries/bitget.costValue`: `3.000 EUR`
  - `sourceSummaries/bitget.performanceValue`: ca. `+632 EUR`
  - `sourceSummaries/bitget.excludedPositionCount`: `3`
    (`bitget_spot_BTC`, `bitget_spot_TRUMP`, `bitget_spot_MELANIA`)
  - `sourceSummaries/bitget.unpricedPositionCount`: `0`
  - Bitget selbst erzeugt keine Health-Warnung; aktuelle Health-Warnungen
    betreffen Flatex-Wartung und offene Ginmon-Dokumente im Postfach
- Daten-Audit liegt in `docs/bitget_data_audit_2026-06-20.md`
- Wichtiger Audit-Befund:
  - aktuelle Positionen werden automatisch gepflegt
  - Kosten, einzelne Trades, Fees und Earn-Zinsen sind ueber Bitget-API
    abrufbar
  - Seit 2026-06-20 existiert ein separater Bitget-Ledger-Agent:
    - LaunchAgent `com.niklas.finanztool.bitget-ledger`
    - stuendlicher Lauf
    - Script `automation/src/sync-bitget-ledger-local.mjs`
    - Lock-Datei `/tmp/finanztool-bitget-ledger.lock`
  - Seit 2026-06-27 arbeitet der Ledger-Agent im Normalbetrieb inkrementell:
    - Startpunkt = letztes erfolgreiches Fensterende minus
      `BITGET_LEDGER_OVERLAP_DAYS` (Standard 2 Tage)
    - voller Backfill nur bewusst per `--backfill`, `--full` oder
      `BITGET_LEDGER_FORCE_BACKFILL=true`
    - vorhandene historische Dokumente werden nicht geloescht, sondern per ID
      ueberschrieben/ergaenzt
  - Letzter verifizierter Ledger-Stand 2026-06-27:
    - letzter Lauf: `incremental`, 48 Ledger, 0 Trades, 0 Kosten, 2 Zinsen,
      48 Tax-Facts, 0 Warnungen
    - `ledgerEntries`: 2817 historisch vorhanden
    - `transactions`: 2
    - `costEvents`: 2
    - `incomeEvents`: 96 historisch vorhanden
    - `sourceDocumentFacts`: 877 historisch vorhanden
    - `agentStatus/bitget_ledger`: `OK`
  - Ledger-/Fact-Dokumente werden historisch behalten und nicht geloescht,
    wenn sie aus dem Rolling-Fenster herausfallen
  - Teilabrufe mit Rate-Limit/Netzwerkfehler werden im Ledger-Agent jetzt als
    `WARNUNG` mit `warnings` gespeichert, nicht mehr still als OK

### Capital.com

- API-Anbindung ist vorbereitet.
- Capital.com bietet laut Plattform nur `Read & Trade`, keinen echten
  Read-only-Key; der Agent nutzt trotzdem nur lesende API-Endpunkte:
  `POST /session`, `GET /session`, `GET /accounts`, `GET /positions`.
- Letzter gueltiger Firestore-Stand 2026-06-27 02:04:
  - Live-Konto, EUR, `0,00 EUR`, 0 offene Positionen
  - `sourceSummaries/capitalcom.currentValue=0`
  - keine `sourcePositions` fuer Capital.com
- Erweiterung 2026-06-27:
  - `capitalcom-client.mjs` liest neben Konten und offenen Positionen auch
    Working Orders sowie `history/transactions` und `history/activity`.
  - `import-capitalcom-local.mjs` schreibt bei gueltigem Key:
    - `sourceSummaries/capitalcom`
    - `sourcePositions/capitalcom_*`
    - `ledgerEntries/capitalcom_*`
    - `sourceDocumentFacts/capitalcom_*`
    - `costEvents/capitalcom_*`
    - `incomeEvents/capitalcom_*`
    - `rawDocuments/api_capitalcom_latest`
  - History laeuft ab dem Schnitt 2026-06-27 inkrementell neu:
    - Capital.com wird bewusst bei aktuellem Stand `0,00 EUR` neu begonnen;
      historische Transaktionen vor dem Schnitt, z. B. Maerz 2026, werden
      nicht mehr als Backfill-Ziel behandelt.
    - Standard-Initialfenster `CAPITALCOM_HISTORY_DAYS=1`
    - danach letztes `lastHistorySyncEndAt` ohne Overlap
      (`CAPITALCOM_HISTORY_OVERLAP_DAYS=0`)
    - Force-Lauf per `--backfill`, `--full` oder
      `CAPITALCOM_FORCE_HISTORY_BACKFILL=true`
  - API-Ausfaelle loeschen keine gueltigen Positions-/Summary-Daten.
- Pruefung 2026-06-27 10:42:
  - `npm --prefix automation run check:capitalcom` meldet
    `401 error.invalid.api.key`
  - `agentStatus/capitalcom` wird jetzt als `WARNUNG` geschrieben, ohne den
    letzten gueltigen Summary-Stand zu loeschen
  - `import-capitalcom-local.mjs` faengt API-Ausfaelle ab und schreibt
    `lastAttemptAt`, `lastErrorAt`, `errorStatus` und `errorRequestPath`
- Naechster Schritt vor aktiver Nutzung:
  - neuen Capital.com API-Key erzeugen
  - `npm --prefix automation run setup:capitalcom`
  - `npm --prefix automation run check:capitalcom`
  - erst danach `npm --prefix automation run install:capitalcom-agent`, falls
    Capital.com dauerhaft aktiv ueberwacht werden soll
- CFD-Positionen werden angezeigt, aber nicht zur Vermoegenssumme addiert.
- Kontowert kommt aus `GET /accounts`.

## Aktueller Firestore-/Health-Stand

- Capital.com: `OK`, `0,00 EUR`, 0 Positionen
- VBV: `OK`, `1.815,86 EUR`, Stichtag `2026-05-31`
- Bitget: 6 Positionen, sichtbare inkludierte Positionssumme `3.807,42 EUR`
- Ginmon: 3 Depots, 26 Positionen, `9.380,62 EUR`
- Firestore Health: `OK`, 0 Fehler, 0 Warnungen
- Flatex-Dokumente: `OK`, 283 Dokumente, 401 Fakten, 0 unbekannte Dokumente
- `sourceAccounts` ist die zentrale Registry fuer erkannte Konten/Depots:
  - `flatex_default`
  - `traderepublic_Broker`
  - `ginmon_003397078001` / `Investment`
  - `ginmon_003429071008` / `Ginmon Top Zinsen`
  - `ginmon_003429072006` / `Risikoklasse 10 Global`
  - `intergold_default`
  - `bitget_spot`
  - `bitget_earn`
  - `capitalcom_130822818345538898`
  - `vbv_default`

## Wichtige lokale Pfade

- Projekt:
  - `/Users/niklaskofler/Documents/finanztool` auf Mac Studio und MacBook Pro
- Automation:
  - `automation/`
- Drive Originale:
  - `/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/01_Originale`
- Drive Archiv:
  - `/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/02_Archiviert`
- Service Account lokal:
  - `secrets/firebase-service-account.json`

## Lokale Dateien, die nicht in Git sind

- `app/.env.local`
- `automation/.env`
- `secrets/firebase-service-account.json`

Diese Dateien muessen pro Geraet lokal vorhanden sein.

## Wichtige Dokumente im Repo

- [Geraetewechsel und Codex-Workflow](/Users/niklaskofler/Documents/finanztool/docs/device_workflow.md)
- [Geraetewechsel-Protokoll](/Users/niklaskofler/Documents/finanztool/docs/device_switch_log.md)
- [Import Masterplan](/Users/niklaskofler/Documents/finanztool/docs/import_masterplan.md)
- [Datenbasis-Cleanup-Plan 2026-06-27](/Users/niklaskofler/Documents/finanztool/docs/data_basis_cleanup_plan_2026-06-27.md)
- [Arbeitsstand](/Users/niklaskofler/Documents/finanztool/docs/arbeitsstand_2026-05-25.md)
- [Mac Studio Runbook](/Users/niklaskofler/Documents/finanztool/docs/export_import_runbook_mac_studio.md)
- [Mac Studio Handoff 2026-06-13](/Users/niklaskofler/Documents/finanztool/docs/mac_studio_handoff_2026-06-13.md)
- [README](/Users/niklaskofler/Documents/finanztool/README.md)
- [Intergold Kurzfassung](/Users/niklaskofler/Documents/finanztool/docs/intergold_preisimport_kurzfassung.md)
- [Trade Republic Strategie](/Users/niklaskofler/Documents/finanztool/docs/traderepublic_import_strategie.md)
- [Ginmon Konzept](/Users/niklaskofler/Documents/finanztool/docs/ginmon_import_konzept.md)

## Wichtige Befehle

```bash
nvm install
nvm use
npm run install:all
npm run ft:install
ftd
fts "Commit Message"
ftp "Commit Message"
npm run dev
firebase deploy --only hosting,firestore:rules

cd automation
npm run secrets:export
npm run secrets:import
npm run secrets:list
npm run install:all-agents
npm run sync:health
```

## Offene Punkte

1. Secrets verschluesselt vom MacBook auf den Mac Studio uebertragen
2. Mac-Studio-Agents mit `npm run install:all-agents` installieren
3. Kreditkarten-Umsaetze/Abrechnungen fuer Amazon Visa und TF Bank ergaenzen;
   George Visa bleibt pausiert, bis ein Portal-/PDF-/CSV-Weg verfuegbar ist
4. Trading 212 API-Key/Secret erzeugen und lokal speichern; Agent ist
   vorbereitet, aber ohne Secrets noch nicht installiert
5. Einheitliches Konto-/Depotmodell in Firestore ergaenzen, damit Broker,
   Bankkonten, Cash-Konten, Kreditkarten und Vorsorge sauber getrennt sind
6. Flatex nach einigen automatischen Exportlaeufen gegen Broker pruefen
7. Ginmon-Kostenlogik vertiefen: fuer die zwei kleinen Ginmon-Depots fehlen
   positionsgenaue Einstandswerte; Konto-Performance kommt aber aus der
   Ginmon-API
8. EquatePlus-Dokumentparser nur ergaenzen, wenn echte EquatePlus-Dokumente
   relevante Mehrdaten liefern
9. UI weiter ausbauen: Filter, Sortierung, Konto-/Depotansichten,
    Detailansichten, Charts

## Aktueller lokaler Entwicklungsstand

- Stand: 2026-06-13 11:55 CEST
- Aktive Entwicklungsregel: nicht pushen/deployen waehrend der lokalen
  UI-Entwicklung, sondern erst am Ende
- Lokaler Server: `localhost:5173` laeuft ueber LaunchAgent
  `com.niklas.finanztool.app` und serviert `app/dist`
- Lokaler Build wurde ausgefuehrt; Browser ggf. mit `Cmd + Shift + R` hart neu laden
- GUI-Entscheidung:
  - `Stichtag` ist in der Uebersicht nicht hilfreich und wurde aus den
    Quellkarten entfernt
  - `Import`, `Automatisierbar` und `Import bereit` sind fuer die GUI aktuell
    nicht hilfreich und wurden entfernt
  - Quellkarten zeigen stattdessen Agentstatus, `Aktualisiert` bzw. bei Fehler
    `Letzter Erfolg`, Statusmeldung und Positionsanzahl
  - Bei jeder Einzelposition soll sichtbar sein, wann sie zuletzt aktualisiert
    wurde; dafuer zeigt die Positionstabelle `sourcePositions.updatedAt`
- Bitget-Entscheidung:
  - Wenn der Bitget-API-Lauf fehlschlaegt, muss der Fehler in
    `agentStatus/bitget` und `systemHealth/current` sichtbar sein
  - Fehler `40009 sign signature error` wurde am 2026-06-13 lokal repariert
  - Ursache: `automation/.env` enthielt alte `BITGET_API_*`-Werte und hat damit
    die korrekten macOS-Schluesselbundwerte ueberschrieben
  - Fix: `BITGET_API_KEY`, `BITGET_API_SECRET` und `BITGET_API_PASSPHRASE`
    wurden aus `automation/.env` entfernt
  - Ein temporaeres Backup der alten `.env` wurde wegen Secret-Inhalt wieder
    geloescht
  - Bitget soll lokal aus dem macOS-Schluesselbund lesen, nicht aus `.env`
  - Nach dem Fix: `npm run check:bitget`, `npm run import:bitget:local` und
    `npm run sync:health` erfolgreich
  - Bei Bitget-Fehler soll die GUI nicht so wirken, als sei der Import
    erfolgreich gerade aktualisiert worden; daher `Letzter Erfolg`
  - Nachpruefung am 2026-06-20: API-Key funktioniert; alter Importfehler vom
    2026-06-16 war historisch und wird nicht mehr als aktueller Health-Fehler
    gemeldet
  - Bitget-Rohdaten werden als aktueller Snapshot in
    `rawDocuments/api_bitget_latest` ueberschrieben
  - Restpositionen wie TRUMP-Dust erhalten eine anteilige Kostenbasis statt
    den urspruenglichen Gesamteinstand der vormaligen Gesamtmenge
  - Bitget-App/Webansicht und Firestore koennen abweichen, wenn:
    - Bitget ein Asset als Bestand liefert, aber keinen Bitget-Ticker dafuer
      anbietet
    - die Bitget-Webansicht einzelne Spot-Dust-Assets ausblendet
    - `all-account-balance` und Spot-Ticker in unterschiedlichen Sekunden
      bewertet werden
    - Bitget-Webansicht, Bitget `all-account-balance` und oeffentliche
      Bitget-Ticker unterschiedliche Bewertungswege sind; am 2026-06-20 ergab
      `all-account-balance` ca. `3.835,78 EUR`, BTC-Menge mal `BTCEUR` ca.
      `3.838,28 EUR`, waehrend die geladene Webansicht ca. `3.832,83 EUR`
      zeigte
  - Deshalb gilt fuer Bitget:
    - Kartenwert kommt aus `exchangeAccountValue`
    - Positionsliste zeigt alle API-Bestaende
    - unbewertbare Positionen erzeugen Health-Warnungen
    - groessere Differenzen zwischen Bitget-Kontowert und bewerteter
      Positionssumme erzeugen eine eigene Health-Warnung
- Ginmon-Agent-Fix am 2026-06-13:
  - Ursache: Der dokumentbasierte Ginmon-Abgleich hatte nur ein Depot sauber
    geschrieben, weil viele PDFs aus Google Drive mit `Unknown system error -11`
    nicht lesbar waren und bei archivierten Dateien die `customerId` fehlte
  - Fix: `sync-ginmon-current-api.mjs` erkennt `customerId` und Kontonummer
    jetzt aus allen vorhandenen Dateinamen und fragt die Ginmon-API fuer alle
    drei Depots ab
  - Automatischer Ginmon-LaunchAgent nutzt jetzt primaer den Live-Sync
    (`sync:ginmon-current` / API), nicht zuerst den alten Dokumentenstand
  - Verifizierter Stand: 3 Ginmon-Depots, 26 Live-Positionen,
    `9.380,62 EUR`, Bewertung per 2026-06-13
  - Korrektur: Der naechste Ginmon-Schritt ist nicht nur
    Einstandswert-Schaetzung, sondern zuerst die generische Dokumentfakten-
    Datenhaltung fuer alle Ginmon-Dokumente und alle drei Depots
  - Danach umgesetzt: `sourceDocuments` und `sourceDocumentFacts` wurden fuer
    369 Ginmon-Dateien befuellt; 663 Fakten wurden geschrieben
  - Danach umgesetzt: `sync-ginmon-current-api.mjs` schreibt
    `sourcePositions` fuer Ginmon aus Dokumentfakten plus aktuellem API-Wert.
    Die API wird nicht mehr fuer Stueckzahlen, Kosten oder Transaktionen
    verwendet.
  - Danach umgesetzt: Ginmon-Automation getrennt in stuendlichen headless
    API-Sync und taeglichen headless Dokumentimport um 02:00
- Trade-Republic-Agent-Fix am 2026-06-13:
  - Google-Drive-`mkdir`-Fehler `Unknown system error -11` wird beim Anlegen
    der Archivordner mit Retry abgefangen
  - Agent schreibt bei echten Fehlern `agentStatus/traderepublic_mail=FEHLER`
  - Verifiziert: 8 PDFs verarbeitet, 8 geparst, Private Equity hat in
    Firestore einen Einstandswert (`costValue 1.145,40 EUR`)
- VBV-Agent-Fix am 2026-06-13:
  - Login-Erkennung war zu breit und hat die Login-Seite wegen Marketingtext
    faelschlich als eingeloggten Zustand erkannt
  - Loginbutton-Erkennung wurde auf case-insensitiven DOM-Klick umgestellt
  - Agent schreibt bei echten Fehlern `agentStatus/vbv=FEHLER`
  - Verifiziert: `1.815,86 EUR` per 2026-05-31
- Kurs-Sync-Fix am 2026-06-13:
  - Boerse-Frankfurt-Sync darf Ginmon-Quote-Felder aktualisieren, aber nicht
    `currentValue`, `valuationMethod` oder `sourceSummaries/ginmon`
    ueberschreiben
  - Ginmon bleibt dadurch nach Kurs-Sync exakt auf dem API-Gesamtwert
    `9.380,62 EUR`
  - Wenn Ginmon fuer kleine Depots keine echte Stueckzahl liefert, berechnet
    der Kurs-Sync aus `currentValue / quotePriceEur` eine Naeherung und
    schreibt `quantityText` als `ca. ... Stk.` plus `quantityEstimated=true`
  - Verifiziert fuer `Risikoklasse 10 Global`: alle ETF-Positionen haben jetzt
    sichtbare geschaetzte Stueckzahlen; das Geldkonto bleibt `1 Konto`
- Depot-/Konto-Erkennungslogik am 2026-06-13:
  - `check-health-local.mjs` schreibt eine zentrale Firestore-Registry
    `sourceAccounts`
  - Neue Depots/Konten erzeugen nach bestehender Baseline eine Warnung
    `Neues Depot erkannt`
  - Bisher aktive, aber im aktuellen Lauf nicht mehr gefundene Depots/Konten
    werden als `MISSING` markiert und erzeugen `Depot nicht mehr gefunden`
  - Ginmon nutzt echte Kontonummern aus API/Dateinamen
  - Bitget wird in `spot` und `earn` getrennt
  - Trade Republic nutzt aktuell `Broker`; weitere Konten wie Private Markets
    muessen vom Agenten als eigenes `accountType`/`accountId` geliefert werden,
    sobald sie als eigenes Depot modelliert werden sollen
  - Quellen ohne Unterkonto-Information bekommen ein `default`-Depot; damit
    erkennt Health zumindest das komplette Verschwinden der Quelle, aber keine
    nicht extrahierten Unterdepots
- Agent-Audit am 2026-06-13:
  - `launchctl` nach Kickstart: Ginmon, Trade-Republic-Mail und VBV Exitcode 0
  - Firestore `agentStatus`: Bitget, Capital.com, Flatex, Ginmon, Intergold,
    Quotes, Trade-Republic-Mail und VBV alle `OK`
  - `systemHealth/current`: `OK`, `0` Fehler, `0` Warnungen
- Ginmon-Depotkarte am 2026-06-13:
  - Die App zeigt in der Ginmon-Quelle jetzt die Unterdepots aus
    `sourceSummaries/ginmon.accounts` an
  - Pro Unterdepot sichtbar: Name, Wert, Barwert, Gewinn/Verlust absolut und
    Prozent
  - Darstellung ist bewusst kompakt als Zeilenliste statt als grosse
    Zusatzkarten
  - Die Ginmon-Gesamtkarte zeigt zusaetzlich Einstand und G/V gesamt, sofern
    `costValue`, `performanceValue` und `performancePct` vorhanden sind
  - Verifizierter Firestore-Stand:
    - Investment: `9.146,61 EUR`, G/V `2.468,26 EUR`
    - Ginmon Top Zinsen: `104,23 EUR`, G/V `3,53 EUR`
    - Risikoklasse 10 Global: `129,79 EUR`, G/V `30,50 EUR`
    - Ginmon gesamt: `9.380,62 EUR`, Einstand `6.878,34 EUR`,
      G/V `2.502,28 EUR`
  - Der lokale Browser ohne Firestore-Login zeigt nur Seed-Daten; nach Login
    oder Reload im bereits angemeldeten Browser liest die App die Unterdepots
    aus Firestore
- Ginmon-Datenhaltungsaudit am 2026-06-13 14:34 CEST:
  - Aktuell in Firestore:
    - `sourceDocuments`: 369 Ginmon-Dokumente
    - `sourceDocumentFacts`: 663 strukturierte Ginmon-Fakten
    - `sourcePositions`: 26 aktuelle Ginmon-App-Positionen
    - `costEvents`: 3 Ginmon-Kostenereignisse
  - Dokumente nach Parserstatus:
    - `PARSED`: 351
    - `UNKNOWN`: 18
  - Fakten nach Typ:
    - `position_snapshot`: 250
    - `trade`: 95
    - `invoice`: 88
    - `account_statement`: 77
    - `cash_ledger_entry`: 62
    - `earning`: 34
    - `quarterly_report`: 30
    - `account_snapshot`: 27
  - Schlussfolgerung:
    - Alle aktuell per Ginmon-Portal sichtbaren Dokumente sind lokal vorhanden
      und in Firestore registriert
    - Der strukturierte Dokumentfaktenlayer ist produktiv befuellt
    - Noch nicht garantiert ist "alle Ginmon-Daten absolut vollstaendig",
      weil 18 Dokumente noch `UNKNOWN` sind und der vollstaendige
      Ginmon-API-Rohpayload noch nicht als eigener unveraenderter Snapshot in
      Firestore persistiert wird
    - Fuer revisionssichere Vollstaendigkeit fehlt deshalb noch eine Collection
      wie `sourceApiSnapshots/ginmon_*` bzw. ein Raw-Payload-Feld je API-Lauf
- Ginmon-Fachparser-Erweiterung am 2026-06-13 14:58 CEST:
  - `CORPORATE_ACTION` wird jetzt als `corporate_action` klassifiziert und
    geparst
  - `ANNUAL_STATEMENT`/Jahresdepotauszug wird jetzt als `annual_statement`
    klassifiziert und geparst
  - Firestore wurde mit `node automation/src/reconcile-ginmon-local.mjs
    --write-documents-only --pdf-timeout-ms=30000` aktualisiert
  - Neuer verifizierter Firestore-Stand:
    - `sourceDocuments`: 369 Ginmon-Dokumente
    - `PARSED`: 363
    - `UNKNOWN`: 6
    - `sourceDocumentFacts`: 698 Ginmon-Fakten
  - Neue Faktentypen:
    - `corporate_action`: 9
    - `annual_statement`: 3
    - `annual_position_snapshot`: 23
  - Beispiel verifiziert:
    - Corporate Action `IE00B95PGT31`, Bestand `7,0319`, Typ `fee_change`,
      Wirksamkeit `2025-10-07`
    - Annual Statement Depot `3397078001`, Stichtag `2025-12-31`,
      `13/13` Positionen geparst
  - Verbleibende 6 `UNKNOWN` sind nicht performance-/positionsrelevant:
    Welcome Letter, VL-Formular, Upvest-Datenschutz, Einlagensicherung
  - Health nach Update: `OK`, `0` Fehler, `0` Warnungen
- Ginmon-Unknown-Warnung am 2026-06-13 15:00 CEST:
  - `automation/src/check-health-local.mjs` laedt jetzt auch
    `sourceDocuments`
  - Falls kuenftig ein Ginmon-Dokument `documentType=unknown`,
    `parseStatus=UNKNOWN` oder `parseStatus=UNPARSED` hat und nicht zu den 6
    heute bekannten nicht-fachlichen Info-/Vertragsdokumenten gehoert, erzeugt
    `systemHealth/current` eine Warnung:
    `Ginmon-Dokument nicht klassifiziert`
  - Die Warnung enthaelt bis zu 10 betroffene Dokumente mit `id`, `fileName`,
    `documentType`, `parseStatus` und `customerId`
  - Verifiziert: aktuelle 6 bekannte Info-Dokumente sind erlaubt, Health bleibt
    `OK`, `0` Fehler, `0` Warnungen
- Flatex-Dokumentfakten am 2026-06-13 15:41 CEST:
  - `automation/src/flatex-document-parser.mjs` klassifiziert und parst die
    Flatex-PDFs aus Konto-/Depotbelegen und Postfach
  - `automation/src/reconcile-flatex-documents-local.mjs` schreibt die
    generischen Fakten nach Firestore
  - Sync ausgefuehrt mit:
    `npm run sync:flatex-documents -- --pdf-timeout-ms=30000`
  - Verifizierter Firestore-Stand:
    - `sourceDocuments`: 283 Flatex-Dokumente
    - `PARSED`: 283
    - `UNKNOWN`: 0
    - `sourceDocumentFacts`: 401 Flatex-Fakten
    - `agentStatus/flatex_documents`: `OK`
  - Typen/Fakten umfassen Wertpapierabrechnungen, Fondskaeufe,
    Dividenden/Ausschuettungen, Thesaurierungen, Kontoauszuege,
    Depotauszuege, Steuerbescheinigungen, Kapitalmassnahmen, Order-/Saldo-/
    Info-/SEPA-/CFD-/Kosten-Dokumente und ein fehlabgelegtes externes PDF
  - Neue unbekannte Flatex-Dokumente erzeugen ab jetzt eine Health-Warnung
    `Flatex-Dokument nicht klassifiziert`
  - `npm run sync:health` danach: `OK`, `0` Fehler, `0` Warnungen
- Flatex-Kursquelle am 2026-06-13:
  - Aktueller Kurs-Sync nutzt weiterhin den lokalen Boerse-Frankfurt/
    Deutsche-Boerse-Live-Provider in
    `automation/src/quote-provider-boerse-frankfurt.mjs`
  - Dry-Run mit 5 Instrumenten erfolgreich:
    `npm run reconcile:quotes -- --max-instruments=5 --delay-ms=50`
  - Ergebnis: 5/5 Kurse OK, keine Mapping-Warnung im Testlauf
  - Die Quelle ist technisch ein oeffentlicher Website-Endpunkt von
    `api.live.deutsche-boerse.com`; offizieller/API-Key-Fallback bleibt
    fachlich zu pruefen, falls die Website-API sich aendert
- Trade-Republic-Baseline am 2026-06-13 16:01 CEST:
  - Neue Basisdateien aus `/Users/niklaskofler/Downloads` verarbeitet:
    - `Account statement.pdf`
    - `Tax Report 2025.pdf`
    - `Transaction export.csv`
  - Dateien wurden nach
    `01_Originale/TradeRepublic/Baseline/2026-06-13/` archiviert
  - Firestore wurde als neuer Status-Quo neu aufgebaut:
    - alte `sourcePositions`, `transactions`, `ledgerEntries`,
      `costEvents` fuer Trade Republic geloescht und aus der Baseline neu
      geschrieben
    - alte Trade-Republic-`imports` und `rawDocuments` als `OBSOLETE`
      markiert
    - `agentStatus/traderepublic_mail.reconciliationCutoffDate` auf
      `2026-06-13` gesetzt
  - Neue Dokument-/Faktenbasis:
    - `sourceDocuments`: 3
    - `sourceDocumentFacts`: 198
    - Faktentypen: 106 `trade`, 51 `cash`, 19 `private_market_cash`,
      9 `interest`, 3 `bonus`, 2 `dividend`, 1 `corporate_action`,
      5 `position_snapshot`, 1 `cash_account_statement`, 1 `tax_report`
  - Positionsstand nach Kurs-Sync:
    - Trade Republic netto: `2.523,87 EUR`
    - Depotwert: `2.374,38 EUR`
    - Cash: `149,49 EUR`
    - Positionen: 5 Wertpapiere + Cash
  - Private Equity bleibt `MAPPING_REQUIRED`, wird aber bewusst ueber
    Dokument/Baseline bewertet und erzeugt keine Health-Warnung
  - Netflix-Split vom 2025-11-17 wird eingerechnet; Stueckzahl jetzt `0,094`
  - Neue unbekannte Trade-Republic-Dokumente erzeugen ab jetzt eine
    Health-Warnung `Trade-Republic-Dokument nicht klassifiziert`
  - `npm run sync:health` danach: `OK`, `0` Fehler, `0` Warnungen
- Trade-Republic-PDF-Textpfad am 2026-06-13:
  - `automation/src/pdf-text.mjs` wurde erweitert:
    - bevorzugt `pdftotext -layout`
    - bei fehlendem/fehlerhaftem `pdftotext` Fallback auf `pdfjs-dist`
  - Test mit `Account statement.pdf` und `Tax Report 2025.pdf` erfolgreich:
    - Account Statement: 30.059 Zeichen extrahiert
    - Tax Report 2025: 13.284 Zeichen extrahiert
  - Fuer verschluesselte Trade-Republic-Duplicate-PDFs bleibt `qpdf`
    erforderlich; fuer den Zielrechner installieren/pruefen:
    `command -v qpdf`, `command -v pdftotext`
- GUI-Privacy-Schalter am 2026-06-13:
  - Oben rechts gibt es jetzt einen Schieberegler `Sichtbar`/`Privat`
  - Standardzustand beim Laden der App ist `Privat`
  - Im Privatmodus werden sensible Werte, Einstandswerte, Gewinne/Verluste
    und absolute Tagesaenderungen in der GUI durch Eurozeichen `€€€€`
    maskiert
  - Prozentwerte bleiben auch im Privatmodus sichtbar, weil sie fuer die
    Analyse nuetzlich sind; positive Werte bleiben gruen, negative rot
  - `Erfasster Wert` zeigt zusaetzlich:
    - Gesamtgewinn/-verlust absolut
    - Gesamtgewinn/-verlust in Prozent
    - Tagesaenderung absolut
    - Tagesaenderung in Prozent
  - Die Positionstabelle hat zusaetzlich Spalten `Heute` und `Heute %`
  - Tagesaenderung wird nur angezeigt, wenn entsprechende
    `sourcePositions`-Felder vorhanden sind; sonst bleibt sie `—`
  - Lokaler Build nach Aenderung erfolgreich:
    `npm --prefix app run build`
- GUI-Depotlayout am 2026-06-13:
  - Die separate globale Positionstabelle wurde entfernt
  - Positionen liegen jetzt direkt unter den jeweiligen Depot-/Quellenkarten
    und koennen dort ausgeklappt werden
  - Ginmon ist zweistufig: Ginmon-Karte -> Ginmon-Unterdepot -> Positionen
  - Die gesamte Ginmon-Unterdepotliste ist zusaetzlich einklappbar und
    standardmaessig geschlossen
  - In den Depotkarten heisst der Hauptwert immer `Depotwert`
  - Das zuvor separate zweite Feld `Depotwert` wurde entfernt
  - `Kontostand` heisst in den Karten jetzt `Cash`
  - Alle Depotkarten nutzen innen dieselbe Hauptmetrik-Reihenfolge:
    erste Zeile `Depotwert`, `Cash`, `Einstand`, `Aktualisiert`;
    zweite Zeile `G/V`, `Heute`, `Positionen`
  - Quell-spezifische Zusatzwerte stehen darunter in einer separaten
    Zusatzmetrik-Zeile, damit das Hauptlayout identisch bleibt
  - G/V-Werte werden immer mit Vorzeichen angezeigt (`+`, `-`, `±`)
  - Nur G/V-Werte bekommen die positive/negative Farblogik gruen/rot; normale
    Bestandswerte bleiben neutral
  - CSS-Regel: Tabellen- und Karten-Basisfarben duerfen G/V-Farben nicht
    ueberschreiben; `performance-cell` und `performance-value` haben dafuer
    spezifische positive/negative Regeln
  - Mengen werden in der GUI auf maximal 5 Nachkommastellen gerundet; die
    Rohwerte in Firestore bleiben unveraendert
  - Die Depotkarten zeigen zusaetzlich die Veraenderung zum Vortag (`Heute`),
    wenn `sourcePositions` Tagesaenderungen liefern
- Preis-Historie, Stand aktualisiert am 2026-06-21:
  - `automation/src/sync-quotes-local.mjs` schreibt `priceHistory` nur noch
    im History-Modus `--write-history`; normale Kurslaeufe aktualisieren
    `quotesCurrent`, `sourcePositions` und `sourceSummaries`
  - Dokument-ID: `instrumentId_YYYY-MM-DD`, dadurch pro Instrument und Tag
    idempotent und nicht doppelt
  - Gespeichert werden u.a. `instrumentId`, `isin`, `price`, `currency`,
    `priceEur`, `provider`, `providerSymbol`, `asOf`, `historyDate`,
    `positionIds` und `sources`
  - Der LaunchAgent `com.niklas.finanztool.quote-sync` laeuft alle 5 Minuten
    fuer aktuelle Kurse; `com.niklas.finanztool.quote-history` laeuft
    taeglich `22:00` und schreibt Tageshistorie
- Manueller Refresh-Fix:
  - Ursache fuer die falsche GUI-Fehlermeldung:
    `run-quote-sync-local.mjs` hat `check-health-local.mjs` ausgefuehrt,
    waehrend `agentStatus/quotes` noch `RUNNING` war; Health hat daraus
    faelschlich `Agent quotes: RUNNING` als Fehler erzeugt
  - Fix: Quote-Agent setzt nach erfolgreichem Kurslauf zuerst
    `agentStatus/quotes=OK` und ruft danach Health auf
  - App-Button `Alles aktualisieren` beobachtet aus Rule-Kompatibilitaet weiter
    `automationCommands/sync_quotes_manual` und unterscheidet `REQUESTED`,
    `RUNNING`, `DONE` und `ERROR`
  - `automationCommands/sync_quotes_manual.type` bleibt `sync_quotes`
  - Der Command-Runner interpretiert `sync_quotes` ab 2026-06-21 als
    Full-Refresh, nicht mehr als reinen Kurslauf
  - Command-Runner startet dafuer `automation/src/run-full-refresh-local.mjs`
  - Full-Refresh fuehrt aktuell nacheinander aus:
    Bitget Snapshot, Bitget Ledger, Flatex Umsatzexport + Broker-Snapshot,
    Trade-Republic-Mail-Agent, Ginmon API, Ginmon Dokumente, Intergold, VBV,
    Kurse/Positionshistorie, Health
  - Nach `DONE` laedt die App `sourceSummaries`, `agentStatus`,
    `sourcePositions` und `systemHealth` neu und setzt den Button zurueck
  - Verifiziert: `npm --prefix automation run sync:quotes:local` schreibt
    19/20 Kurse, `LU3176111881` bleibt erwartungsgemaess
    `MAPPING_REQUIRED`, Health danach `OK`, `0` Fehler, `0` Warnungen
- Noch nicht gepusht/deployed seit dieser lokalen UI-Aenderung:
  - `app/src/App.css`
  - `app/src/App.tsx`
  - `app/src/domain/types.ts`
  - `app/src/firebase/sourceSummaries.ts`
  - `automation/package.json`
  - `automation/launchd/com.niklas.finanztool.ginmon-sync.plist.template`
  - `automation/src/check-health-local.mjs`
  - `automation/src/pdf-text.mjs`
  - `automation/src/flatex-document-parser.mjs`
  - `automation/src/reconcile-flatex-documents-local.mjs`
  - `automation/src/reconcile-traderepublic-baseline-local.mjs`
  - `automation/src/ginmon-browser.mjs`
  - `automation/launchd/com.niklas.finanztool.ginmon-documents.plist.template`
  - `automation/src/download-ginmon-local.mjs`
  - `automation/src/ginmon-parser.mjs`
  - `automation/src/reconcile-ginmon-local.mjs`
  - `automation/src/sync-ginmon-current-api.mjs`
  - `automation/src/sync-quotes-local.mjs`
  - `automation/src/run-quote-sync-local.mjs`
  - `automation/src/install-quote-sync-agent.sh`
  - `automation/src/sync-vbv-local.mjs`
  - `automation/src/trade-republic-mail-agent.mjs`
  - `automation/src/vbv-browser.mjs`
  - `docs/working_memory.md`
  - `docs/flatex_export_pruefung_2026-05-24.md`
  - `docs/kursdaten_api_plan.md`
  - `docs/traderepublic_import_strategie.md`
  - `docs/ginmon_import_konzept.md`

## Naechster empfohlener Schritt

Auf dem aktuellen Entwicklungsgeraet `ftd` ausfuehren und den neuesten Eintrag
aus `docs/device_switch_log.md` beachten. Auf dem MacBook Pro keine
produktiven Studio-Agents starten. Bei Rueckgabe an den Mac Studio `ftp`
ausfuehren; danach auf dem Mac Studio `ftd`, Agent-Installation/Health und
`launchctl list | grep finanztool` pruefen.

## Bedienkuerzel

- Es gelten die Kurzbefehle `ftd`, `fts` und `ftp`; `ftu` bleibt als alter
  Alias fuer `ftp` verfuegbar.
- `ftd`: Projekt auf der aktuellen Maschine vom gemeinsamen GitHub-Stand
  aktualisieren/herunterladen.
  Ablauf:
  1. Zuerst `docs/device_workflow.md`, `docs/device_switch_log.md`,
     `docs/working_memory.md` und `README.md` lesen.
  2. Dann `git status` pruefen.
  3. Falls lokale Aenderungen vorhanden sind, nicht ueberschreiben; zuerst
     `fts` ausfuehren oder den Nutzer kurz auf den Konflikt hinweisen.
  4. `git fetch origin` und `git pull --ff-only origin main`.
  5. Dependencies aktualisieren:
     `npm --prefix app install` und `npm --prefix automation install`.
  6. `npm --prefix app run build` ausfuehren.
  7. Auf dem Mac Studio zusaetzlich Automation/Agents beachten, weil dort die
     produktiven Agents laufen: bei geaenderten LaunchAgent-Templates oder
     Agent-Scripts `npm --prefix automation run install:all-agents` bzw. die
     betroffenen Agenten neu installieren/starten und danach
     `npm --prefix automation run sync:health` pruefen.
  8. Auf dem MacBook Pro keine Studio-Agents starten; dort nur Code/App bauen
     und weiterentwickeln.
  9. Danach im Chat kurz zusammenfassen: aktives Geraet, Commit/Stand, letzter
     Stand vom alten Geraet, naechste Schritte und eventuelle
     Wechselprobleme.
- `fts`: Projekt lokal speichern, ohne GitHub-Push und ohne Firebase-Deploy.
  Ablauf:
  1. Relevante Checks ausfuehren, mindestens `npm --prefix app run build`.
  2. `git status` und `git diff --stat` pruefen.
  3. Sinnvolle Aenderungen committen.
  4. Nicht pushen und nicht deployen.
- `ftp`: aktuellen Stand bauen, lokal speichern/committen, auf GitHub pushen
  und nach Firebase deployen.
  Danach ist das Projekt an das jeweils andere Geraet uebergeben. Beispiel:
  auf Mac Studio entwickeln -> `ftp` -> auf MacBook Pro `ftd`; oder
  auf MacBook Pro entwickeln -> `ftp` -> auf Mac Studio `ftd`, damit die
  dort laufenden Agents den neuen Code erhalten.
  Vor dem Commit muss Codex `docs/working_memory.md` und bei Geraetewechseln
  `docs/device_switch_log.md` aktualisieren.

## Letzte Aktualisierung

- Datum: 2026-06-21 CEST
- Quelle: Lokale Codex-Session, Agent-Audit, Flatex-/Kursstrategie und UI-Arbeit auf `localhost`
- Uebergabestand: Lokaler Savepoint `7808ec6` wurde mit `fts`
  gespeichert; anschliessend wurde der damalige Upload-Befehl `ftu` gestartet,
  um diesen Stand an
  GitHub/Firebase und danach ans MacBook Pro zu uebergeben.
- Zusatzstand 2026-06-21: Kursstrategie fuer Wertpapiere umgestellt auf
  haeufige aktuelle Kurse und sparsame Tageshistorie. `quotesCurrent` wird
  durch `com.niklas.finanztool.quote-sync` alle 5 Minuten aktualisiert und
  ueberschrieben. `priceHistory` und die generische Positionshistorie werden
  nur durch `com.niklas.finanztool.quote-history` taeglich um 22:00
  `Europe/Vienna` geschrieben. Der Quote-Sync speichert jetzt `quoteVenue`,
  `quoteAsOf`, `quoteFetchedAt`, `quoteAgeMinutes` und `quoteFreshness`; die
  GUI zeigt fuer Positionen und Depotkarten bevorzugt den echten Kursstand
  statt nur den Firestore-Schreibzeitpunkt. Wenn eine Position einen
  Handelsplatz mitliefert, versucht der Boerse-Frankfurt-Provider diesen MIC
  zuerst und faellt erst danach auf Provider-Standard/Xetra/Frankfurt zurueck.
- Status: Geraetewechsel-Regeln und Kurzbefehle liegen zentral in
  `docs/device_workflow.md`; Standardpfad auf Mac Studio und MacBook Pro ist
  `/Users/niklaskofler/Documents/finanztool`; Nicht pushen/deployen waehrend
  Entwicklung; Agenten lokal geprueft
  und repariert; Ginmon-Live-Stand hat 3 Depots/26 Positionen; Health ist
  `OK`; `sourceAccounts` erkennt neue oder verschwundene Depots/Konten;
  Ginmon-Datenvertrag ergaenzt; alle aktuell per Portal-API sichtbaren
  Ginmon-Dokumente sind lokal vorhanden; `sourceDocuments`/
  `sourceDocumentFacts` sind fuer Ginmon produktiv befuellt; Ginmon-API wird
  nur noch fuer aktuelle Werte/Kurse genutzt; Ginmon-Dokumentimport laeuft
  taeglich 02:00 und Ginmon-API-Sync stuendlich, beide headless; Ginmon-Karte
  zeigt Unterdepots kompakt mit Wert, Barwert, G/V absolut und Prozent; die
  Ginmon-Dokumentbasis ist fachlich weitgehend strukturiert; nur noch 6
  nicht performance-/positionsrelevante Info-/Vertragsdokumente sind UNKNOWN;
  neue unbekannte Ginmon-Dokumente erzeugen ab jetzt eine Health-Warnung;
  Flatex-Postfach/PDFs sind mit 283/283 Dokumenten und 401 Fakten in
  Firestore strukturiert; neue unbekannte Flatex-Dokumente erzeugen ab jetzt
  eine Health-Warnung; Boerse-Frankfurt/Deutsche-Boerse-Live-Kurse wurden per
  Dry-Run fuer 5 Flatex/Trade-Republic-Instrumente erfolgreich getestet;
  Trade Republic wurde mit frischem Export vom 2026-06-13 als neuer
  Status-Quo neu aufgebaut; alte TR-Mail-/Raw-Imports sind obsolet, der
  Mail-Agent verarbeitet nur noch neue Abrechnungen nach 2026-06-13; PDF-Text
  nutzt kuenftig bevorzugt `pdftotext` mit `pdfjs`-Fallback, fuer
  verschluesselte Duplicate-PDFs ist `qpdf` weiterhin Pflicht; fuer
  revisionssichere API-Vollstaendigkeit fehlen weiterhin API-Raw-Snapshots;
  der GUI-Privatmodus maskiert absolute Geldwerte mit `€€€€`, laesst
  Prozentwerte sichtbar und faerbt Plus/Minus weiterhin gruen/rot; Positionen
  liegen jetzt aufklappbar unter den Depotkarten, bei Ginmon unter den
  jeweiligen Unterdepots; die Ginmon-Unterdepotliste ist selbst einklappbar;
  Karten-Hauptwert heisst jetzt `Depotwert`, das separate Depotwert-Feld ist
  entfernt und `Kontostand` heisst `Cash`;
  `priceHistory` speichert taegliche Kurse pro Instrument, der geplante
  Kurs-Historienlauf ist `22:00`; manueller Kurs-Sync setzt `quotes=OK` vor
  Health und der App-Button verfolgt den Command-Status bis `DONE`/`ERROR`;
  Mengen werden in der GUI auf maximal 5 Nachkommastellen gerundet; G/V-Text
  wird in Karten und Tabellen verlaesslich gruen/rot eingefaerbt;
  Privatsphaere-Modus ist beim Laden der App standardmaessig aus, Werte sind
  also standardmaessig sichtbar
  und alle Depotkarten haben dieselbe innere Hauptmetrik-Reihenfolge mit
  `G/V` unter `Depotwert`, `Heute` daneben und `Aktualisiert` oben rechts;
  Ginmon-Unterdepots bleiben beim Laden standardmaessig eingeklappt; die
  App ist fuer iPhone-15-Breite responsiv verdichtet: Summary-Karten laufen
  zweispaltig, Depotkarten blenden lange Beschreibungstexte aus, nutzen
  drei kompakte Metrikspalten ueber die volle Kartenbreite, sodass
  `Depotwert` links unter dem Quell-Icon beginnt, und behalten die Reihenfolge
  `Depotwert`/`Cash`/`Aktualisiert` oben sowie `G/V`/`Heute`/`Einstand`
  darunter; in der mobilen Kopfzeile ist der Firestore-Status fest in Zeile 2
  und `Kurse aktualisieren` plus Privat-Schalter sind fest nebeneinander in
  Zeile 3 positioniert; die Positionstabelle priorisiert jetzt
  Analysewerte in der Spaltenreihenfolge `Position`, `Wert`, `G/V`, `Perf.`,
  `Heute`, `Heute %`, `Menge`, `Kurs`, `Einstand`, `Kategorie`,
  `Aktualisiert`; die separate Kartenmetrik `Positionen` ist entfernt,
  weil die Anzahl bereits im aufklappbaren `Positionen anzeigen`-Element
  steht; `Heute` und `Heute %` wurden repariert: der Quote-Sync schreibt
  fuer Flatex/Trade-Republic-Positionen jetzt `previousCloseValue`,
  `dayChangeValue` und `dayChangePct` aus dem letzten gespeicherten
  `priceHistory`-Preis vor dem aktuellen Tag; die Positions-Tabelle zeigt
  Tagesaenderung und Tagesprozent mit Vorzeichen; der 22:00-Lauf schreibt
  zusaetzlich eine generische Positions-Historie fuer alle `sourcePositions`
  mit `currentValue`, also auch Bitget/Krypto, Ginmon, Intergold usw.; Bitget
  Summary-G/V wird aus EUR-Kosten und aus USDT-Kostenbasis via aktuellem
  USDT/EUR-Faktor aggregiert; am 2026-06-14 wurden 6/6 Bitget-Positionen in
  `priceHistory` geschrieben;
  verifiziert mit 393x852 Viewport ohne horizontalen Ueberlauf; Firebase
  Deploy fuer Hosting, Firestore Rules/Indexes und Storage Rules erfolgreich

## Trade Republic Mail-Agent Debug 2026-06-21

- Apple Mail zeigt eine Trade-Republic-Mail vom 17.06.2026 mit drei
  `Securities Settlement`-PDF-Anhaengen.
- Der Agent hatte bisher trotzdem `savedAttachmentCount: 0`, weil Apple Mail
  das Gmail-Postfach auf dem Mac Studio `Google` nennt, der Agent aber per
  Default nach `Niklas.kofler@gmail.com` als Account-Name gefiltert hat.
- Fix: `trade-republic-mail-agent.mjs` durchsucht ohne `TR_MAIL_ACCOUNT`
  jetzt alle Apple-Mail-Accounts. Optional kann `TR_MAIL_ACCOUNT` weiterhin
  gesetzt werden.
- Zusaetzlicher Fix: `sync-quotes-local.mjs` berechnet
  `sourceSummaries.costValue`, `performanceValue` und `performancePct` wieder
  aus den aktuellen Positionen und laesst `externalQuoteDifference` leer,
  wenn nicht alle Wertpapierpositionen eine externe Kursbewertung haben.
- UI-Regel bestaetigt: `Depotwert` in der Depotkarte zeigt den Gesamtwert der
  Quelle inklusive Cash; `Cash` bleibt als separate Kennzahl daneben sichtbar.
  Der interne `depotValue` bleibt fuer reine Wertpapierwerte und Abgleiche
  erhalten.
- Hintergrund: Trade Republic hatte nach der Baseline vom 13.06.2026
  Jun-16-Kaeufe in der Mail vom 17.06.2026, die durch den Account-Filter nicht
  angewendet wurden. Dadurch blieben Mengen/Einstand fuer Stoxx Europe Defense,
  Core S&P 500 und NASDAQ100 gegenueber dem Net-Worth-PDF vom 21.06.2026 zu
  niedrig.
- Verifizierter Firestore-Stand nach Write-Lauf:
  - `agentStatus/traderepublic_mail`: `OK`, 11 PDFs verarbeitet, 3 neue auf
    Positionen angewendet, 0 unparsebar
  - Mengen jetzt deckungsgleich mit `Net Worth.pdf` vom 21.06.2026:
    Stoxx `105,815346`, Core S&P 500 `0,309876`, NASDAQ100 `0,274471`,
    Netflix `0,094`, Private Equity `11,178226`
  - `sourceSummaries/traderepublic`: Netto `2.581,03 EUR`, Cash `149,49 EUR`,
    Einstand `2.306,41 EUR`, G/V `125,13 EUR`
  - Health nach Sync: `OK`, 0 Warnungen

## Depotkarten-Wertelogik 2026-06-21

- `Depotwert` in allen Depotkarten ist ab jetzt der Brutto-Depotwert der Quelle:
  positiver Cash wird mitgezaehlt. Bei Flatex wird ein negativer Cash-Wert als
  genutzter Kredit behandelt und wieder auf den Netto-Wert addiert, damit die
  Karte den vollen Wertpapier-Depotwert zeigt.
- `cashValue` bleibt als eigene Kennzahl `Cash` sichtbar und wird dadurch
  nicht doppelt gezaehlt, sondern nur transparent separat ausgewiesen.
- Flatex-Sonderregel in der Karte:
  - negativer Cash-Wert wird als `Kredit in Anspruch` positiv angezeigt
  - `Verfuegbares Guthaben` wird nicht mehr angezeigt
  - `Verfuegbar inkl. Kredit` bleibt sichtbar
  - verifizierter Stand: Depotwert-Karte `22.435,45 EUR`, Cash
    `-5.843,79 EUR`, Kredit in Anspruch `5.843,79 EUR`,
    Verfuegbar inkl. Kredit `373,81 EUR`

## Transparenz-Audit Regel und Reihenfolge 2026-06-21

- Neue verbindliche Regel im Datenvertrag:
  Primaerdatenstand, Dokumentstand, Kurs-/Preisstand und Agent-Laufzeit duerfen
  nicht mehr unter einem unklaren `Aktualisiert` vermischt werden.
- Fuer jede bestehende und neue Quelle muessen, soweit relevant, sichtbar sein:
  - Broker-/API-/Datenstand fuer Bestand, Cash, Kredit, Einstand und
    Unterkonten
  - Dokumentstand fuer exportierte/importierte/geparste Dokumente
  - Kurs-/Preisstand inklusive Provider
  - Agent zuletzt
  - letzte fachliche Daten- oder Preisaenderung, wenn Agentlaeufe haeufiger
    sind als echte Datenveraenderungen
- Eigener Arbeitsplan liegt in
  `docs/transparency_audit_plan_2026-06-21.md`.
- Reihenfolge der Aufarbeitung:
  1. VBV
  2. Capital.com
  3. Bitget
  4. Intergold
  5. Ginmon
  6. Trade Republic
  7. Flatex
- Vor jedem Depot muss Codex zuerst kurz erklaeren:
  - wie die Quelle aktuell aktualisiert wird
  - welche Daten aus Broker/API/Dokument kommen
  - welche Daten aus Kurs-/Webquellen kommen
  - wie Summary und Positionen berechnet werden
  - welche Schwachstellen aktuell bekannt sind
- Erst danach wird fuer diese Quelle umgesetzt.
- VBV wurde als erster Transparenz-Audit-Schritt erledigt:
  - Datenquelle: `meinevbv.at` Portal, keine externe Kursquelle
  - Berechnung: `sourceSummaries/vbv.currentValue` und `netValue` sind direkt
    der gelesene VBV-Saldo
  - `sourceDataUpdatedAt`: `2026-05-31`
  - Urspruenglich `sourceDataProvider`: `vbv_portal`
  - `lastAgentSuccessAt`: `2026-06-21T19:07:33.761Z`
  - GUI zeigt fuer VBV `VBV-Stand` und separat `Agent zuletzt`
  - Build und Health nach Umsetzung: OK

- VBV wurde danach auf die genauere PDF-Kontoinformation umgestellt:
  - Portal-Stichtag bleibt der Ausloeser; das PDF wird nur heruntergeladen und
    geparst, wenn der Stichtag neu ist oder kein PDF zu diesem Stichtag in
    Firestore liegt.
  - PDF-Quelle im Portal: `Severance Payment Fund` -> `Account information`.
  - Manuell importierte Baseline:
    `/Users/niklaskofler/Library/Mobile Documents/com~apple~CloudDocs/Downloads/Kontoinformation-VBVVK31052026.pdf`
  - Canonical Copy:
    `~/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/01_Originale/VBV/AccountInformation/2026-05-31_VBV_AccountInformation_0fb1fd7634.pdf`
  - Firestore:
    - `sourceSummaries/vbv.sourceDataProvider`: `vbv_account_information_pdf`
    - `sourceSummaries/vbv.documentDataUpdatedAt`: `2026-05-31`
    - `sourceSummaries/vbv.accountInformation`: Summary + 2 Vertragsdetails
    - `sourceSummaries/vbv.costValue`: `1.777,42 EUR`
    - `sourceSummaries/vbv.performanceValue`: `+38,44 EUR`
    - `sourceSummaries/vbv.performancePct`: `+2,16 %`
    - `sourceDocuments/vbv_account_information_2026_05_31`
    - `sourceDocumentFacts`: 3 VBV-Fakten
  - Geparste Werte:
    - Gesamtwert: `1.815,86 EUR`
    - Garantiekapital: `1.736,01 EUR`
    - Beitraege: `400,40 EUR`
    - Veranlagungsergebnis netto: `+47,26 EUR`
    - explizite Kosten: `-8,82 EUR`
    - G/V fachlich: `+38,44 EUR`
    - Novartis Pharmaceutical Manufacturing GmbH: `1.707,28 EUR`
    - SANDOZ GmbH: `108,58 EUR`
  - GUI: VBV-Karte hat jetzt einen ausklappbaren `Kontoinformation`-Bereich.
  - Export-Fix: Der sichtbare `Account information`-Link im Portal ist nur
    Navigation; der echte PDF-Link ist
    `/webportal/kontoinformation?date=...&hash=...`. Der VBV-Agent liest diesen
    Link aus und laedt die PDF direkt mit der eingeloggten Session.
  - Dubletten-Fix: Physische PDF-Hashes koennen bei gleichem Inhalt abweichen.
    Fuer VBV zaehlt deshalb `semanticHash` aus den geparsten Fachzahlen und die
    stabile Dokument-ID je Stichtag.
  - Verifikation: Parser OK, echter headless Export mit
    `VBV_HEADLESS=1 node automation/src/sync-vbv-local.mjs --write --force-account-info`
    OK, `npm --prefix app run build` OK,
    `npm --prefix automation run sync:health` OK.

## GUI-Agententransparenz Fix 2026-06-22

- Problem nach der letzten GUI-Aenderung:
  - Agent-Name, Zeitstempel und Status wurden in der Depotkarte teilweise ohne
    Abstand zusammengezogen, z. B. `Bitget Import-Agent22.06.2026 01:03 (OK)`.
  - Bitget hatte dafuer eine Sonderlogik in `SourceOverview`, obwohl die
    kanonische Quelle der Wahrheit `agentStatus` ist.
- Korrigierte Regel:
  - Jede Depotkarte zeigt Agenten in einem eigenen Agentenbereich.
  - Pro Agent werden Name, fachliche Aufgabe, letzter technischer Lauf,
    Status-Badge und bei abweichendem Zeitpunkt der letzte Erfolg angezeigt.
  - Der Kurs-/Datenstand bleibt ein eigener Datenpunkt und wird nicht mehr mit
    Agentenlaufzeiten vermischt.
  - Responsive-Regel: Agentenkacheln muessen immer die volle verfuegbare
    Depotkartenbreite nutzen und duerfen auf Mobile nicht in die Icon-Spalte
    oder eine zu schmale Grid-Spalte fallen. Auf iPhone-15-Breite sollen sie
    einspaltig, kompakt und ohne vertikales Buchstabenbrechen erscheinen.
  - Dashboard-Regel: `Aktive Quellen` und `Warnungen` gehoeren in der
    Uebersicht in eine gemeinsame Status-Kachel. Warntexte duerfen auf
    iPhone-15-Breite nicht in eine halbe Kachel gequetscht werden; die
    eigentliche Warnliste nutzt innerhalb dieser Status-Kachel die volle
    verfuegbare Breite.
- Aktuelle Agent-Metadaten in der GUI:
  - `bitget`: Bestände, Wallets und aktuelle Bewertung aus der Bitget API
  - `bitget_ledger`: Transaktionen, Gebühren, Zinsen/Earn und Bewegungen
  - `flatex`: aktuelle Depot- und Kontodaten aus dem Flatex Export
  - `flatex_documents`: CSV-/Postfachdokumente, Bewegungen, Kosten, Fakten
  - `ginmon`: aktuelle API-Werte, Kurse, Barwerte und Konten
  - `ginmon_documents`: Ginmon-Dokumente, Kosten und Dokumentfakten
  - `intergold`: Websitepreise, Belege und Metallbewertung
  - `traderepublic_manual_exports`: selbst gemailte Trade-Republic-Exporte ohne
    Betreff, Net Worth, Transaction Export und Account Statement
  - `traderepublic_portal`: manueller Portal-Refresh aus der Karte; Chrome-
    Login mit lokaler Keychain, App-Bestaetigung und offizieller
    Transaction-History-Download, kein Import von unsicheren Browsertext-
    Scrapes
  - `capitalcom`: Kontostand, Cash und offene Positionen aus der API
  - `vbv`: Portalstichtag, Kontoinformation-PDF und Vertragswerte
  - `equateplus`: manuelle Novartis-Anteile/Einstand, Kurs via SIX Swiss Exchange
- Umgesetzte Dateien:
  - `app/src/App.tsx`
  - `app/src/App.css`
  - `app/src/domain/types.ts`
  - `docs/firestore_data_contract.md`
- Diese Regel gilt ab jetzt fuer jedes neue Depot und jeden neuen Agenten.

## Trade-Republic-Architekturentscheidung 2026-06-22

- Arbeitsstand:
  - VBV, Capital.com, Bitget, Intergold und Ginmon gelten fuer den aktuellen
    Transparenz-Audit als abgeschlossen.
  - Noch offen: Trade Republic und danach Flatex.
- Trade Republic startet jetzt mit Fokus auf Wahrheit/Aktualitaet:
  - Automatische `Duplicates customer ...` Mails ruhen vorerst als fachlicher
    Kanal.
  - Diese Mails reichen nicht als Wahrheit fuer Cash, Private Equity,
    offizielle Trade-Republic-Snapshotwerte, Dividenden, Zinsen, Steuern,
    Corporate Actions und komplette Ledger-Historie.
- Gepruefte Architektur:
  - Baseline: `Transaction export.csv`, `Account statement.pdf`,
    `Tax Report 2025.pdf`
  - Mail-Agent: `automation/src/trade-republic-mail-agent.mjs`
  - Baseline-Reconcile:
    `automation/src/reconcile-traderepublic-baseline-local.mjs`
  - Quote-Sync: `automation/src/sync-quotes-local.mjs`
  - Health: `automation/src/check-health-local.mjs`
- Manuelle Stichprobe vom 2026-06-22:
  - `Transaction export 2.csv`: 196 Datenzeilen, 5 Positionen
  - `Account statement 2.pdf`: Cash `149,49 EUR`, Zeitraum bis `2026-06-20`
  - `Net Worth.pdf`: Gesamt `2.570,22 EUR`, Brokerage `1.238,91 EUR`,
    Private Markets `1.181,82 EUR`, Cash `149,49 EUR`
- Empfohlenes Zielmodell:
  - `traderepublic_manual_exports` als aktiver Trade-Republic-Importkanal
    fuer selbst gemailte No-Subject-Exporte
  - Boerse-Frankfurt-Kurse fuer oeffentlich handelbare Wertpapiere
  - Net-Worth-Parser als offizieller Trade-Republic-Kontroll-Snapshot
  - Account-Statement-Parser fuer Cash-Reconciliation
  - Transaction-Export-Abgleich periodisch fuer volle Ledger-/Kosten-/Zins-/
    Steuer-/Corporate-Action-Historie
- Umsetzung 2026-06-22:
  - neuer Agent:
    `automation/src/trade-republic-manual-export-agent.mjs`
  - npm-Scripte:
    `reconcile:traderepublic-manual-exports`,
    `sync:traderepublic-manual-exports`,
    `install:traderepublic-manual-export-agent`
  - LaunchAgent:
    `com.niklas.finanztool.traderepublic-manual-exports`
  - Taktung: alle 15 Minuten und sofort ueber App-Full-Refresh.
  - Mail-Lookback: No-Subject-Mails der letzten 14 Tage.
  - Duplikatlogik: CSV-Zeilen ueber `traderepublic_tx_<transaction_id>`.
  - Aktive Kursquelle wird in der GUI bei Positionen sichtbar
    (`Frankfurt`, `Broker`, `Ginmon API`, `Bitget`, `Intergold`).
  - Dry-Run gegen `Transaction export 2.csv`, `Account statement 2.pdf` und
    `Net Worth.pdf`: alle drei Dokumente erkannt, Net Worth mit 5 Positionen.
  - Zu breit gespeicherte alte Manual-Export-Staging-Dateien wurden nach
    `02_Archiviert/TradeRepublic/ManualExports/Ignored` verschoben.
  - Produktivlauf 2026-06-22:
    `agentStatus/traderepublic_manual_exports=OK`, 3 Dokumente geprueft,
    `latestTransactionDate=2026-06-16`, keine unbekannten Dokumente.
  - LaunchAgent `com.niklas.finanztool.traderepublic-manual-exports` ist der
    aktive Trade-Republic-Agent auf dem Mac Studio.
  - LaunchAgent `com.niklas.finanztool.traderepublic-mail` soll vorerst nicht
    geladen sein.
  - Neuer App-Button/Portal-Agent 2026-06-22:
    - Trade-Republic-Karte zeigt einen `Refresh`-Button.
    - Button schreibt `automationCommands/traderepublic_portal_refresh`.
    - Command-Runner startet
      `automation/src/download-traderepublic-local.mjs --write`.
    - Login-Daten duerfen nie ins Repo oder Firestore; sie liegen lokal in
      Keychain-Services `finanztool-traderepublic-phone` und
      `finanztool-traderepublic-pin`.
    - Der Agent wartet nach Telefon/PIN auf die Bestaetigung in der
      Trade-Republic-App.
    - Portal-Snapshot-Update 2026-06-23:
      - Der Agent liest zusaetzlich `Portfolio`, `Transactions` und `Activity`
        aus dem Trade-Republic-Webportal.
      - Er stellt die Portfolio-Liste vor dem Parsen auf `Since buy`; `Daily
        trend` darf nicht als Positionsbestand interpretiert werden.
      - Er unterstuetzt deutsches und englisches Zahlenformat, z. B.
        `149,49 EUR` und `149.49 EUR`.
      - Geschrieben wird `sourceDocumentFacts/traderepublic_portal_snapshot_latest`
        als Portal-Beobachtung mit sichtbaren Positionen, sichtbaren
        Transaktionen, Cash und Activity-Text.
      - Sichtbare Brokerage-Positionen werden nur bei eindeutigem Namensmatch
        mit `quoteProvider=traderepublic_portal_web` aktualisiert.
      - Private Markets werden nur als `traderepublic_portal_total_implied`
        aktualisiert: Portfolio-Gesamtwert minus gelistete Positionen.
      - Cash kommt aus `Profile > Transactions`.
      - `sourceSummaries/traderepublic.netValue` enthaelt jetzt Portalwert plus
        Cash; `depotValue` bleibt der Investmentwert ohne Cash.
      - Korrektur 2026-06-27: Der Agent sucht nicht mehr nach einem
        globalen CSV/PDF-Download. Die Testlaeufe haben festgelegt, dass es
        diesen Alles-Export im Trade-Republic-Webportal fuer unsere Strategie
        nicht gibt.
      - Der Vollscan endet nach Portal-Snapshot, gezielter
        Transaktions-/Activity-Dokumentpruefung und operativer Anwendung.
        `keine neuen Portal-PDFs gespeichert` ist ein normaler OK-Status.
    - Browsertext aus dem Portal ist aktuelle Bewertungs-/Transparenzquelle,
      aber kein vollstaendiger Audit-Ersatz fuer Transaktionen, Steuern und
      Kosten. Dafuer bleiben `Transaction export`, `Account statement`,
      `Net Worth` und Tax-Reports massgeblich.
  - Verifikation 2026-06-23:
    - echter Portal-Write-Lauf erfolgreich.
    - `agentStatus/traderepublic_portal=OK`
    - `visiblePositionCount=4`, `visibleTransactionCount=30`
    - `cashValue=149,49 EUR`
    - `brokerSnapshotValue=2.445,65 EUR`
    - `brokerageValue=1.263,83 EUR`
    - `privateMarketsValue=1.181,82 EUR`
    - `netValue=2.595,14 EUR` inklusive Cash.
- Neue verbindliche Betriebsregel 2026-06-22:
  - Bis Trade Republic automatische vollstaendige Exporte anbietet, sendet der
    Nutzer moeglichst taeglich App-Exporte ohne Betreff an die eigene
    Mailadresse.
  - Pflichtpaket: `Net Worth.pdf`, `Transaction export.csv` und
    `Account statement.pdf`.
  - `Tax Report ...pdf` bleibt jaehrlich.
  - Die Uhrzeit ist variabel; wenn der Nutzer den Export vergisst, bleibt der
    letzte bekannte Stand gueltig und die GUI muss das Datum klar anzeigen.
  - Der Manual-Export-Agent muss ueberlappende CSVs idempotent behandeln:
    gleiche Transaktions-IDs duerfen Einstand, Kosten, Steuern, Zinsen,
    Dividenden und Ledger nicht doppelt veraendern.
  - Abweichung vom 2026-06-22 ist dokumentiert:
    Handy-App `2.623,72 EUR` Total mit Private Markets `1.381,82 EUR`,
    Net-Worth-PDF fast zeitgleich `2.570,22 EUR` Gesamt mit Private Markets
    `1.181,82 EUR`. Deshalb muessen Quelle, Stand und Abweichung in der App
    sichtbar sein.
  - Warnungsfix 2026-06-22:
    - Ursache: Der 15-Minuten-Agent speicherte bekannte Mail-Anhaenge erneut
      an denselben Pfad und konnte das Net-Worth-PDF genau waehrend dieses
      erneuten Speicherns kurz als `UNVOLLSTAENDIG` sehen.
    - Fix: Apple-Mail-Anhaenge werden nicht mehr ueberschrieben, wenn die
      Ziel-Datei bereits existiert.
    - Zusaetzlich gilt: Wenn ein Dokument bereits einmal vollstaendig als
      `PARSED` angewendet wurde, darf ein spaeterer transient schlechter
      Wiederholungsscan keine Health-Warnung erzeugen.
    - Verifikation: echter Maillauf `sync:traderepublic-manual-exports -- --no-quotes`
  - Portal-PDF-Crawler Stufe 1 umgesetzt am 2026-06-23:
    - Datei: `automation/src/download-traderepublic-local.mjs`
    - Nach Login/App-Freigabe scannt der Agent `Profile > Transactions` nach
      Dokumenten.
    - Erkannte Labels: `Billing Execution`, `Inbound Invoice`, `Statement`,
      `Transaction confirmation`, `Dividend equivalent`.
    - PDF-Popups werden direkt heruntergeladen; temporaere Presigned-URLs
      werden nicht gespeichert.
    - Dedupe primaer per SHA-256.
    - Ablage Original:
      `01_Originale/TradeRepublic/PortalDocuments/<documentType>/`
    - Ablage Text:
      `02_Archiviert/TradeRepublic/PortalDocuments/Text/<documentType>/`
    - Bei `--write` werden `sourceDocuments`,
      `sourceDocumentFacts` und Fehler-Fakten geschrieben.
    - Voll geparst in Stufe 1:
      - `Billing Execution` als `security_execution`
      - `Inbound Invoice` als `cash_deposit`
    - Noch nicht automatisch in Ledger/Kosten/Zinsen ueberfuehrt:
      `Statement`, `Transaction confirmation`, `Dividend equivalent`.
    - Verifikation:
      - `node --check automation/src/download-traderepublic-local.mjs`
        erfolgreich.
      - `npm --prefix app run build` erfolgreich.
      - Login-Erkennung korrigiert: authentifizierte URLs wie
        `/profile/activities` zaehlen als eingeloggt, auch wenn der Body-Text
        noch nicht alle erwarteten Woerter enthaelt.
      - Portal-Detailansicht ist `.sideModal`, Dokumentbuttons liegen in
        `.detailDocuments`; die ganze Seite darf nicht als Dokumentbereich
        interpretiert werden.
      - Echter `--write`-Lauf am 2026-06-23 erfolgreich:
        - `sourceDocuments`: 4 Portal-Dokumente
        - `sourceDocumentFacts`: 4 Portal-Fakten
        - 3 `security_execution` aus `Billing Execution`
        - 1 `cash_deposit` aus `Inbound Invoice`
        - 0 Portal-Dokumentfehler
        - `agentStatus/traderepublic_portal=OK`
      - Agentstatus zeigt kuenftig PDF-Anzahl im aktuellen Lauf plus kumulierte
        Portal-Dokumentanzahl.
  - Portal-Fakten-Anwendung umgesetzt am 2026-06-23:
    - Datei: `automation/src/download-traderepublic-local.mjs`
    - Neuer Befehl:
      `npm --prefix automation run sync:traderepublic-portal-facts`
    - Zweck: bereits geladene Portal-Dokumentfakten ohne Browser-Login
      idempotent operativ anwenden.
    - Portal-Dokumente bekommen eine fachliche `portalTransactionSignature`
      aus Dokumentlabel, Datum, Titel und Betrag. Damit weiss der Agent vor
      dem Klick, ob ein Portalvorgang bereits bekannt ist.
    - Operative Anwendung schreibt:
      - `transactions/traderepublic_portal_tx_*`
      - `ledgerEntries/traderepublic_portal_ledger_*`
      - bei Gebuehren `costEvents/*`
      - aktualisierte `sourcePositions` fuer Menge/Einstand
      - `sourceDocumentFacts/traderepublic_portal_application_*`
    - Dedupe gegen Manual-Export:
      - Wertpapierausfuehrungen: Datum, ISIN, Menge, Betrag
      - Cash-Einzahlungen: Wertstellung, Betrag, Konto
    - Wenn ein manueller Export denselben Vorgang bereits enthaelt, wird der
      Portalvorgang als `SKIPPED_DUPLICATE_MANUAL` dokumentiert und nicht
      operativ geschrieben.
    - Verifikation:
      - `node --check automation/src/download-traderepublic-local.mjs`
        erfolgreich.
      - Erster Lauf `sync:traderepublic-portal-facts`: 4 neu angewendet.
      - Zweiter Lauf `sync:traderepublic-portal-facts`: 0 neu, 4
        uebersprungen.
      - Firestore: 4 `portal_document_application` mit `status=APPLIED`,
        3 vorlaeufige Portal-Transaktionen, 4 Portal-Ledger-Eintraege.
  - Informationsluecke Trade Republic Stand 2026-06-23:
    - Grosser Portal-Lauf mit `TR_PORTAL_DOCUMENT_SCAN_LIMIT=80`:
      - 67 Portal-Dokumente insgesamt
      - 65 `billing_execution`
      - 1 `inbound_invoice`
      - 1 `tax_report`
      - alle 67 als `PARSED`
    - Tax Report 2025 ist im Webportal unter
      `Profile > Activity > Annual Tax Report 2025` erreichbar und wurde als
      Portal-PDF/Fakt gespeichert. Er muss nicht mehr manuell per Mail kommen,
      solange der Portalzugriff funktioniert.
    - Duplicate-Statement-Mails sind fuer Wertpapierabrechnungen nicht mehr
      erforderlich, weil dieselben `Billing Execution`-PDFs aus der Web-App
      geladen werden.
    - Private-Equity-Korrektur:
      - Sechs Private-Equity-Portalbuchungen waren kurz doppelt angewendet,
        weil `private_market_cash` aus dem CSV nicht als Duplikat zu
        `Billing Execution` erkannt wurde.
      - Fix: `private_market_cash` wird jetzt gegen Private-Equity-
        Portalabrechnungen dedupliziert.
      - Betroffene Portal-Anwendungen wurden auf
        `SKIPPED_DUPLICATE_MANUAL` gesetzt und aus
        `transactions`/`ledgerEntries` entfernt.
      - Private-Equity-Einstand kommt nicht mehr aus allen
        `private_market_cash`-Fakten, weil diese auch Vorabzahlungen/
        Cashflows enthalten koennen.
      - Neue Regel seit 2026-06-23: Fuer Private Equity `LU3176111881`
        haben ausgefuehrte Trade-Fakten Vorrang. Einstand = Summe
        `Stueck * Kurs` aus `factType=trade`; verifiziert:
        `11,178226` Stueck und `1.145,40 EUR` Einstand.
      - `private_market_cash` ist nur Rueckfallquelle, wenn keine
        ausgefuehrten Private-Equity-Trade-Fakten vorhanden sind.
    - Fallback-/Warnlogik umgesetzt am 2026-06-23:
      - Wenn ein Portal-Dokumentbutton kein PDF liefert, versucht der Agent
        einen DOM-Fallback aus der sichtbaren Detailansicht.
      - DOM-Fakten werden mit `sourceChannel=traderepublic_portal_dom`
        gespeichert.
      - Zinsen werden nur dann aus dem DOM akzeptiert, wenn echte
        Zinsmerkmale wie `Interest`, `Accrued`, `You received` oder `Zins`
        im Detailtext stehen. Ein zu grosszuegiger Test-Fallback wurde wieder
        aus Firestore entfernt.
      - Drei alte `Transaction confirmation`-Buttons fuer Cashbewegungen
        lieferten weiter `Something went wrong`.
      - Seit 2026-06-25 werden solche Faelle nicht geloescht, sondern ueber
        `documentReviewDecisions` fachlich geschlossen, wenn sie durch andere
        gespeicherte Trade-Republic-Daten abgedeckt sind.
      - Fuer die drei bekannten Faelle vom `2026-02-02`, `2026-03-03` und
        `2026-03-31` gibt es je eine `covered`-Entscheidung mit Scope `item`.
      - `agentStatus/traderepublic_portal` steht danach wieder auf `OK`.
      - `systemHealth/current` warnt depotuebergreifend bei unbekannten
        Dokumenten, unbekannten Dokumentfakten und ungelösten
        Portal-Dokumentfehlern.
    - Noch nicht voll automatisiert:
      - Vollstaendige historische Transaktionsliste per Web-DOM muss noch
        produktiv als Ersatz fuer `Transaction export.csv` umgesetzt werden.
    - Aktuelle Zusende-Regel:
      - Keine Duplicate-Statement-Mails mehr noetig.
      - Tax Report nicht mehr per Mail noetig.
      - Net-Worth-PDF fuer taeglichen aktuellen Wert nicht mehr zwingend,
        weil der Portal-Snapshot Portfolio/Cash liest; optional als Kontrolle.
      - Bis Zins-/Cash-DOM-Fallback produktiv ist, bleibt
        `Transaction export.csv` die sichere Quelle fuer Zinsen, Steuern,
        Dividenden, Cash-Historie und Private-Markets-Cashflows.
      - `Account statement.pdf` nur noch fuer Cash-Reconciliation sinnvoll,
        solange einzelne `Transaction confirmation`-PDFs fehlschlagen.
  - Gegencheck 2026-06-23 mit App-Freigabe:
    - Portal-Refresh erfolgreich; keine neuen Portal-PDFs, Snapshot wurde
      aktualisiert.
    - Trade-Republic-Werte danach: Depotwert `2.437,42 EUR`, Cash
      `149,49 EUR`, Netto `2.586,91 EUR`, Einstand `2.336,41 EUR`,
      G/V `+101,01 EUR` / `+4,3 %`.
    - Einzelpositionen: Private Equity `+36,41 EUR`, NASDAQ100 `+57,05 EUR`,
      Core S&P 500 `+16,11 EUR`, Netflix `-4,04 EUR`,
      Stoxx Europe Defense `-4,52 EUR`.
    - Wichtig: Netflix bleibt der Stockperk/Bonusfall mit Einstand
      `10,06 EUR`; laut aktuellem Portal ist aber zusaetzlich Stoxx Europe
      Defense leicht negativ. Trade Republic gesamt ist trotzdem positiv.
    - UI-Fix: Trade-Republic-Portal-Button sitzt jetzt als breite Aktionszeile
      in der Trade-Republic-Karte und zeigt waehrend des Logins
      `Trade Republic: App bestätigen`.
  - Preislogik-/Redundanz-Audit 2026-06-24:
    - Gelistete Trade-Republic-Positionen werden aktuell aktiv mit
      Boerse-Frankfurt/Xetra-Kursen bewertet. Felder muessen konsistent sein:
      `quoteProvider=boerse-frankfurt`,
      `priceSource=boerse-frankfurt`,
      `valuationMethod=boerse-frankfurt_quote_v1`.
    - Der letzte Broker-/Portalwert bleibt separat als `brokerCurrentValue`
      und `brokerQuoteProvider=traderepublic_portal_web` erhalten.
    - Private Equity bleibt `traderepublic_portal_total_implied`.
    - Cash bleibt `traderepublic_portal_cash_v1`.
    - Fix: `sync-quotes-local.mjs` schreibt jetzt `priceSource`,
      `priceSourceUrl`, `quoteDataProvider` und `quoteDataUpdatedAt`
      konsistent pro Kurslauf.
    - Aktueller Firestore-Stand nach Kurslauf:
      Depotwert `2.428,22 EUR`, Cash `149,49 EUR`, Netto
      `2.577,71 EUR`, Einstand `2.336,41 EUR`, G/V
      `+91,81 EUR` / `+3,9 %`.
    - Duplikatpruefung:
      - keine doppelten `transactions.transactionId`
      - `63` Portal-Anwendungen korrekt als
        `SKIPPED_DUPLICATE_MANUAL`
      - zwei Private-Equity-Ledgerzeilen am 2026-06-08 ueber je
        `50 EUR` sind echte zwei Ausfuehrungen mit unterschiedlichen
        Trade-Republic-Transaktions-IDs/Uhrzeiten
      - eine echte redundante Dokumentspur bleibt: `Tax Report 2025.pdf`
        gleicher `fileHash` in Baseline, Mail-Import und Portal-Import;
        wirkt nicht operativ auf Werte, soll spaeter ueber kanonischen
        `source + fileHash`-Dedupe bereinigt werden.
    - UI-Fix nach Nutzerfeedback: Trade-Republic-Portal-Button wurde ganz
      nach oben direkt unter den Trade-Republic-Kopf verschoben.
  - Dokumenten-Postfach 2026-06-25:
    - Neue Collection `documentReviewDecisions`.
    - Die App zeigt problematische Dokumente/Fakten nicht mehr versteckt in
      einer einzelnen Depotkarte, sondern zentral oberhalb der Depotkarten als
      `Dokumenten-Postfach`.
    - Zunaechst zeigt dieses Postfach nur offene/fehlerhafte oder unbekannte
      Dokumentfaelle aus allen Depots.
    - Dokumente muessen geraeteuebergreifend oeffenbar sein. Primaer wird
      dafuer Firebase Storage genutzt (`sourceDocuments.storagePath`).
      Die App laedt PDFs authentifiziert ueber Firebase Storage und oeffnet
      sie als Browser-Datei.
    - Backfill 2026-06-26:
      - Storage-Regeln deployed: Lesen nur fuer
        `niklas.kofler@gmail.com`, Schreiben nicht aus der Client-App.
      - `sync-document-storage-local.mjs` angelegt.
      - Alle 744 `sourceDocuments` besitzen jetzt `storagePath`.
      - Fix 2026-06-26: App oeffnet Storage-Dokumente per
        `getDownloadURL()` statt per `getBlob()`, weil der Blob-Download im
        Browser im Ladefenster haengen blieb.
      - Alle 744 Storage-Objekte haben jetzt
        `firebaseStorageDownloadTokens`; Beispiel
        `ginmon_doc_31350057` liefert per Firebase-Download-URL `HTTP 200`
        und ein PDF.
      - Counts: Flatex 283/283, Ginmon 382/382, Trade Republic 78/78,
        VBV 1/1.
      - Beispiel verifiziert: `ginmon_doc_31350057` existiert in Firebase
        Storage als `application/pdf`, 599472 Byte.
    - Der lokale Dokumentserver
      `http://127.0.0.1:5176/documents/<sourceDocumentId>` bleibt nur Fallback
      fuer lokale Entwicklung oder Dokumente ohne `storagePath`.
    - Nutzer kann Dokumentfaelle ueber Standardaktionen klassifizieren:
      `Welcome-Dokument`, `Wichtig`, `Abgedeckt`, `Nicht relevant`.
    - Normale GUI-Entscheidungen gelten nur fuer das konkrete Dokument
      (`scope=item`). Typweite Entscheidungen werden nicht mehr in der GUI
      angeboten, damit ein Klick auf `Nicht relevant` nicht alle
      `unknown`-Dokumente ausblendet.
    - Korrektur 2026-06-26: `Wichtig` setzt nicht mehr `needs_parser`,
      sondern `deferred`. Bedeutung: Dokument ruht zur spaeteren fachlichen
      Pruefung, darf nicht vergessen werden und verschwindet aus dem aktiven
      Postfach, zaehlt aber nicht als akute Health-Warnung. Die Entscheidung
      bleibt in `documentReviewDecisions` gespeichert; spaeter braucht es eine
      separate Rueckstell-/Pruefansicht.
    - Wenn eine Dokumententscheidung nicht gespeichert werden kann, zeigt die
      GUI im Postfach eine konkrete Fehlermeldung an.
    - Health und Trade-Republic-Portal-Agent ignorieren nur entschiedene
      Faelle; neue unbekannte oder nicht abrufbare Dokumente bleiben offen.
    - Korrektur 2026-06-27: Das Postfach zeigt vorerst nur offene
      Dokumentfaelle. Als `Nicht relevant`, `Abgedeckt` oder `Wichtig`
      entschiedene Dokumente verschwinden aus dem Postfach und erzeugen keine
      zentrale Dokumentwarnung. Der fruehere Bereich `Verarbeitete Dokumente`
      wurde aus der GUI entfernt, bis ein echtes Dokumentarchiv gebaut wird.
      Falls `systemHealth/current` noch eine alte Dokumentwarnung enthaelt,
      blendet die GUI diese aus, sobald das Postfach keine offenen Faelle mehr
      hat.
    - Verifizierter Stand:
      - `agentStatus/traderepublic_portal.status=OK`
      - `portalDocumentUnresolvedFailureCount=0`
      - `portalDocumentReviewedFailureCount=3`
      - `systemHealth/current` enthaelt keine Trade-Republic-Warnung mehr.
- Detailplan:
  - `docs/traderepublic_import_strategie.md`

## 2026-06-27 Agenten-Optimierung Mac Studio

- Ziel: Agents sollen auf dem Mac Studio moeglichst unsichtbar/headless,
  schnell und quellenrein laufen.
- Datenbasis-Audit nach Agenten-Optimierung:
  [Datenbasis-Audit 2026-06-27](/Users/niklaskofler/Documents/finanztool/docs/data_basis_audit_2026-06-27.md)
- Flatex:
  - `com.niklas.finanztool.flatex-sync` ist jetzt ein headless
    Broker-Snapshot im 5-Minuten-Takt.
  - Der Lauf nutzt `download-flatex-local.mjs --write --snapshot-only
    --headless`.
  - Er liest Positionen, Kurse, Einstand, Cash und Kreditfelder direkt aus
    Flatex und erzeugt keine CSV-Dateien.
  - `com.niklas.finanztool.flatex-documents` fuehrt den CSV-/Dokumentexport
    getrennt taeglich um 22:10 aus.
  - Flatex wird nicht mehr standardmaessig ueber Boerse Frankfurt bewertet.
- Ginmon:
  - `com.niklas.finanztool.ginmon-sync` laeuft jetzt alle 5 Minuten
    headless.
  - Dokumentimport bleibt taeglich um 02:00.
- VBV:
  - `com.niklas.finanztool.vbv-sync` laeuft nur noch woechentlich montags um
    06:45 headless.
- Bankkonten:
  - `com.niklas.finanztool.bank-accounts` laeuft stuendlich nur fuer
    Erste/Sparkasse, Revolut und PayPal.
  - `com.niklas.finanztool.bank99` und `com.niklas.finanztool.n26` laufen
    separat exakt um 06:00 und 16:00 und bleiben damit bei maximal
    2 Abrufen/Tag.
- Kurs-/Health-Agenten:
  - `sync-quotes-local.mjs` defaultet jetzt auf `QUOTE_SOURCES=traderepublic`;
    Flatex/Ginmon/Bitget/EquatePlus nutzen ihre eigenen Quellen.
  - `run-quote-sync-local.mjs` startet keinen Health-Check mehr bei jedem
    5-Minuten-Lauf.
  - neuer LaunchAgent `com.niklas.finanztool.health-check` laeuft alle
    30 Minuten.
- Deaktiviert/pausiert:
  - `capitalcom-import`
  - `traderepublic-mail`
  - `traderepublic-manual-exports`
- Command-Runner:
  - `sync_quotes` fuehrt jetzt nur noch den Kurs-Sync aus.
  - `full_refresh` bleibt der grosse Rundumlauf.
  - `traderepublic_portal_refresh` nutzt den Portal-Agenten headless im
    schnellen Snapshot-Modus (`--snapshot-only`).
  - Der schnelle Trade-Republic-Button aktualisiert Depotwert, Cash,
    Positionen und Broker-Kursstand, ueberspringt aber den langsamen
    Dokument-/Transaktionsdetailscan.
  - In der Trade-Republic-Karte gibt es zusaetzlich `Nur Kurse`; dieser Button
    startet nur `sync_quotes` und benoetigt keinen Trade-Republic-Login.
  - Der volle Portal-Lauf bleibt fuer gezielte Dokument-, PDF-, Kosten-,
    Steuer- und Transaktionspruefungen per
    `npm --prefix automation run sync:traderepublic-portal` verfuegbar.
  - Der normale volle Portal-Lauf bricht inkrementell ab, sobald mehrere
    neueste Transaktionen hintereinander bereits bekannte Dokument-Signaturen
    haben. Fuer eine vollstaendige Neu-Inventarisierung gibt es
    `npm --prefix automation run sync:traderepublic-portal-full`.
  - Approval-Dauer: Die Trade-Republic-App-Freigabe kann erst erscheinen,
    nachdem Browser-Login, Land, Telefonnummer und PIN abgeschlossen sind. Der
    bisherige Zeitfresser nach der Freigabe war der automatische
    Dokument-/Transaktionsscan; dieser ist aus dem normalen Button entfernt.

## 2026-06-27 Flatex Datenbasis-Cleanup

- Flatex-Dokumente wurden neu abgeglichen und normalisiert.
- Firestore-Stand nach `sync:flatex-documents`:
  - `sourceDocuments`: 283
  - `sourceDocumentFacts`: 409
  - `transactions`: 89
  - `ledgerEntries`: 119
  - `costEvents`: 129
  - `incomeEvents`: 39
- `agentStatus/flatex_documents` ist `OK` und meldet keine unbekannten
  Dokumente oder Warnungen.
- Dokumentparser erweitert:
  - Depotpositionen aus Depotauszuegen werden jetzt vollstaendiger erkannt.
  - Depotservicegebuehren werden als `cash_adjustment` geparst.
  - MiFID-/Kosteninformation wird als `cost_information` plus Produktkosten
    gespeichert.
- Event-Normalisierung ersetzt alte Flatex-Platzhalterbewegungen durch
  generische Events aus Dokumentfakten.
- Verifikation:
  - `npm --prefix automation run sync:health` ist `OK`.
  - `npm --prefix app run build` ist erfolgreich.
- Abschlusspruefung:
  - Chrome-Sichtpruefung am `http://localhost:5173/` war erfolgreich.
  - Flatex-Karte zeigt Broker-Snapshot `OK`, Dokumenten-Agent `OK`, Cash,
    Kreditrahmen und in Anspruch genommenen Kredit plausibel.
  - Werte in der Karte stimmen mit Firestore-Snapshot ueberein.
- Korrektur 2026-06-27:
  - Flatex-Tagesveraenderungen duerfen nicht mehr aus alten
    Boerse-Frankfurt-Historienwerten abgeleitet werden.
  - Der 5-Minuten-Broker-Snapshot und der 22:00-Positionshistorienlauf
    akzeptieren fuer Flatex als Vortagsbasis nur `priceHistory` mit Provider
    `flatex` oder `flatex_broker_snapshot_v1`.
  - Solange noch keine Flatex-eigene Historie vorliegt, faellt die Anzeige
    fuer `Heute` auf die Tageswerte aus dem Flatex-Broker-Snapshot zurueck.
  - Neue Positionen werden dynamisch per ISIN als `sourcePositions/flatex_<ISIN>`
    angelegt; nicht mehr im Broker-Snapshot vorhandene Wertpapierpositionen
    werden aus der aktuellen Positionsansicht entfernt. Die historische
    Nachvollziehbarkeit bleibt ueber `transactions`, `ledgerEntries`,
    `costEvents`, `incomeEvents` und `priceHistory` erhalten.

## 2026-06-27 Ginmon Datenbasis-Cleanup

- Ginmon ist nach Flatex als zweite Quelle fachlich nachgezogen.
- Aktuelle Wahrheit:
  - `com.niklas.finanztool.ginmon-sync` laeuft alle 5 Minuten headless und
    aktualisiert die aktuellen Depotwerte/Kurse aus der Ginmon-API.
  - `com.niklas.finanztool.ginmon-documents` laeuft taeglich um 02:00 und
    verarbeitet Dokumente.
- Dokumentparser korrigiert:
  - WP-Abrechnungen in zweispaltiger PDF-Struktur werden wieder mit ISIN,
    Stueck, Kurs, Handelsdatum, Valuta und Cash-Betrag erkannt.
  - Rechnungen lesen Rechnungsdatum, Rechnungsnummer, Zeitraum,
    Berechnungsbasis, Gebuehr, MwSt. und Rechnungsbetrag.
  - Basisinformationen, Welcome Letters, AGB/Vertragsbedingungen,
    Datenschutz, Einlagensicherung und VL-Formulare werden nur klassifiziert,
    aber nicht automatisch ignoriert. Sie bleiben mit `parseStatus=UNPARSED`
    im zentralen Dokumenten-Postfach, bis der User sie selbst als nicht
    relevant, wichtig/spaeter oder parserwuerdig markiert.
- Normalisierung:
  - `sourceDocumentFacts` werden in `transactions`, `ledgerEntries`,
    `costEvents` und `incomeEvents` ueberfuehrt.
  - Cash-Kontoauszugszeilen werden konservativ verarbeitet: Aggregierte
    `Wertpapierkauf`-/`Wertpapierverkauf`-Zeilen aus Kontoauszuegen werden
    nicht nochmals als Ledger erfasst, weil die einzelnen WP-Abrechnungen
    bereits die Trade-Cash-Events erzeugen.
  - Doppelte Rechnungen aus Portal- und Datei-Kopie werden per
    Rechnungsnummer dedupliziert.
- Firestore-Stand nach Abschluss:
  - `sourceDocuments`: 382
  - `sourceDocumentFacts`: 727
  - `transactions`: 74
  - `ledgerEntries`: 124
  - `costEvents`: 120
  - `incomeEvents`: 28
  - Dokumenttypen: 94 Trades, 86 Rechnungen, 68 Kontoauszuege,
    30 Vermoegensstatus, 33 Quartalsberichte, 32 Ertragsdokumente,
    9 Kapitalmassnahmen, 10 Kontostandsdokumente, 3 Jahresdepotauszuege
    plus bekannte ignorierte Informations-/Rechtsdokumente.
- Verifikation:
  - `npm --prefix automation run reconcile:ginmon-events` trocken erfolgreich.
  - `npm --prefix automation run reconcile:ginmon-documents -- --pdf-timeout-ms=30000`
    schreibt erfolgreich.
  - `npm --prefix automation run sync:health` ist `OK`, 0 Warnungen.
  - `npm --prefix app run build` ist erfolgreich.
  - `git diff --check` ist sauber.

## 2026-06-27 Agenten-Effizienz Flatex/Ginmon

- Grundregel fuer alle Depot-Agents:
  - Inkrementelle Pruefung vor Download/Parsing.
  - Bekannte Dokumente nicht erneut herunterladen.
  - Ohne neue Dokumente kein Voll-Reparse im normalen Agentlauf.
  - Volle Reconciles nur bei neuen Dokumenten, Parser-Aenderungen oder
    bewusstem Force-Lauf.
  - Normale Agents laufen headless; sichtbare Browser nur mit bewusstem
    Debug-/Login-Modus.
  - Kein Agent markiert Dokumente automatisch als `IGNORED`,
    `not_relevant` oder fachlich erledigt. Solche Entscheidungen gehoeren
    ins zentrale Dokumenten-Postfach und werden vom User getroffen.
- Ginmon:
  - Browserstart ist jetzt headless by default.
  - Sichtbarer Login nur noch bewusst mit
    `npm --prefix automation run sync:ginmon-current -- --headed`.
  - Wenn der headless Agent eine Anmeldung braucht und keine Session/Keychain
    funktioniert, bricht er mit klarer Warnung ab, statt ein Fenster zu
    oeffnen.
  - Dokumentagent prueft Portal-Dokument-IDs. Testlauf:
    343 bekannte Portal-Dokumente gesehen, 0 neue Downloads,
    343 uebersprungen, Reconcile uebersprungen.
  - Korrektur 2026-06-27: 17 automatisch auf `IGNORED` gesetzte Ginmon-
    Informationsdokumente wurden wieder auf `UNPARSED` gesetzt und bleiben
    damit pruefbar im Postfach.
- Flatex:
  - 5-Minuten-Snapshot laeuft headless und ueberschreibt aktuelle
    `sourcePositions`/`sourceSummaries`; geschlossene Positionen werden aus
    der aktuellen Ansicht entfernt.
  - CSV-Exporte werden vor Ablage per SHA-256 gegen vorhandene Dateien in
    Inbox/Originale/Archiv geprueft. Identischer Inhalt wird verworfen und
    nicht erneut gespeichert.
  - Portal-Ausfaelle werden in `agentStatus/flatex` als Warnung gespeichert.
    Aktueller Test am 2026-06-27: Flatex leitete auf
    `https://www.flatex.at/wartung/` um; der Agent meldet deshalb transparent
    `WARNUNG` statt altes `OK`.

## 2026-06-27 UI-Regel Depotkarten

- Depotkarten in der Uebersicht sind einklappbar.
- Eingeklappt zeigen sie nur die Kernwerte:
  Depotwert, G/V, Heute und letztes Update.
- Im eingeklappten Zustand liegen Titel und Kernwerte in der oberen
  Kartenzeile. Der Beschreibungstext ist dort nachrangig und wird ausgeblendet,
  damit die Karten auf Desktop und iPhone kompakt bleiben.
- Der Klappzustand wird lokal im Browser gespeichert, damit die Uebersicht
  beim Arbeiten kompakt bleiben kann.
- Ausgeklappt bleiben alle Detailbereiche erhalten: Refresh-Buttons,
  Wertmodus, Agenten, Zusatzmetriken, Konten, Depots und Positionen.

## 2026-06-27 Freigabe fuer Dashboards/GUI

- Nachpruefung am 2026-06-27 12:08 CEST abgeschlossen.
- Build und Syntax:
  - `npm --prefix app run build` erfolgreich.
  - `node --check` fuer alle `automation/src/*.mjs` erfolgreich.
- Datenmodell:
  - `npm --prefix automation run reconcile:event-model` zeigt 4305 Events
    und `changed=0`.
  - Das zentrale Eventmodell `event_model_v1_2026-06-27` ist damit
    idempotent und fuer Dashboards verwendbar.
- Kosten-/Einstandspruefung:
  - `npm --prefix automation run audit:costs` erfolgreich.
  - 65 relevante Depotpositionen geprueft, 0 fehlende Einstandswerte.
- Kurs-/Historienbasis:
  - `priceHistory`: 1133 Eintraege von 2026-06-13 bis 2026-06-26.
  - Quellen: Boerse Frankfurt, Bitget, Flatex, Ginmon, Intergold,
    Trade Republic.
  - Positionshistorie-Dry-Run fuer 2026-06-27 verarbeitet 72 Positionen,
    49 davon mit Vortagsbasis.
- Health:
  - Urspruenglich `WARNUNG`, 0 Fehler.
  - Update 2026-06-28: Health kann wegen bewusst limitierter Bankkonten
    `FEHLER` zeigen. Das blockiert den Dashboard-Start nicht, solange der
    letzte bekannte Geldstand erhalten bleibt und die betroffenen Konten
    fachlich klein sind.
  - bank99 und N26 zusammen sind fuer den ersten Dashboard-Ausbau nicht
    kritisch; nach naechstem planmaessigen Lauf pruefen.
- Entscheidung:
  - Naechster Abschnitt ist `Dashboards und GUI`.
  - Dashboards duerfen fuer Vermoegen, Depotwert, Cash/Kredit, Performance,
    Tagesaenderung und Kosten-/Ertragsgrundlage gebaut werden.
  - Jede Dashboard-Kachel muss Datenstand, Quelle und Warnstatus sichtbar
    machen, wenn Daten nicht direkt oder nicht vollstaendig sind.

## 2026-06-27 Bankkonten-Warnungen und letzter Stand

- Regel fuer Bankkonten:
  - Wenn eine Bank temporaer nicht gelesen werden kann, z. B. wegen
    Tageslimit, fehlender Session oder Provider-Fehler, darf das Konto nicht
    aus der GUI verschwinden.
  - Der letzte bekannte Kontostand bleibt sichtbar und wird als `STALE`
    markiert.
  - Nur wenn eine Bank erfolgreich gelesen wurde und ein Konto dort wirklich
    nicht mehr zurueckkommt, darf es als `MISSING` behandelt werden.
- Konkreter Anlass:
  - `bank99` erreichte am 2026-06-27 das Tageslimit von 4 Abrufen.
  - Vor der Korrektur wurde die Position dadurch als `MISSING` und
    `accountValueIncluded=false` gesetzt.
  - Nach der Korrektur bleibt `bank99` mit 41,51 EUR sichtbar:
    `status=STALE`, `accountValueIncluded=true`,
    `staleReason=bank99: Tageslimit 4 Abrufe erreicht`.
- GUI-Regel:
  - Die Bankkonten-Agentmeldung muss die betroffene Bank und den Grund nennen.
  - In der Kontozeile steht bei solchen Faellen `letzter bekannter Stand`
    plus die konkrete Ursache.
  - Warnbereiche duerfen keine Erfolgsmeldungen wie `x Konten gelesen` oder
    `0 neue Umsaetze` anzeigen. Solche Laufdetails bleiben technisch als
    `runSummary` gespeichert, werden aber nicht als Warnung dargestellt.
  - Jedes Bankkonto zeigt direkt in der Kontozeile einen Status:
    `OK`, `Letzter Stand`, `Fehlt` oder `Fehler`.
  - Jedes Bankkonto zeigt direkt in der Kontozeile einen Zeitstempel fuer den
    besten verfuegbaren Datenstand bzw. letzten Abrufversuch.

## 2026-06-27 Bankkonten/Kreditkarten Agent-Trennung

- Agent-Regel:
  - Sparkasse/George, Revolut und PayPal duerfen stuendlich laufen.
  - `bank99` und `n26` haben wegen Enable-Banking-/Provider-Limit eigene
    Agenten und laufen nur 2x pro Tag: 06:00 und 16:00.
  - Kreditkarten sind eigene Agenten:
    `amazon_visa` laeuft stuendlich, `tfbank` wegen SMS-TAN/Portal-Login nur
    alle 3 Stunden.
  - Der normale Bankkonten-Agent darf nur `erste,revolut,paypal` lesen und darf
    `bank99`/`n26` nicht als fehlend oder veraltet markieren.
  - Die limitierten Agenten schreiben eigene Agentstatus-Dokumente:
    `agentStatus/bank99` und `agentStatus/n26`.
- GUI-Regel:
  - Die Karte `Bankkonten` zeigt die Agenten separat:
    Sparkasse/Revolut, N26, PayPal, bank99, Amazon Visa, TF Bank.
  - Innerhalb der Karte werden `Bankkonten` und `Kreditkarten` getrennt als
    eigene ausklappbare Gruppen dargestellt.
  - Beide Gruppen bleiben Teil des gemeinsamen Finanzwerts, aber jede Zeile
    zeigt ihren eigenen Status, Zeitstempel und die letzten Umsaetze.
  - Agenten werden bei Bankkonten/Kreditkarten direkt in der jeweiligen
    Konto-/Kreditkartenzeile angezeigt, nicht als separate Agent-Kacheln.
  - Wenn der zustaendige Agent `WARNUNG` oder `FEHLER` meldet, darf die
    Kontozeile nicht `OK` anzeigen. Beispiel: TF Bank mit wartender SMS-TAN
    zeigt `Wartet TAN`; bank99 mit Tageslimit zeigt `Letzter Stand`/Warnung.
  - Wenn ein Konto einen erwarteten Agenten hat, aber noch kein
    `agentStatus`-Dokument existiert, zeigt die Zeile `Kein Status` statt
    `OK`.
  - Der sichtbare `Update`-Wert muss Uhrzeit enthalten, wenn ein echter
    Abruf-/Datenzeitpunkt vorhanden ist. Reine Stichtagsdaten sind nur
    Rueckfallwerte.
- Launchd-Regel:
  - `com.niklas.finanztool.bank-accounts`:
    stuendlich, `--banks=erste,revolut,paypal`.
  - `com.niklas.finanztool.bank99`:
    06:00 und 16:00, `--banks=bank99 --allow-limited-bank-read`.
    Kein `RunAtLoad` und kein Installer-Kickstart, damit kein zusaetzlicher
    Abruf das Tageslimit verbraucht.
  - `com.niklas.finanztool.n26`:
    06:00 und 16:00, `--banks=n26 --allow-limited-bank-read`.
    Kein `RunAtLoad` und kein Installer-Kickstart, damit kein zusaetzlicher
    Abruf das Tageslimit verbraucht.
  - `com.niklas.finanztool.amazon-visa`:
    stuendlich.
  - `com.niklas.finanztool.tfbank`:
    alle 3 Stunden (`StartInterval=10800`).

## 2026-06-27 TF Bank TAN-Fix

- Ursache:
  - Der TF-Bank-Agent lief per LaunchAgent headless ohne TAN.
  - Sobald TF Bank eine SMS-TAN verlangte, schrieb der Agent `WAITING_TAN`
    und beendete den Browser. Der SMS-Code kam danach zwar am Mac an, aber
    es gab keinen aktiven Login-Prozess mehr, der den Code verwenden konnte.
  - Direkter Zugriff auf `~/Library/Messages/chat.db` ist auf diesem Mac aus
    der Shell blockiert (`authorization denied`).
- Fix:
  - `sync-tfbank-local.mjs` wartet bei TAN-Abfrage jetzt bis zu 300 Sekunden
    auf eine neue TAN.
  - Primaere Quelle ist die lokale macOS-Nachrichten-App:
    `automation/src/read-messages-tan.swift` liest die sichtbaren TF-Bank-SMS
    ueber die native Accessibility-API.
  - Der Agent merkt sich den letzten sichtbaren Code vor dem Login und
    akzeptiert danach nur einen neuen Code. Dadurch wird kein alter TAN-Code
    wiederverwendet.
  - Fallback bleibt `~/.finanztool/tfbank-tan.txt`; die Datei enthaelt nur den
    Code und wird nach erfolgreichem Lesen sofort geloescht.
  - Alternativ bleiben `--tan=CODE` und `--tan-stdin` moeglich.
  - Nach erfolgreichem Saldoabruf loggt sich der Agent standardmaessig aus
    TF Bank aus. Debug-Ausnahme: `--no-logout`.
- Verifikation:
  - Vier echte Testlaeufe am 2026-06-27 erfolgreich.
  - Test 1 und 2: TAN manuell aus Messages gelesen und per TAN-Datei in den
    wartenden Agenten gespeist; jeweils Login, Snapshot und Logout `OK`.
  - Test 3 und 4: TAN automatisch ueber
    `read-messages-tan.swift` aus Messages gelesen; jeweils Login, Snapshot
    und Logout `OK`.
  - `agentStatus/tfbank=OK`.
  - TF Bank Kreditkarte aktualisiert:
    Saldo `-256,39 EUR`, Kreditlinie `6.000,00 EUR`, verfuegbar
    `5.743,61 EUR`.
  - Letzter verifizierter Import: `portal_tfbank_20260627124259`.
- Update 2026-06-27:
  - TF-Bank-Intervall von 1h auf 3h geaendert, um unnoetige SMS-TAN-Laeufe zu
    reduzieren.
  - Aktiver LaunchAgent auf dem Mac Studio neu geladen:
    `run interval = 10800 seconds`.
  - Login-Robustheit verbessert: Nach Login/TAN wartet der Agent laenger auf
    echten Portal-/Dashboardtext und faellt bei kurz leerem Portalzustand nicht
    sofort mit `Sichtbarer Zustand: ` aus.
  - Verifizierter Lauf nach Reload:
    `portal_tfbank_20260627144047`, Saldo `-256,39 EUR`, Kreditlinie
    `6.000,00 EUR`, verfuegbar `5.743,61 EUR`, Logout `OK`.
- Update 2026-06-27, TAN-Retry-Regel:
  - Wenn TF Bank beim Login aus TAN-Gruenden scheitert, startet
    `sync-tfbank-local.mjs` den kompletten Browser-/Login-Lauf neu.
  - TAN-Gruende sind z. B. fehlende, abgelaufene, ungueltige oder vom Portal
    nicht bestaetigte SMS-TANs sowie haengende Einmalpasswort-Schritte.
  - Standard: maximal 5 komplette TAN-Login-Versuche, danach erst
    `TAN_LOGIN_FAILED` und Agentstatus `FEHLER`.
  - Konfiguration: `TFBANK_TAN_LOGIN_ATTEMPTS` oder
    `--tan-login-attempts=5`.

## 2026-06-27 Bankkonten Kartenstatus und bank99 Label

- GUI-Regel nachgezogen:
  - Die Karte `Bankkonten` darf nur `OK` zeigen, wenn alle sichtbaren
    Bankkonten/Kreditkarten und deren zuständige Agenten `OK` sind.
  - Hat ein Unterkonto `Kein Status`, `Letzter Stand`, `Wartet TAN`,
    `Warnung` oder `Fehler`, wird dieser Zustand auf die Kartenebene
    hochgezogen.
  - Die Kartenmeldung nennt den ersten betroffenen Eintrag, damit sofort klar
    ist, welches Konto Aufmerksamkeit braucht.
- bank99:
  - Technische Provider-Namen wie `bank99:<uuid>` dürfen nicht mehr in der GUI
    erscheinen.
  - `sync-sparkasse-george-local.mjs`, die Bankkonten-Summary und die React-GUI
    normalisieren diesen Fall auf `bank99 Konto`.
  - Bestehende Firestore-Dokumente wurden ohne neuen bank99-API-Abruf
    bereinigt: `sourceAccounts`, `sourcePositions` und
    `sourceSummaries/bank_accounts.accounts`.
- TF Bank SMS-TAN:
  - Primaerer Pfad ist jetzt die automatische TAN-Erkennung ueber die
    macOS-Accessibility-API von Messages (`read-messages-tan.swift`).
  - Der Datei-/stdin-/Parameter-Pfad bleibt als Fallback erhalten.
  - Wenn TF Bank künftig erneut eine SMS-TAN verlangt und kein Code geliefert
    wird, muss die Kontozeile `Wartet TAN`/Warnung zeigen; die Karte darf
    nicht `OK` anzeigen.

## 2026-06-27 Bankkonten Gruppenkopf und TF-Bank-TAN-Status

- GUI-Regel erweitert:
  - Die ausklappbaren Gruppen `Bankkonten` und `Kreditkarten` zeigen jetzt
    jeweils einen eigenen Status-Badge.
  - Wenn nur eine Kreditkarte betroffen ist, muss die Warnung direkt am
    Gruppenkopf `Kreditkarten` sichtbar sein, nicht nur an der Gesamtkarte.
- TF Bank:
  - Historische Ursache fuer `WARNUNG` trotz vorhandener Werte: Ein
    Agentlauf brauchte eine SMS-TAN und konnte ohne bereitgestellten Code
    nicht erfolgreich abschliessen.
  - Das ist kein Bewertungsfehler: Der letzte gueltige TF-Bank-Stand bleibt in
    der DB sichtbar, aber der letzte Abrufversuch ist nicht erfolgreich.
  - `sync-tfbank-local.mjs` erhaelt bei TAN-Warnungen kuenftig
    `lastAgentSuccessAt`/`lastSuccessAt` aus dem letzten erfolgreichen Lauf,
    statt diese Zeitstempel zu verlieren.
  - Seit der TAN-Automatisierung am 2026-06-27 waren zwei automatische
    Messages-TAN-Laeufe erfolgreich; aktueller Zielstatus fuer TF Bank ist
    wieder `OK`.

## 2026-06-27 UI-Zustand, Postfach und EquatePlus mobil

- Entscheidung:
  - Ausklappzustaende duerfen nicht mehr nur im Browser oder durch
    `localStorage` bestimmt werden.
  - Die App speichert den persoenlichen UI-Zustand in
    `uiPreferences/portfolio_overview.expandedSections`.
  - Persistiert werden:
    - Depotkarten offen/geschlossen
    - Dokumenten-Postfach offen/geschlossen
    - verarbeitete Dokumente/Archiv offen/geschlossen
    - Bankkonten- und Kreditkarten-Gruppen
    - einzelne Bankkonto-/Kreditkartenzeilen
    - Ginmon-Depotzeilen
    - VBV-Kontoinformation
    - Positionsdetails je Quelle
- GUI-Regel:
  - iPhone-15-Breite ist eine Pflichtansicht.
  - Das Dokumenten-Postfach muss auf schmaler Breite ohne horizontales
    Ausbrechen funktionieren; Aktionsbuttons werden als Touch-taugliches
    Raster umbrochen.
  - EquatePlus bleibt vorerst eine manuelle Novartis-Position, aber die Eingabe
    fuer Anteile und Einstandswert EUR muss auf iPhone einspaltig, lesbar und
    ohne iOS-Eingabezoom bedienbar sein.
  - Bankkonten/Kreditkarten duerfen auf iPhone nicht wie eine breite Tabelle
    wirken. Die geschlossene Zeile zeigt Konto, Status, Geldstand,
    Kreditlinie und Verfuegbar; Agentenlauf, Update, letzter Umsatz und
    Kontonummer liegen im aufgeklappten Detailbereich.
  - Positionslisten werden auf iPhone nicht mehr als breite Tabelle
    dargestellt, sondern als kompakte ausklappbare Positionskarten.
  - Die geschlossene mobile Positionszeile zeigt Name, Wert, G/V, Heute und
    den aktuellen Kurs. Das Kursdatum steht bewusst nur im aufgeklappten
    Detailbereich, weil der Statuspunkt der Zeile die Kursguete signalisiert.
  - Aufgeklappte mobile Positionsdetails werden ebenfalls ueber
    `uiPreferences/portfolio_overview.expandedSections` gespeichert.
- Umsetzung:
  - `app/src/firebase/sourceSummaries.ts` erhaelt
    `loadUiPreferences()` und `saveUiPreferences()`.
  - `firestore.rules` erlaubt dem Owner Lese-/Schreibzugriff auf
    `uiPreferences/portfolio_overview`.
  - Die alte lokale Source-Card-Collapse-Liste und der neue lokale
    `finanztool-expanded-sections` Fallback werden beim Laden gelesen.
  - Firestore ist die fuehrende UI-State-Quelle, sobald die neue Regel
    deployed ist. Bis dahin bleibt der UI-Zustand lokal stabil und blockiert
    den Login/Datenload nicht.
  - Native `details`-Defaultzustaende werden beim ersten Rendern nicht mehr
    als echte Nutzerentscheidung gespeichert; gespeichert wird nur, wenn sich
    der Zustand wirklich aendert.
  - `docs/firestore_data_contract.md` dokumentiert die Regel dauerhaft.
- Verifikation:
  - `npm --prefix app run build` erfolgreich.
  - Chrome-Check 2026-06-27: Google-Login war funktionsfaehig; App zeigte
    `Firestore-Daten geladen`, keinen Login-Button und keine frischen
    Console-Fehler nach Reload.
  - Befund: Vor dem Fallback schrieb die App sofort nach Login nach
    `uiPreferences/portfolio_overview`; produktive Firestore-Regeln kannten
    diese Collection noch nicht und meldeten `Missing or insufficient
    permissions`. Das sah wie ein Loginfehler aus, war aber ein
    Rechte-/Deploy-Stand fuer die neue UI-State-Collection.

## 2026-06-27 Capital.com Wartungsstand

- Capital.com bleibt vorerst zurueckgestellt.
- Aktueller Befund: Der Login/API-Test war vermutlich durch Wartungsarbeiten
  bzw. einen instabilen Portalzustand blockiert.
- Wichtig: Die API-Integration gilt deshalb nicht als fachlich defekt. Beim
  naechsten Capital.com-Versuch zuerst Wartungsende/Portalzustand pruefen und
  erst danach API-Key/Secrets als Fehlerursache bewerten.
- Falls nach der Wartung weiterhin reproduzierbar `401 error.invalid.api.key`
  kommt, dann neuen Capital.com-API-Key erzeugen und mit
  `npm --prefix automation run setup:capitalcom` lokal speichern.
- Nachpruefung 2026-06-27 22:07 CEST:
  - Capital.com ist wieder erreichbar.
  - `npm --prefix automation run check:capitalcom` liefert `VERIFIED` fuer
    das Live-Konto `EUR`, 0 EUR Cash und 0 offene Positionen.
  - `npm --prefix automation run import:capitalcom:local` ist mit
    `CAPITALCOM_HISTORY_OVERLAP_DAYS=0` erfolgreich und setzt den
    Capital.com-Agentstatus wieder auf `OK`.
  - Befund: `/history/activity` akzeptiert bei diesem Konto kein 2-Tage-
    Fenster (`error.invalid.daterange`). Wenn Capital.com reaktiviert wird,
    muss der Agent das Activity-Fenster enger halten oder Activity-Warnungen
    bei 0 Positionen/0 Kontowert anders bewerten.
  - Umsetzung: Default in `import-capitalcom-local.mjs` auf
    `CAPITALCOM_HISTORY_DAYS=1` und `CAPITALCOM_HISTORY_OVERLAP_DAYS=0`
    gesetzt; Import und Health-Sync laufen damit ohne Capital.com-Alert.
  - Schema-Pruefung alter 2023-Historie:
    - Read-only Monatsabrufe 2023 lieferten 105 History-Transaktionen.
    - Inhalt: 104 Gold-Zeilen und 1 Korrektur ohne Instrument.
    - Typen: 50 `TRADE`, 54 `SWAP`, 1 `TRADE_CORRECTION`.
    - Capital.com speichert den Geldbetrag in diesen Zeilen im Feld `size`,
      nicht in `amount`.
    - `SWAP` mit `note=Overnight fee` wird als Finanzierungskosten-Ereignis
      modelliert.
    - `TRADE` mit `note=Trade closed` wird als Ledger-Kategorie
      `realized_pnl` gespeichert. Positive und negative realisierte
      Gewinne/Verluste bleiben damit auswertbar, werden aber bewusst nicht als
      Brokerkosten vermischt.
    - Instrumente erhalten einen stabilen `instrumentId`, z. B.
      `capitalcom_gold`.

## 2026-06-27 GUI-Regel zentrale Warnungen

- Die zentrale Kachel `Warnungen` zeigt den vollen Health-Stand aus
  `systemHealth/current`.
- Wenn Agenten, Portale oder APIs nicht funktionieren, ist das operativ
  relevant und muss oben als Fehler sichtbar bleiben. Das gilt auch bei
  Wartung, z. B. Capital.com.
- Health-Regel: Agentstatus ungleich `OK` ist ein Fehler, ausser `RUNNING`
  als laufender Zwischenzustand. Fehlende oder ueberfaellige Agentstatus sind
  ebenfalls Fehler.
- `RUNNING` darf in der zentralen Health-Kachel nicht als Warnung gezaehlt
  werden. Der laufende Zustand gehoert in die jeweilige Agent-/Quellenkarte;
  oben zaehlen nur echte Fehler und fachliche Warnungen.
- Karten-Regel: Diese Health-Regel muss auch in den Depot-, Bankkonto-,
  Kreditkarten- und Agentenkarten gelten. Ein operatives Agent/API-Problem darf
  in der Karte nicht als `Warnung` erscheinen, wenn es oben als `Fehler`
  gezaehlt wird.
- Bankkonto-/Kreditkarten-Unterquellen bekommen ein generisches Feld
  `agentStatusId`. Health und GUI muessen zuerst dieses Feld verwenden. Dadurch
  werden fehlende oder fehlerhafte Unterquellen-Agenten dynamisch erkannt, z. B.
  `bank99 Konto: bank99 hat keinen Agentstatus`, statt als hart codierte
  Sonderwarnung in der Karte zu entstehen.
- Nicht klassifizierte Dokumente sind ebenfalls Warnungen. Oben reicht eine
  aggregierte Warnung, die Detailbearbeitung liegt im Dokumenten-Postfach.
- `Aktive Quellen` zaehlt Bankkonten und Kreditkarten als eigene Quellen, nicht
  nur die Sammelkarte `bank_accounts`.
- Aktiv bedeutet in dieser Kachel: Die integrierte Quelle ist operativ gesund
  nutzbar (`OK`) und nicht blockiert. Der aktuelle Wert ist dafuer nicht
  entscheidend. 0-EUR-Quellen wie Capital.com ohne offene Positionen oder
  Amazon Visa ohne aktuellen Saldo zaehlen aktiv, sobald ihr Agent/API-Status
  gesund ist. Die Kachel ist damit eine Quellen-/Health-Abdeckung, keine
  Wertabdeckung.
- Operative Health-Fehler einer Quelle muessen in die Quellenzaehlung
  einfliessen, auch wenn die Depotkarte aus dem letzten erfolgreichen Snapshot
  noch Daten anzeigen kann. Beispiel: Capital.com kann 0 EUR und letzte Daten
  anzeigen, ist aber nicht aktiv, wenn der Agent veraltet ist.
- Mehrere Fehler derselben Quelle zaehlen im Systemstatus als mehrere
  Fehlermeldungen, fuer `Aktive Quellen` aber nur als eine inaktive Quelle.
  Beispiel 2026-06-28: `tfbank` hatte `Agent FEHLER` und `stale_agent_tfbank`,
  zaehlt aber nur einmal gegen die Quellenabdeckung.
- Reparierbare Fehler/Warnungen im zentralen Systemstatus bekommen eine
  direkte Aktion, wenn ein sicherer Automationsbefehl existiert:
  Trade Republic startet den Portal-Refresh, TF Bank den TF-Bank-Agenten und
  Capital.com den Capital-Agenten.
- Dokumentwarnungen im Health-Header muessen knapp bleiben, z. B.
  `9 unbekannte Dokumente im Postfach.`. Die konkrete Liste und Details
  gehoeren ins Dokumenten-Postfach.
- Die Systemstatus-Kachel zeigt alle zentralen Health-Alerts und verwendet
  dafuer einen internen Scrollbereich, damit mehrere Fehler/Warnungen nicht
  abgeschnitten werden.
- Eingeklappte Depotkarten zeigen den Status nur einmal rechts oben. Es gibt
  keine eigene kompakte `Fehler`-Spalte; Detailmeldungen gehoeren in den
  ausgeklappten Kartenbereich und in die zentrale Systemstatus-Kachel.
- Eingeklappte Depotkarten platzieren die Kernzahlen direkt in der
  Kopfzeile neben dem Depotnamen; lange Beschreibungen bleiben dort
  ausgeblendet.
- In eingeklappten Depotkarten muss der Depotname lesbar bleiben. Die
  Kennzahlenzeile startet deshalb erst nach einer ausreichend breiten
  Namensspalte; `Depotwert` und `G/V` duerfen moderat nach rechts ruecken,
  ohne wieder grosse Leerflaechen bis zum Statusbereich zu erzeugen.
- GUI-Pruefregel: Layout-, Portal- und Login-Checks immer in Google Chrome mit
  dem echten Nutzerprofil pruefen, nicht im eingebauten Codex-Browser, ausser
  der Nutzer fordert den eingebauten Browser ausdruecklich an.
- Die Desktop-Spalten der eingeklappten Depotkarten sind feste gemeinsame
  Tracks. Der Statusbereich rechts reserviert immer dieselbe Breite, damit
  `OK` und `Fehler` die `Update`-Spalte nicht verschieben. `Heute` bleibt
  bewusst schmal; `Update` steht direkt daneben.
- Die kompakten Kennzahlen in eingeklappten Depotkarten sollen die verfuegbare
  Breite angemessen nutzen: kein grosser leerer Bereich zwischen `Update` und
  Status, aber `Depotwert` darf nicht wieder zu weit nach rechts rutschen.
- In den kompakten Metriken `G/V` und `Heute` steht der Prozentwert klein
  direkt neben dem Label; darunter steht nur der absolute Euro-Betrag. Dadurch
  bleiben die Werte ruhiger und schmaler.
- Auf iPhone-/Mobile-Breite werden die Kernzahlen zweispaltig angeordnet:
  oben `Depotwert` und `G/V`, darunter `Heute` und `Update`.
- Neben `Depotuebersicht` gibt es eine Suche. Sie filtert die Quellen nicht
  weg, sondern hebt passende Depotkarten und Positionszeilen hervor. Ist eine
  Depotkarte eingeklappt, zeigt sie eine Trefferzahl, damit Treffer in
  verborgenen Positionen sichtbar bleiben.
- Die Depot-Reihenfolge ist im Bearbeitungsmodus per Hoch-/Runter-Buttons
  veraenderbar. Die Reihenfolge wird lokal und in
  `uiPreferences/portfolio_overview.sourceOrder` gespeichert, damit Mac Studio
  und MacBook denselben GUI-Stand sehen.
- Positionslisten muessen sortierbare Tabellenkoepfe haben. Die Sortierung
  gilt fuer Desktop-Tabellen und mobile Positionskarten gleichermassen.
- Dokumenten-Postfach und sonstige GUI-Struktur bleiben fuer den
  Dashboard-Start unveraendert.

## 2026-06-27 Bankkonten Shared-Agent Fehlerzuordnung

- Fehler/Warnungen eines gemeinsamen Agenten duerfen nicht pauschal auf alle
  Unterkonten vererbt werden. Beispiel: `agentStatus/bank_accounts` kann
  gleichzeitig Erste/Sparkasse, Revolut, N26 und PayPal betreffen; ein
  `N26: 429 Too many requests` darf dann nur in der N26-Zeile erscheinen.
- Die GUI ordnet bankbezogene Agent-Hinweise ueber `bank`, `bankKey`,
  `providerSource`, `accountId`, `providerAccountId`, `label` oder
  `accountLabel` der passenden Unterquelle zu.
- Dedizierte Agenten wie `bank99`, `amazon_visa` und `tfbank` gelten direkt
  fuer ihre jeweilige Konto-/Kreditkartenzeile.
- Aktueller Chrome-Check:
  - `bank99 Konto`: Fehler `bank99: Tageslimit 4 Abrufe erreicht`
  - `Erste/Sparkasse Konto`: OK
  - `N26 Konto`: Fehler `Enable Banking API Fehler 429: Too many requests`
  - `PayPal Konto`: OK
  - `Revolut Konto`: OK
  - `Amazon Visa`: OK
  - `TF Bank Kreditkarte`: Fehler `TAN-Login nach 5/5 Versuchen fehlgeschlagen`
- TF Bank haengt aktuell nicht als Prozess. Der LaunchAgent ist beendet
  (`not running`, letzter Exit-Code `1`) und hat nach den definierten
  maximal 5 TAN-Login-Versuchen korrekt einen Fehler geschrieben. Der letzte
  erfolgreiche Stand bleibt sichtbar.
- Der TAN-Warteblock wurde von 300 Sekunden auf 90 Sekunden pro Versuch
  reduziert. Bei 5 Versuchen sind das maximal ca. 7,5 Minuten statt 25 Minuten;
  danach wird ein klarer Fehler gesetzt, statt lange wie ein haengender Agent
  zu wirken.

## 2026-06-27 TF Bank TAN-Debug und Stabilitaetsbefund

- TF-Bank-SMS-Text ist laut Screenshot stabil:
  `Ihr TF Bank Bestätigungscode ist 123456`.
- Debug installiert:
  - Lauf-Debug: `automation/runtime/tfbank-debug.ndjson`
  - Lesbarer Befund: `npm --prefix automation run debug:tfbank`
  - Rohlog: `npm --prefix automation run debug:tfbank:raw`
  - Messages-UI-Test: `npm --prefix automation run debug:tfbank:messages`
  - Messages-DB-Test: `npm --prefix automation run debug:tfbank:messages-db`
- Der lesbare Debug zeigt jetzt ohne Rohlog-Lesen:
  - letzten Laufstatus
  - ob Messages-DB blockiert ist
  - ob Messages-UI eine TAN sieht
  - ob eine TAN eingetippt wurde
  - ob das Portal die TAN abgelehnt hat
  - naechste konkrete Diagnosemassnahme
- TAN-Codes werden im Debug maskiert, z. B. `****17`; vollstaendige TANs werden
  nicht dauerhaft ins Debug-Log geschrieben.
- Der Agent protokolliert jetzt:
  - Startparameter
  - ob Messages/DB eine TAN erkannt hat
  - alte vs. neue TAN
  - ob der Code eingetippt wurde
  - Portalantwort, z. B. `Einmalpasswort aus SMS ungültig`
  - finalen Abbruchgrund
- Wichtiges Verhalten:
  - Wenn gar keine neue TAN erkannt wird, startet der Agent nicht mehr 5-mal
    blind neue Logins/SMS. Er bricht nach dem Wartefenster mit klarem Fehler
    ab.
  - 5 TAN-Versuche gelten nur noch fuer den Fall, dass eine TAN erkannt und
    vom Portal abgelehnt wird.
- Neuer Browsermodus:
  - TF Bank nutzt standardmaessig ein frisches Browserprofil pro Versuch, damit
    alte Cookies/Session-Daten keinen OTP-Flow kaputt machen.
  - Rueckfall auf altes Profil nur mit `--reuse-browser-profile` oder
    `TFBANK_REUSE_BROWSER_PROFILE=1`.
- Aktueller technischer Befund:
  - Messages-DB-Zugriff funktioniert nach Full-Disk-Access-Freigabe.
  - Erfolgreicher Testlauf 2026-06-27: TAN aus Messages-DB gelesen,
    Login mit 1 Versuch, Saldo geschrieben, Logout bestaetigt.
- Optimierter Betrieb ab 2026-06-27:
  - Primaerer TAN-Weg ist nur noch `~/Library/Messages/chat.db`.
  - Messages-UI-Fallback ist dauerhaft deaktiviert. Der Agent darf kein
    Messages-Fenster mehr oeffnen oder per UI auslesen, weil die App
    geschlossen sein kann und UI-Fallback zu instabil ist.
  - Erlaubte TAN-Wege sind nur Messages-Datenbank oder die TAN-Datei.
  - TAN-Wartefenster: 60 Sekunden.
  - TAN-Polling: 1000 ms.
  - TF-Bank-LaunchAgent hat kein `RunAtLoad` mehr. Installieren oder
    Neustarten des LaunchAgents erzeugt deshalb keinen sofortigen zusaetzlichen
    SMS-TAN-Login.
  - `install-credit-card-launch-agents.sh` kickstartet Amazon Visa weiter,
    aber TF Bank bewusst nicht.
  - Wenn Messages-DB durch macOS wieder blockiert waere, wird sie fuer den
    laufenden Agentlauf deaktiviert und im Debug klar als Full-Disk-Access-
    Problem gemeldet.

## 2026-06-28 Trading 212 Integration vorbereitet

- Offizielle Trading-212-Public-API ist fuer Invest/Stocks-ISA read-only
  angebunden.
- Neuer Client: `automation/src/trading212-client.mjs`
  - Live-Base-URL `https://live.trading212.com/api/v0`
  - Demo-Base-URL `https://demo.trading212.com/api/v0`
  - Auth per API-Key/API-Secret aus macOS-Schluesselbund
  - Rate-Limit-/Retry-Handling fuer 408/429/5xx
  - direkte Endpunkte fuer Account Summary, Positionen, Orders, Dividenden und
    Cash-Transaktionen
  - CSV-Report-Endpunkte vorbereitet, damit spaeter Interest-/Kontrollreports
    mit `includeInterest` angebunden werden koennen
- Neuer Sync: `automation/src/sync-trading212-local.mjs`
  - `--snapshot-only`: aktuelle Positionen, Cash, Einstand, G/V, Kurse
  - ohne `--snapshot-only`: zusaetzlich Orders, Dividenden, Cash-Bewegungen,
    Steuern und Fees in `ledgerEntries`, `incomeEvents`, `costEvents`
  - geschlossene Positionen werden aus `sourcePositions` geloescht, bleiben
    historisch aber in Ledger/Event-Collections erhalten
  - History arbeitet inkrementell ab letztem erfolgreichen Sync mit kleinem
    Overlap
- UI-Quelle `trading212` ist angelegt und in der Depotreihenfolge enthalten.
- Health erwartet Trading 212 als Quelle, sobald echte Trading-212-Daten oder
  ein Trading-212-Agentstatus vorhanden sind.
- `sync:all`/`Alles aktualisieren` ueberspringt Trading 212, solange
  API-Key/Secret lokal fehlen; nach Secret-Einrichtung laeuft Trading 212
  automatisch in der Gesamtaktualisierung mit.
- Noch offen:
  - keine fachlichen Trading-212-Punkte offen, solange dort nur Cash liegt
  - bei neuen Positionen pruefen, ob Einstand/Kurs/Dividenden sauber in der
    GUI erscheinen

## 2026-06-28 Trading 212 aktiviert

- Neuer Trading-212-API-Key wurde im Browser erzeugt und lokal im
  macOS-Schluesselbund gespeichert:
  - `finanztool-trading212-api-key`
  - `finanztool-trading212-api-secret`
- Trading 212 akzeptiert im IP-Feld nur IPv4. Die IPv6-Adresse wurde vom
  Formular als ungueltig abgelehnt.
- Direkt-Test:
  - `/equity/account/summary`: HTTP 200
  - `/equity/positions`: HTTP 200
  - `/equity/history/dividends`: HTTP 200
- Agent-Test:
  - `npm --prefix automation run check:trading212`: OK
  - `npm --prefix automation run sync:trading212`: OK
  - aktueller Stand: `10 EUR` Cash, `0` offene Positionen, `1`
    Cash-Transaktion
- LaunchAgents installiert:
  - `com.niklas.finanztool.trading212-sync`
  - `com.niklas.finanztool.trading212-history`
- API-Besonderheit:
  - `GET /equity/history/transactions` akzeptierte `time` allein nicht und
    antwortete mit `Both or none of cursorId and time must be provided`.
  - Agent ruft Transactions deshalb ohne `time` ab und filtert lokal nach
    Lookback/letztem Sync. Bei `TRADING212_HISTORY_MAX_PAGES=3` bleibt das
    klein und stabil.

## 2026-06-28 Bankkonten Fehlerlogik korrigiert

- Operative Agent-/API-Probleme sind immer `FEHLER`, nicht `WARNUNG`.
  Das gilt auch fuer erwartbare Limits wie bank99-Tageslimit oder
  Enable-Banking-429.
- Der gemeinsame Bankkonten-Agent schreibt bei `bankErrors` oder
  `skippedBanks` jetzt `status=FEHLER`.
- Die GUI zaehlt Bankkonto-Unterquellen dynamisch:
  - echte Fehler werden als `Fehler` angezeigt
  - reine Warnungen bleiben `Hinweise`
  - gemischte Gruppen zeigen beides getrennt
- PayPal-Fehler `Enable Banking API Fehler 422: The value of a end_time should
  not be future date` war ein Zeitfensterproblem kurz nach Mitternacht:
  Wiener Datum war bereits der neue Tag, Enable Banking bewertete den API-
  Endtag aber noch als Zukunft. Der Transaktions-Endtag wird deshalb fuer die
  API UTC-sicher mit kleinem Puffer gebildet.
- Verifizierter Lauf:
  - `sync:bank-accounts`: `status=FEHLER` nur wegen N26 429
  - PayPal: 5 Umsaetze geprueft, kein PayPal-Fehler mehr
  - `sync:health`: 2 Fehler, 0 Warnungen
  - aktuelle Fehler: N26 `Too many requests`, bank99 `Tageslimit 4 Abrufe
    erreicht`

## 2026-06-28 Bankkonten Limit-Schutz N26 und bank99

- N26 und bank99 sind jetzt strikt limitierte Bankquellen.
- Beide duerfen nur noch durch dedizierte LaunchAgents mit dem expliziten
  Schalter `--allow-limited-bank-read` gelesen werden.
- Normale Aktualisierungen, `sync:all`, der GUI-Button `Alles aktualisieren`
  und Standard-Testlaeufe lesen diese beiden Quellen nicht mehr.
- Zeitplan:
  - bank99: 06:00 und 16:00
  - N26: 06:00 und 16:00
- Tageslimit im Script:
  - bank99: maximal 2 Abrufe pro Wiener Kalendertag
  - N26: maximal 2 Abrufe pro Wiener Kalendertag
- Normale Bankkonten bleiben stuendlich:
  - Erste/Sparkasse
  - Revolut
  - PayPal
- N26 hat jetzt einen eigenen Agentstatus `agentStatus/n26`; die GUI laedt
  diesen Status separat wie `bank99`, `amazon_visa` und `tfbank`.
- Anzeige-Regel:
  - `Update` soll den letzten echten Bankdatenstand zeigen
    (`sourceDataUpdatedAt` oder `lastDataSuccessAt`), nicht einen reinen
    Skip-/Limit-Zeitpunkt.
  - `Agent-Lauf` zeigt separat, wann der Agent zuletzt gelaufen ist.
- Verifizierter Stand:
  - aktive Plists fuer bank99 und N26 enthalten nur `06:00` und `16:00`
  - beide Plists haben kein `RunAtLoad`
  - Installer kickstartet nur `bank_accounts`, nicht bank99/N26
  - Trockentest ohne `--allow-limited-bank-read` sperrt bank99/N26 ohne
    API-Abruf und ohne Firestore-Schreibzugriff
  - N26-Agentstatus wurde einmalig ohne API-Abruf initialisiert, damit die
    GUI/Health den neuen separaten Agenten kennt; der erste echte Datenabruf
    erfolgt erst beim naechsten 06:00-/16:00-Lauf.
  - Korrektur nach Screenshot-Pruefung:
    - `agentStatusIdForBanks()` muss fuer einen einzelnen N26-Lauf
      `agentStatus/n26` schreiben, nicht `agentStatus/bank_accounts`.
    - `Agent-Lauf` darf in der GUI nicht auf `updatedAt` zurueckfallen.
      Sonst sieht ein Setup-/Metadaten-Schreibzeitpunkt wie ein echter
      Agentlauf aus.
    - Source-Accounts/Positions erhalten `lastDataSuccessAt`, sobald eine Bank
      erfolgreich gelesen wurde. Bestehende N26-/bank99-Zeilen wurden ohne
      API-Abruf bereinigt:
      - bank99 letzter echter Datenabruf: `2026-06-27T05:05:21.112Z`
      - N26 letzter echter Datenabruf: `2026-06-27T20:38:05.897Z`
    - Lokale Runtime-Datei
      `automation/runtime/enable-banking-rate-limits.json` wurde auf
      `maxReadsPerDay=2` fuer bank99 bereinigt; der alte Zaehlerstand bleibt
      absichtlich bestehen, damit kein zusaetzlicher Abruf ausgeloest wird.
  - `sync:health` danach: 2 Fehler, 0 Warnungen
    - bank99: Tageslimit erreicht
    - N26: separater limitierter Agent wartet auf ersten geplanten Lauf

## 2026-06-28 Dashboard-Datenvertrag gestartet

- Vor den eigentlichen Dashboards gibt es jetzt einen expliziten
  Dashboard-Datenvertrag in `app/src/dashboard/dashboardSources.ts`.
- Zweck:
  - Jede Quelle wird fuer Dashboards einheitlich als verwertbar,
    leer-akzeptiert, nicht-blockierend auffaellig, blockierend oder pausiert
    klassifiziert.
  - Dashboards sollen nicht direkt aus einzelnen Sonderfaellen in `App.tsx`
    heraus gebaut werden, sondern aus dieser normalisierten Sicht.
- Fachliche Regel:
  - Standard-Dashboards starten mit den Kernquellen:
    Flatex, Trade Republic, Ginmon, Intergold, Bitget, VBV, EquatePlus und
    Bankkonten.
  - Capital.com und Trading 212 duerfen leer oder pausiert sein und blockieren
    die Standard-Dashboards nicht.
  - bank99 und N26 bleiben sichtbar, sind aber wegen niedrigem Wert und
    strengem Abruflimit nicht dashboard-blockierend.
  - Operative Fehler bleiben trotzdem in der normalen Fehlerlogik sichtbar.
- In der App gibt es eine kompakte Anzeige `Dashboard-Datenbasis`, damit vor
  dem Bau der Dashboards klar ist, ob die Kernquellen verwertbar sind.
- Korrektur:
  - Die Quellenabdeckung soll im ersten Dashboard selbst sichtbar sein, nicht
    als separate technische Vorpruefung.
  - Die Quellenzaehlung bleibt in der bestehenden oberen Systemkachel
    `Aktive Quellen`.
  - Das erste Dashboard zeigt keine Quellenchips mehr, weil dieselbe
    Information direkt darunter in der Depotuebersicht sichtbar ist.
  - Der Unterschied zwischen `Kernquelle blockiert` und `Quelle leer/optional`
    bleibt im Datenvertrag erhalten, wird aber nicht als kleinere sichtbare
    Quellenzahl missverstanden.

## 2026-06-28 Vermoegens-Cockpit Punkt 2

- In der oberen Karte `Erfasster Wert` gibt es jetzt eine kompakte
  Aggregation ueber alle Quellen:
  - Depotwerte
  - Cash
  - Kreditlinien
  - genutzter Kredit
  - freies Cash
- Die Summen lesen aus der bestehenden Depotkarten-Logik:
  - `getSourceDepotDisplayValue()` fuer Depotwerte inklusive Flatex-Kreditlogik
  - `cashValue` fuer Cash
  - `creditLineEstimate` fuer Kreditlinien
  - negativer Flatex-Cash plus negative Kreditkartenwerte fuer genutzten Kredit
- Die Anzeige ist nur eine Aufschluesselung; `Erfasster Wert` bleibt die
  fuehrende Gesamtsumme.
- Keine Quellenchips in dieser Karte: Quellenzaehlung und Quellenliste bleiben
  in `Aktive Quellen` beziehungsweise in der Depotuebersicht.

## 2026-06-28 Warnsystem und Reparaturaktionen

- `Aktive Quellen` ist eine eindeutige Quellenzaehlung:
  - 9 Depot-/Brokerquellen ohne `bank_accounts`
  - 7 einzelne Bank-/Kreditkartenquellen
  - Summe aktuell 16 Quellen
- Operative Health-Fehler werden auf die betroffene Quelle gemappt. Mehrere
  Fehler fuer dieselbe Quelle zaehlen als mehrere Fehler im Systemstatus, aber
  nur einmal gegen `Aktive Quellen`.
- Aktueller Health-Stand nach Pruefung:
  - vor Capital-Reaktivierung: 3 Fehler, 2 betroffene Quellen
    (`tfbank`, `capitalcom`), erwartete Anzeige `14/16`
  - nach Capital-Reaktivierung: 2 Fehler, 1 betroffene Quelle (`tfbank`),
    erwartete Anzeige `15/16`
- Die Depotkarten ziehen den Quellenstatus jetzt aus `systemHealth/current`
  mit. Dadurch darf Capital.com nicht mehr oben rot und in der Karte gruen
  erscheinen.
- Reparierbare Health-Meldungen erhalten einen Button in der Warnliste:
  - Trade Republic: Portal-Refresh
  - TF Bank: TF-Bank-Agent manuell starten
  - Capital.com: Capital-Agent manuell starten
- TF Bank:
  - Debug bestaetigt: SMS-Codes werden erkannt und eingetippt, aber das Portal
    antwortet mit `Einmalpasswort aus SMS ungueltig`.
  - Der Agent merkt abgesendete TANs lokal als SHA-256-Hashes in
    `automation/runtime/tfbank-submitted-tans.json` und ignoriert bereits
    verwendete Codes bei spaeteren Laeufen. Die TAN selbst wird nicht im Klartext
    gespeichert.
  - Feste Zusatzwartezeit vor dem Absenden ist standardmaessig deaktiviert
    (`TFBANK_TAN_SETTLE_MS=0`). Die Erkennung bleibt ereignisorientiert:
    alter Code vor Login merken, danach nur neue und nicht verwendete Codes
    akzeptieren.
  - Debug-Hilfe: `npm --prefix automation run debug:tfbank`.
- Capital.com:
  - Ursache fuer stale Health war kein API-Problem, sondern ein nicht
    installierter LaunchAgent nach frueherer Zurueckstellung.
  - `com.niklas.finanztool.capitalcom-import` ist wieder installiert und
    laeuft alle 5 Minuten (`StartInterval=300`).

## 2026-06-28 Quellenzaehlung und TF-Bank-Korrektur

- Diagnosekorrektur:
  - Die fruehere Aussage, die Quellenanzeige muesse schon stimmen, war falsch:
    Es wurde der Backend-Stand geprueft, aber nicht die sichtbare Chrome-UI.
  - Sichtbarer Fehler war `12/16`, obwohl Firestore nur TF Bank als operative
    Fehlerquelle enthielt.
  - Die UI-Zaehllogik wurde daher auf eindeutige Quellen-Einheiten umgestellt:
    9 Depot-/Brokerquellen plus 7 Bank-/Kreditkartenkonten = 16 Quellen.
  - Operative Alerts aus `systemHealth/current` ziehen eine Quelle nur einmal
    ab, auch wenn mehrere Alerts dieselbe Quelle betreffen.
- Aktueller gepruefter Stand nach TF-Bank-Erfolg:
  - `systemHealth/current`: `OK`, 0 Fehler, 0 Warnungen.
  - `agentStatus/tfbank`: `OK`, letzter Erfolg 2026-06-28 17:06.
  - Erwartete Quellenanzeige nach Login/Reload: `16/16`.
- TF-Bank-Agent:
  - Ursache fuer die wiederkehrenden TAN-Probleme war sehr wahrscheinlich
    paralleler Agentenlauf: LaunchAgent, Button und Testlaeufe konnten mehrere
    Logins und damit mehrere SMS-Codes erzeugen.
  - `automation/src/sync-tfbank-local.mjs` nutzt jetzt eine harte Lauf-Sperre
    `automation/runtime/tfbank-run.lock`.
  - Wenn bereits ein TF-Bank-Lauf aktiv ist, wird kein zweiter Login gestartet,
    damit keine parallelen TANs entstehen.
  - Fehlermeldungen duerfen keinen vollstaendigen TAN-Code speichern. Bei
    TAN-Fehlern wird nur der zuletzt eingereichte TAN-Versuch maskiert
    protokolliert, z. B. `****42` plus Zeitstempel.
  - Gepruefter Testlauf:
    `TFBANK_MESSAGES_UI_FALLBACK=0 TFBANK_TAN_LOGIN_ATTEMPTS=1 ... sync-tfbank-local.mjs --write --headless`
    war erfolgreich, inklusive Messages-Datenbank, Portal-Login, Snapshot und
    Logout.
  - Nachtrag: Die installierte LaunchAgent-plist wurde ebenfalls aktualisiert.
    `~/Library/LaunchAgents/com.niklas.finanztool.tfbank.plist` enthaelt jetzt
    `TFBANK_MESSAGES_UI_FALLBACK=0`.

## 2026-06-28 Health-Refresh Button

- Oben rechts in der App gibt es einen Refresh-Button fuer den Systemstand.
- Der Button sitzt direkt neben `Firestore-Daten geladen`, nutzt denselben
  Button-Stil wie die anderen Topbar-Aktionen und zeigt nur das
  Aktualisierungssymbol.
- Ablauf:
  - schreibt `automationCommands/health_check_manual` mit Typ `health_check`
  - lokaler Command-Runner fuehrt `check-health-local.mjs --write` aus
  - App laedt Firestore-Daten neu
- danach wird die Browserseite neu geladen, damit wirklich der aktuelle
  Firestore-/Health-Stand sichtbar ist
- Der Button ist bewusst kein Full-Refresh und stoesst keine Broker-/Bank-
  Abrufe an. Er aktualisiert nur die zentrale Health- und Fehlerlogik.
- Technischer Test: `automationCommands/health_check_manual` wurde lokal auf
  `REQUESTED` gesetzt, der Command-Runner hat `check-health-local.mjs --write`
  ausgefuehrt, danach stand der Command auf `DONE` und Health war `OK`.

## 2026-06-28 Trading 212 5-Minuten-Agent

- Trading 212 ist als eigener Snapshot-Agent installiert:
  `com.niklas.finanztool.trading212-sync`.
- Der installierte LaunchAgent hat `StartInterval=300`, also alle 5 Minuten.
- History/Orders/Dividenden/Cash-Bewegungen laufen weiterhin ueber
  `com.niklas.finanztool.trading212-history` stuendlich, damit der
  5-Minuten-Lauf schnell bleibt.
- Sichtbarer Fehler `fetch failed` war ein transienter Netzwerkfehler aus dem
  API-Request, nicht ein fehlender Agent.
- `automation/src/trading212-client.mjs` retryt Netzwerkfehler jetzt bis zu 5x
  und schreibt im echten Fehlerfall eine verstaendlichere Meldung
  `Trading 212 Netzwerkfehler ...`.
- Geprueft:
  - `npm --prefix automation run sync:trading212-snapshot`: OK
  - `npm --prefix automation run sync:health`: OK, 0 Fehler, 0 Warnungen
