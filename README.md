# Finanzperformance-Tool

Persoenliches Portfolio- und Performance-Tool fuer Flatex, Trade Republic,
Ginmon, Intergold, EquatePlus, Bitget, Capital.com und VBV. Bankkonten,
Kreditkarten und Trading 212 sind als naechste Integrationen geplant.

Stand: 2026-06-26

## Ziel

Die App soll alle verfuegbaren Finanzdokumente und API-Daten in Firestore
zusammenfuehren und daraus pro Position Bestand, Einstand, Marktwert,
Gebuehren, Steuern, Gewinn/Verlust und Performance ausweisen.

## Aktueller Status

- React/Vite/Firebase-App liegt in `app/`.
- Lokaler Import-Agent liegt in `automation/`.
- Firebase-Projekt: `finanzperformance-tool`.
- Firebase Hosting ist konfiguriert fuer Site `finanzperformance-tool`.
- Firestore ist zentrale Datenbank.
- Originaldateien werden aus Google Drive gelesen und nach Import archiviert.
- Node-Version: siehe `.nvmrc` (`22`).
- Geraetewechsel und Codex-Kurzbefehle sind in
  `docs/device_workflow.md` dokumentiert.
- Wechselprobleme zwischen Mac Studio und MacBook Pro werden in
  `docs/device_switch_log.md` dokumentiert.

## Geraetewechsel

Wichtigste Datei:

```bash
docs/device_workflow.md
docs/device_switch_log.md
```

Kurzlogik:

- `ftd`: Projekt auf aktueller Maschine herunterladen/aktualisieren.
- `fts`: Projekt nur lokal speichern/committen.
- `ftu`: Projekt bauen, auf GitHub pushen und Firebase deployen.

Sicherheitslogik:

- `ftd` bricht bei lokalen Aenderungen oder offenem Merge/Rebase ab.
- `ftd --force` setzt bewusst auf GitHub-Stand zurueck und legt vorher
  Backup-Branch/Datei-Backup an.
- `ftu` pusht nur, wenn der lokale Stand `origin/main` enthaelt.
- Firebase wird erst deployed, nachdem der Push verifiziert wurde.
- `ftu` deployed bewusst nur Hosting.

Kurzbefehle pro Geraet installieren:

```bash
cd /Users/niklaskofler/Documents/finanztool
npm run ft:install
source ~/.zshrc
```

`ftd` wird als Shell-Funktion installiert. Dadurch bleibt das Terminal nach
einem erfolgreichen Download automatisch in
`/Users/niklaskofler/Documents/finanztool`. Ein reines Script koennte das
Terminal-Verzeichnis nach dem Ende nicht dauerhaft aendern.

Nach `ftd` muss Codex kurz melden, welcher Stand aktiv ist, wo am alten
Geraet aufgehoert wurde, welche naechsten Schritte geplant sind und ob
Wechselprobleme bestehen.

Das Projekt soll auf Mac Studio und MacBook Pro gleich liegen:

```bash
/Users/niklaskofler/Documents/finanztool
```

Der Pfad muss exakt so kleingeschrieben sein. Alte Checkouts wie
`/Users/niklaskofler/Documents/Finanztool` duerfen nicht mehr fuer `ftd`,
`fts` oder `ftu` verwendet werden.

## Produktiv umgesetzt

- Firestore-Live-Daten werden in der App geladen.
- Uebersicht zeigt Quellen und Einzelpositionen aus `sourcePositions`.
- Import-Agent verarbeitet vorhandene und neue Dateien aus dem Drive-Ordner.
- Importierte Dateien werden nach `02_Archiviert` verschoben.
- Duplikate werden per SHA-256 Hash erkannt.
- Raw-/Metadaten werden in Firestore dokumentiert.

### Flatex

- CSV-Import ist fachlich umgesetzt.
- Leere CSV-Header werden robust behandelt.
- Daten landen in:
  - `imports`
  - `rawDocuments`
  - `imports/{id}/rawRows`
  - `ledgerEntries`
  - `transactions`
  - `costEvents`
  - `positions`
  - `snapshots`
  - `sourcePositions`

### Trade Republic

- TransactionExport CSV wird fachlich geparst.
- Einstandswerte werden aus Trades berechnet.
- Private-Equity-Kaeufe ohne `amount`, aber mit `shares * price`, werden korrekt
  als Einstand berechnet.
- Net-Worth-PDF liefert aktuelle Positionswerte.
- Gewinn/Verlust wird pro Position berechnet.
- Aktueller Stand war unter anderem:
  - Private Equity Einstand ca. 1045.40 EUR
  - Private Equity Marktwert ca. 1089.26 EUR
  - Performance ca. +43.86 EUR / +4.20 %

### Ginmon

- PDF-/Reportdaten werden gespeichert und teilweise ausgewertet.
- Positionsdaten werden in `sourcePositions` geschrieben.
- Weitere Kosten-/Steuerdetails muessen noch vertieft extrahiert werden.

### Intergold

- Intergold-Preisimport ist vorbereitet.
- Preise werden von `https://www.intergold-edelmetalle.com/aktuelles` per
  sichtbarem Textmuster gelesen.
- Belegimport und Preisimport sind bewusst getrennt.
- Kurzfassung liegt in `docs/intergold_preisimport_kurzfassung.md`.

### EquatePlus

- Ordner ist in den Drive-Scan aufgenommen.
- Quelle ist fachlich zurueckgestellt, bis die ersten echten
  EquatePlus-Mail-Dokumente eintreffen.
- Vorher wird kein aktiver Parser/Agent gebaut, damit wir nicht anhand
  theoretischer Annahmen eine falsche Datenstruktur erzeugen.
- Sobald die erste Mail vorliegt, werden Absender, Betreff, Anhaenge,
  Dokumenttypen, Dedupe-Regeln und relevante Datenfelder analysiert.
- Erst danach werden Holdings, Transaktionen, Kosten, Steuern und
  Dokumentfakten in das kanonische Firestore-Modell integriert.

### Bitget

- Bitget-Datenbestand ist in Firestore vorhanden.
- Spot- und Earn-Positionen werden in `sourcePositions` abgebildet.
- `sourceSummaries/bitget.currentValue` und `netValue` nutzen den von Bitget
  gelieferten kontenuebergreifenden Kontowert aus `all-account-balance`,
  um mit der Bitget-App/Webansicht moeglichst deckungsgleich zu bleiben.
- Einzelpositionen bleiben trotzdem sichtbar. Wenn Bitget fuer ein Asset keinen
  eigenen Kurs liefert, bleibt die Position sichtbar, wird aber mit
  `quoteStatus=NO_BITGET_PRICE` markiert und erzeugt eine Health-Warnung.
- Sauberer Schnitt vom 2026-06-20: TRUMP, MELANIA und Positionen, die auf
  `0,00 EUR` runden, werden nicht mehr als aktuelle Portfolio-Positionen in
  `sourcePositions` geschrieben. Sie bleiben in `rawDocuments/api_bitget_latest`
  unter `rawPositions`/`excludedPositions` nachvollziehbar.
- Bitget nutzt bewusst nur Bitget als Kursquelle. Keine CoinGecko- oder
  Frankfurter-Boerse-Fallbacks fuer Bitget.
- Der Bitget-Import laeuft auf dem Mac Studio alle 5 Minuten.
- Der Bitget-Ledger-Agent laeuft auf dem Mac Studio stuendlich und schreibt
  Bewegungen, Trades, Kosten und Earn-Zinsen historisch:
  - `ledgerEntries`
  - `transactions`
  - `costEvents`
  - `incomeEvents`
  - `sourceDocumentFacts`
- Importskript ist vorhanden: `npm run import:bitget`.
- Ledger-Sync ist vorhanden: `npm run sync:bitget-ledger`.
- Datenziel:
  - `sourcePositions`
  - `sourceSummaries/bitget`
  - `imports`
  - `rawDocuments`
- Der aktuelle lokale Mac-Studio-Test vom 2026-06-20 ist erfolgreich:
  `npm run check:bitget`, `npm run import:bitget:local` und
  `npm run sync:health`.
- `imports/api_bitget_latest` und `rawDocuments/api_bitget_latest` werden bei
  jedem Lauf ueberschrieben. Der 5-Minuten-Lauf speichert also den aktuellen
  Zustand, aber keine endlose 5-Minuten-Historie.
- `rawDocuments/api_bitget_latest` enthaelt den Rohsnapshot aus Account-Info,
  Account-Balances, Earn-Assets und normalisierten Positionen.

### Capital.com

- API funktioniert.
- Live-Konto wird gelesen.
- Aktueller Stand: `0,00 EUR`, 0 offene Positionen.
- CFD-Positionen werden angezeigt, aber nicht zur Vermoegenssumme addiert.

### VBV

- VBV Vorsorgekasse ist als Summary-Quelle integriert.
- Aktueller Stand: `1.815,86 EUR`, Stichtag `2026-05-31`.
- Keine Einzelpositionen.

### Bankkonten

- Read-only Open Banking ueber Enable Banking ist aktiv.
- Quelle ist `bank_accounts` fuer Erste/Sparkasse, Revolut, bank99 und
  spaetere Bankkonten.
- Aktueller echter Kontostand wird nach Firestore geschrieben und zaehlt als
  Cash/Netto-Wert.
- Verfuegbar inkl. Kredit wird separat gespeichert und nicht als Vermoegen
  gezaehlt.
- Bank99 darf vom Agenten maximal 4-mal pro Kalendertag abgerufen werden.
- Umsaetze werden per Enable Banking idempotent in `ledgerEntries`
  gespeichert.
- Initialbestand ist vorhanden. Der normale Sync liest ab jetzt inkrementell:
  letzter gespeicherter Umsatz je Konto minus 2 Tage Sicherheitsfenster.
- Fuer historische Nachpflege gibt es `npm run sync:bank-accounts:backfill`
  mit 180 Tagen.
- Bankkosten/Steuern werden als `costEvents`, Zinsen/Bonus/Cashback als
  `incomeEvents` klassifiziert, sofern sie im Umsatztext erkennbar sind.

### Noch nicht integriert

- Bankkonten/Kreditkarten:
  - Amazon Visa
  - TF Bank Kreditkarte
  - Revolut, derzeit inaktiv
- Trading 212

## Wichtige lokale Pfade

Projekt:

```bash
/Users/niklaskofler/Documents/finanztool
```

Automation:

```bash
/Users/niklaskofler/Documents/finanztool/automation
```

Drive Originale:

```bash
/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/01_Originale
```

Drive Archiv:

```bash
/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/02_Archiviert
```

Firebase Service Account:

```bash
/Users/niklaskofler/Documents/finanztool/secrets/firebase-service-account.json
```

## Lokale Dateien, die nicht in Git sind

Diese Dateien muessen auf dem Mac Pro lokal neu angelegt oder sicher kopiert
werden:

- `app/.env.local`
- `automation/.env`
- `secrets/firebase-service-account.json`

Sie sind absichtlich per `.gitignore` ausgeschlossen.

## Setup auf neuem Mac

```bash
cd /Users/niklaskofler/Documents
git clone https://github.com/NiklasKofler/finanztool.git finanztool
cd finanztool
nvm install
nvm use
npm run install:all
```

Dann lokale Secrets/Env-Dateien anlegen.

`automation/.env` braucht mindestens:

```env
FIREBASE_PROJECT_ID=finanzperformance-tool
FIREBASE_STORAGE_BUCKET=finanzperformance-tool.firebasestorage.app
FIREBASE_SERVICE_ACCOUNT_PATH=/Users/niklaskofler/Documents/finanztool/secrets/firebase-service-account.json
DEPOT_ROOT=/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/01_Originale
PROCESS_EXISTING_ON_START=false
ENABLE_STORAGE_UPLOAD=false
ARCHIVE_IMPORTED_FILES=true
ARCHIVE_ROOT=/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/02_Archiviert
```

`app/.env.local` braucht die Firebase Web-App Konfiguration.

## Wichtige Befehle

App lokal starten:

```bash
npm run dev
```

Kurzbefehle installieren:

```bash
npm run ft:install
```

Geraete-Workflow:

```bash
ftd
fts "Commit Message"
ftu "Commit Message"
```

App bauen:

```bash
npm run build
```

Import-Agent starten:

```bash
npm run agent
```

Summaries/Backfill aus vorhandenen Dokumenten neu berechnen:

```bash
npm run backfill:summaries
```

Bitget API importieren:

```bash
cd automation
npm run import:bitget
```

Firebase deployen:

```bash
npx firebase-tools deploy --project finanzperformance-tool
```

## Firestore-Struktur

Wichtige Collections:

- `imports`: Import-Metadaten je Datei/API-Lauf
- `rawDocuments`: Rohdaten, Parser-Versionen, API-Rohkontext
- `imports/{id}/rawRows`: CSV-Zeilen je Import
- `ledgerEntries`: Konto-/Depotbewegungen normalisiert
- `transactions`: Fachliche Kauf-/Verkaufs-Transaktionen
- `costEvents`: Gebuehren und Steuern
- `sourcePositions`: aktuelle Einzelpositionen fuer die UI
- `sourceSummaries`: aggregierte Quellenwerte
- `positions`: aeltere Flatex-Positionssicht
- `snapshots`: Snapshot-Zeitpunkte

## Naechste sinnvolle Schritte

1. Weitere Bank-Sessions fuer Revolut und bank99 erzeugen.
2. Trading 212 als eigene Quelle ergaenzen.
3. Einheitliches Konto-/Depotmodell in Firestore ergaenzen, damit Broker,
   Bankkonten, Cash-Konten, Kreditkarten und Vorsorge sauber getrennt sind.
4. UI weiter ausbauen: Filter, Sortierung, Detailansicht pro Position,
   Transaktionshistorie, Kosten/Steuern je Position.
5. EquatePlus Parser erst nach Eingang der ersten echten Mail-Dokumente
   ergaenzen.
6. Ginmon Kosten-/Steuerdetails aus Reports vertiefen.
7. Intergold Belegparser und Preisbewertung sauber zusammenfuehren.

## Sicherheitsnotiz

Keine API-Secrets, Firebase-Service-Accounts oder `.env`-Dateien in Git
commiten. Falls ein API-Secret in einem Screenshot oder Chat sichtbar wurde,
den Key bei Bitget loeschen und neu erzeugen.
