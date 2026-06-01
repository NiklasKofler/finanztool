# Export-Import Runbook (Mac Studio)

Dieses Dokument beschreibt den Ablauf so, dass du ihn 1:1 ausfuehren kannst.
Ziel: Dateien automatisch aus deinem Drive-Ordner einlesen und nach Firebase schreiben.

## 0) Geltungsbereich

Aktuell ist produktiv umgesetzt:

- Automatisches Erkennen neuer Dateien (`.csv`, `.pdf`) im Depot-Ordner
- Duplikat-Pruefung per Dateihash
- Schreiben nach Firestore `imports`
- Originaldatei in Firebase Storage `raw/<source>/...`
- Fachlicher Parser fuer Flatex CSV:
  - `transactions`
  - `positions`
  - `snapshots`

Noch nicht fachlich geparst:

- Trade Republic PDF/CSV
- Ginmon PDF
- Intergold PDF
- Bitget Dateien

Diese Quellen werden aktuell bereits gespeichert und geloggt, aber noch nicht voll als
Portfolio-Transaktionen verarbeitet.

## 1) Voraussetzungen (einmalig)

1. Projektordner vorhanden:

```text
/Users/niklaskofler/Documents/finanztool
```

2. Google Drive Desktop laeuft und dein Depot-Ordner ist lokal sichtbar.

3. Firebase Projekt:

```text
finanzperformance-tool
```

4. Service Account JSON wurde erzeugt.

5. Node ist ueber `.nvmrc` auf Version 22 gesetzt.

6. Firestore Database ist im Firebase-Projekt erstellt.

## 2) Pfade (muessen exakt stimmen)

- Projekt:

```text
/Users/niklaskofler/Documents/finanztool
```

- Automation:

```text
/Users/niklaskofler/Documents/finanztool/automation
```

- Service Account:

```text
/Users/niklaskofler/Documents/finanztool/secrets/firebase-service-account.json
```

- Drive Root:

```text
/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/01_Originale
```

## 3) Einmaliges Setup auf Mac Studio

### 3.1 Projekt aktualisieren

```bash
cd /Users/niklaskofler/Documents/finanztool
git pull
```

### 3.2 Node-Version aktivieren

```bash
cd /Users/niklaskofler/Documents/finanztool
nvm install
nvm use
```

Erwartung:

```text
Now using node v22...
```

### 3.3 Dependencies installieren

```bash
cd /Users/niklaskofler/Documents/finanztool
npm run install:all
```

Alternative, falls die Root-Scripts noch nicht vorhanden sind:

```bash
cd /Users/niklaskofler/Documents/finanztool/app
npm install

cd /Users/niklaskofler/Documents/finanztool/automation
npm install
```

### 3.4 Service Account JSON ablegen

Falls Ordner fehlt:

```bash
mkdir -p /Users/niklaskofler/Documents/finanztool/secrets
```

JSON-Datei muss hier liegen:

```text
/Users/niklaskofler/Documents/finanztool/secrets/firebase-service-account.json
```

### 3.5 Automation Env konfigurieren

```bash
cd /Users/niklaskofler/Documents/finanztool
cp automation/.env.example automation/.env
open -e /Users/niklaskofler/Documents/finanztool/automation/.env
```

Inhalt:

```env
FIREBASE_PROJECT_ID=finanzperformance-tool
FIREBASE_STORAGE_BUCKET=finanzperformance-tool.firebasestorage.app
FIREBASE_SERVICE_ACCOUNT_PATH=/Users/niklaskofler/Documents/finanztool/secrets/firebase-service-account.json
DEPOT_ROOT=/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/01_Originale
PROCESS_EXISTING_ON_START=false
ENABLE_STORAGE_UPLOAD=false
```

### 3.6 Drive-Pfad testen

```bash
ls -la "/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/01_Originale"
```

Wenn Fehler kommt, stimmt Pfad oder Sync nicht.

### 3.7 Firestore einmalig erstellen

Falls der Agent mit `Firebase meldet NOT_FOUND` stoppt:

1. Firebase Console oeffnen
2. Projekt `finanzperformance-tool` auswaehlen
3. Links `Firestore Database` oeffnen
4. `Datenbank erstellen` klicken
5. Modus waehlen
6. Standort waehlen
7. Erstellung abschliessen

Danach den Agent neu starten.

## 4) Tatsaechlicher Importlauf

### 4.1 Import-Agent starten

```bash
cd /Users/niklaskofler/Documents/finanztool
nvm use
npm run agent
```

Der Prozess muss laufen bleiben. Fenster offen lassen oder spaeter als `launchd` Dienst starten.

### 4.1a Bewertungs-Summaries aus vorhandenen Dokumenten aktualisieren

```bash
cd /Users/niklaskofler/Documents/finanztool
nvm use
npm run backfill:summaries
```

Dieser Lauf verarbeitet gezielt Bewertungsdokumente und schreibt `sourceSummaries`,
`sourcePositions`, `intergoldHoldings`, `intergoldPrices` und `portfolioSnapshots`.
Er ist vom Watcher getrennt und importiert nicht blind alle historischen Dateien.

### 4.2 Welche Datei wohin

Lege neue Dateien in:

- `.../01_Originale/Flatex/`
- `.../01_Originale/TradeRepublic/`
- `.../01_Originale/Ginmon/`
- `.../01_Originale/Intergold/`
- `.../01_Originale/Bitget/`

### 4.3 Was bei neuen Dateien passiert

1. Agent erkennt Datei
2. Wartet kurz bis Datei vollstaendig geschrieben ist
3. Berechnet SHA-256
4. Prueft auf Duplikat
5. Schreibt Import-Metadaten nach `imports`
6. Speichert Original in Storage
7. Wenn Quelle `Flatex` und Datei `CSV`:
   - schreibt `transactions`, `positions`, `snapshots`

## 5) Export-Ablauf pro Quelle

### 5.1 Flatex

- Export aus Flatex als CSV (Konto/Depotumsaetze)
- Datei direkt in `.../01_Originale/Flatex/` speichern
- Agent importiert automatisch

### 5.2 Trade Republic

- Export am iPhone erstellen (bisheriger Weg per E-Mail)
- Datei in `.../01_Originale/TradeRepublic/` ablegen
- Agent speichert Datei und `imports`-Eintrag automatisch

### 5.3 Ginmon

- PDF/Reports aus Portal laden
- In `.../01_Originale/Ginmon/` ablegen
- Agent speichert automatisch

### 5.4 Intergold

- PDF-Belege in `.../01_Originale/Intergold/` ablegen
- Agent speichert automatisch
- Preis-Webimport ist ein getrenntes Modul

## 6) Kontrolle in Firebase

Firestore pruefen:

- `imports`: neuer Eintrag je Datei
- `transactions`: nur Flatex CSV derzeit
- `positions`: nur Flatex CSV derzeit
- `snapshots`: nur Flatex CSV derzeit

Storage pruefen:

- `raw/flatex/...`
- `raw/traderepublic/...`
- `raw/ginmon/...`
- `raw/intergold/...`
- `raw/bitget/...`

## 7) Typische Fehler und schnelle Loesung

### Fehler: `Fehlende Umgebungsvariable`

Loesung:

- `automation/.env` unvollstaendig
- Variablen exakt wie oben setzen

### Fehler: `Firebase Service Account fehlt`

Loesung:

- Pfad in `FIREBASE_SERVICE_ACCOUNT_PATH` stimmt nicht
- JSON nicht vorhanden

### Fehler: `Firebase meldet NOT_FOUND`

Loesung:

- Firestore Database wurde im Firebase-Projekt noch nicht erstellt
- Firebase Console -> `Firestore Database` -> `Datenbank erstellen`

### Fehler: Vite verlangt Node 20.19+ oder 22.12+

Loesung:

```bash
cd /Users/niklaskofler/Documents/finanztool
nvm install
nvm use
```

Falls ein neues Terminal wieder Node 18 nutzt:

```bash
nvm alias default 22
```

### Fehler: Depot Root nicht gefunden

Loesung:

- `DEPOT_ROOT` falsch
- Google Drive Desktop nicht aktiv/synchronisiert

### Storage zeigt `Upgrade fuer Projekt durchfuehren`

Loesung:

- Auf Spark/Kostenlos ist Firebase Storage fuer dieses Projekt nicht nutzbar
- `ENABLE_STORAGE_UPLOAD=false` lassen
- Originale bleiben im Drive
- Erst nach bewusster Billing-Entscheidung Storage aktivieren und `ENABLE_STORAGE_UPLOAD=true` setzen

### Datei wird nicht importiert

Loesung:

- Endung pruefen (`.csv` oder `.pdf`)
- Datei im richtigen Quellordner
- Agent laeuft wirklich im Vordergrund

### Datei erscheint als `duplicate`

Loesung:

- Dateiinhalt ist identisch zu bereits importierter Datei
- Fuer Test eine geaenderte oder neue Datei verwenden

## 8) Empfohlene Betriebsform (Mac Studio)

Kurzfristig:

- Agent in Terminal laufen lassen (`npm run agent`)
- Standard: bestehende Dateien werden beim Start nicht verarbeitet
- Fuer bewusstes Backfill: `PROCESS_EXISTING_ON_START=true` in `automation/.env` setzen

Dauerbetrieb:

- Als `launchd` Dienst einrichten (siehe `automation/README.md`)

## 9) Was als naechstes erweitert wird

1. Trade Republic Parser auf `transactions/positions/snapshots`
2. Ginmon Parser
3. Intergold Preisimport und Belegparser sauber trennen
4. Monitoring/Alerting bei Import-Fehlern
