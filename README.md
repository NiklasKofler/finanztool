# Finanzperformance-Tool

Persoenliches Portfolio- und Performance-Tool fuer Flatex, Trade Republic,
Ginmon, Intergold, EquatePlus und Bitget.

Stand: 2026-06-01

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
- Vorhandene PDF-Dateien wurden importiert und archiviert.
- Fachlicher Parser fuer Holdings/Transaktionen ist noch offen.

### Bitget

- Bitget API-Client ist vorbereitet.
- Importskript ist vorhanden: `npm run import:bitget`.
- Datenziel:
  - `sourcePositions`
  - `sourceSummaries/bitget`
  - `ledgerEntries`
  - `imports`
  - `rawDocuments`
- Aktueller Blocker: Bitget private API-Requests melden noch
  `sign signature error`. Ursache ist sehr wahrscheinlich ein nicht exakt
  passender API-Secret- oder Passphrase-Wert. Der Code fuer HMAC-Signatur und
  oeffentliche Marktdaten funktioniert.

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
git clone https://github.com/NiklasKofler/finanztool.git
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

1. Bitget API-Key/Passphrase/Secret final korrigieren und `npm run import:bitget`
   erfolgreich ausfuehren.
2. UI weiter ausbauen: Filter, Sortierung, Detailansicht pro Position,
   Transaktionshistorie, Kosten/Steuern je Position.
3. EquatePlus Parser fuer Holdings und Transaktionen ergaenzen.
4. Ginmon Kosten-/Steuerdetails aus Reports vertiefen.
5. Intergold Belegparser und Preisbewertung sauber zusammenfuehren.
6. Launchd-Dauerbetrieb fuer den Import-Agent auf dem Mac Pro einrichten.

## Sicherheitsnotiz

Keine API-Secrets, Firebase-Service-Accounts oder `.env`-Dateien in Git
commiten. Falls ein API-Secret in einem Screenshot oder Chat sichtbar wurde,
den Key bei Bitget loeschen und neu erzeugen.
