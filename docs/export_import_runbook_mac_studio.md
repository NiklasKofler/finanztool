# Export-Import Runbook (Mac Studio)

Stand: 2026-06-13

Dieses Runbook ist fuer den Mac Studio gedacht. Ziel: Der Mac Studio laeuft als
dauerhafter Import-Knoten und schreibt aktuelle Finanzdaten nach Firestore.

## 0. Vor jeder Codex-Session am Mac Studio

```bash
cd /Users/niklaskofler/Documents/finanztool
git pull
```

Dann zuerst lesen:

1. `docs/working_memory.md`
2. `docs/mac_studio_handoff_2026-06-13.md`
3. dieses Runbook

## 1. Projektpfade

Standardpfad auf MacBook und Mac Studio:

```text
/Users/niklaskofler/Documents/finanztool
```

Automation:

```text
/Users/niklaskofler/Documents/finanztool/automation
```

Google-Drive-Depotordner:

```text
/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot
```

## 2. Einmaliges Setup auf Mac Studio

### 2.1 Dependencies

```bash
cd /Users/niklaskofler/Documents/finanztool
npm run install:all
```

Falls `nvm` verwendet wird:

```bash
nvm install
nvm use
```

Die App braucht Node `>=20.19`.

### 2.2 Firebase CLI

```bash
firebase login
firebase projects:list
```

Das Projekt muss sichtbar sein:

```text
finanzperformance-tool
```

### 2.3 Secrets aus MacBook importieren

Auf dem MacBook:

```bash
cd /Users/niklaskofler/Documents/finanztool/automation
npm run secrets:export
```

Die erzeugte Datei:

```text
/Users/niklaskofler/Documents/finanztool/automation/runtime/secrets/finanztool-keychain-secrets.enc
```

per iCloud/Drive auf den Mac Studio kopieren.

Auf dem Mac Studio:

```bash
cd /Users/niklaskofler/Documents/finanztool/automation
npm run secrets:import
npm run secrets:list
```

Das Transfer-Passwort wird nicht gespeichert. Nach erfolgreichem Import kann die
verschluesselte Transferdatei geloescht werden.

Aktuell absichtlich nicht relevant: `EODHD`. Die Wertpapierkurse kommen aus
Boerse Frankfurt, nicht aus EODHD.

VBV fehlt eventuell im Export, falls es auf dem MacBook noch nicht gespeichert
wurde. Dann direkt am Mac Studio:

```bash
npm run setup:vbv
```

## 3. Manuelle Smoke-Tests vor Dauerbetrieb

Im Ordner `automation` ausfuehren:

```bash
cd /Users/niklaskofler/Documents/finanztool/automation
npm run check:bitget
npm run sync:bitget-ledger
npm run check:capitalcom
npm run reconcile:quotes -- --max-instruments=5
npm run sync:health
```

Optional, wenn Logins/Drive verfuegbar sind:

```bash
npm run inspect:flatex -- --keep-open
npm run inspect:ginmon
npm run reconcile:traderepublic-mail -- --no-firestore
npm run reconcile:intergold
npm run reconcile:vbv
```

## 4. Agenten installieren

Wenn Smoke-Tests plausibel sind:

```bash
cd /Users/niklaskofler/Documents/finanztool/automation
npm run install:all-agents
```

Das installiert aktuell:

- Bitget API-Agent alle 5 Minuten
- Bitget Ledger-Agent stuendlich
- Capital.com API-Agent stuendlich
- Flatex Browser-Export-Agent taeglich um 08:00, 10:00, 13:00, 17:00, 22:00
- Ginmon Sync-Agent alle 6 Stunden
- Intergold Sync-Agent taeglich um 08:20
- Trade-Republic-Mail-Agent stuendlich
- VBV Sync-Agent taeglich um 06:45 headless; gleicher Stichtag wird nicht neu importiert
- Boerse-Frankfurt-Kursagent alle 5 Minuten fuer aktuelle Kurse
- Boerse-Frankfurt-Historienagent taeglich um 22:00 fuer `priceHistory`
- Command-Runner fuer den App-Button `Alles aktualisieren`

## 5. Agenten pruefen

```bash
launchctl list | grep finanztool
```

Logs:

```bash
ls -lh /tmp/finanztool-*.log
tail -n 80 /tmp/finanztool-bitget-import.err.log
tail -n 80 /tmp/finanztool-bitget-ledger.err.log
tail -n 80 /tmp/finanztool-capitalcom-import.err.log
tail -n 80 /tmp/finanztool-flatex-sync.err.log
tail -n 80 /tmp/finanztool-ginmon-sync.err.log
tail -n 80 /tmp/finanztool-intergold-sync.err.log
tail -n 80 /tmp/finanztool-traderepublic-mail.err.log
tail -n 80 /tmp/finanztool-quote-sync.err.log
tail -n 80 /tmp/finanztool-quote-history.err.log
```

Firestore-Kontrolle in der App:

- Warnkarte oben rechts pruefen
- Depotkarten pruefen
- `Kursstand`/`Aktualisiert` je Quelle pruefen
- `Alles aktualisieren` anklicken und nach einigen Minuten erneut laden

## 6. Aktuelle Importlogik je Quelle

### Bitget

- API-Key, Secret und Passphrase im macOS-Schluesselbund
- Positionen in `sourcePositions`
- Summary in `sourceSummaries/bitget`
- Agentstatus in `agentStatus/bitget`
- Bewegungen in `ledgerEntries`
- Trades in `transactions`
- Trading-Gebuehren in `costEvents`
- Earn-Zinsen in `incomeEvents`
- Tax-Facts in `sourceDocumentFacts`
- Ledger-Agentstatus in `agentStatus/bitget_ledger`

### Capital.com

- API-Key und Custom Password im macOS-Schluesselbund
- API-Keys sind bei Capital.com nicht read-only; Agent nutzt trotzdem nur:
  - `POST /session`
  - `GET /session`
  - `GET /accounts`
  - `GET /positions`
- CFD-Positionen werden sichtbar gespeichert, aber nicht zur Vermoegenssumme
  addiert. Massgeblich ist der Kontowert aus `GET /accounts`.

### Flatex

- Browser-Export ueber eigenes Chrome-Profil
- Session-TAN bleibt deaktiviert
- Exportzeitraum standardmaessig `zwei Wochen`
- Kontoumsaetze und Depotumsaetze werden per CSV verarbeitet
- Nach dem CSV-Export liest der Agent den aktuellen Flatex-Broker-Snapshot aus
  `Mein flatex Depot`
- Primaere Flatex-Bewertung kommt aus dem Broker-Snapshot:
  - `sourcePositions`
  - `sourceSummaries/flatex`
  - `rawDocuments/flatex_broker_snapshot_latest`
  - `imports/flatex_broker_snapshot_latest`
- Boerse-Frankfurt-Kurse bleiben Vergleichs-/Historienquelle und duerfen den
  Flatex-Brokerwert nicht still ueberschreiben

### Ginmon

- Login ohne 2FA
- Dokumente/Reports und aktueller API-Summary-Abgleich
- Dynamisch fuer mehrere Portfolios/Konten
- Kostenlogik fachlich noch spaeter vertiefen

### Trade Republic

- Kein Login-Agent wegen 2FA
- Tagesende-Mails mit verschluesselten Abrechnungs-PDFs werden verarbeitet
- PDF-Passwort im Schluesselbund
- Private Equity `LU3176111881` wird dokumentbasiert bewertet, weil keine stabile
  Boerse-Frankfurt-Quelle gefunden wurde

### Intergold

- Preise aus Intergold-Webseite
- Bestand aus Einlagerungsbelegen
- Preisimport und Belegimport bleiben getrennt
- Bei Parser-/Webseitenabweichung muss Health-Warnung erscheinen

### VBV

- Keine Einzelpositionen
- Portal-Stichtag aus Meine VBV
- Genauere Datenquelle ist die PDF-Kontoinformation:
  `Severance Payment Fund` -> `Account information`
- Agent laedt den authentifizierten
  `/webportal/kontoinformation?date=...&hash=...`-PDF-Link und parst die PDF
- Firestore:
  - `sourceSummaries/vbv`
  - `sourceDocuments/vbv_account_information_<stichtag>`
  - `sourceDocumentFacts` mit einer Summary und Vertrags-Snapshots
- G/V fuer VBV:
  `Veranlagungsergebnis netto + explizite Kosten`
- Einstand fuer VBV:
  `Startwert + Beitraege`
- Dublettenlogik: stabile Dokument-ID je Stichtag plus `semanticHash`;
  physische PDF-Hashes allein sind nicht ausreichend

### Kurse

- Boerse Frankfurt als primaere Quelle
- Kein EODHD erforderlich
- Neue Wertpapierpositionen sollen automatisch anhand ISIN gemappt werden
- Private Equity bleibt dokumentbasiert

## 7. Deployment

Deployment vom MacBook oder Mac Studio:

```bash
cd /Users/niklaskofler/Documents/finanztool
firebase deploy --only hosting,firestore:rules
```

Hosting URL:

```text
https://finanzperformance-tool.web.app
```

Firestore Rules erlauben:

- Lesen nur fuer `niklas.kofler@gmail.com`
- Schreiben aus der App nur fuer `automationCommands/sync_quotes_manual`
- alle Finanzdaten werden lokal durch Agents geschrieben, nicht aus der App

## 8. Nach jeder groesseren Session

```bash
cd /Users/niklaskofler/Documents/finanztool
git status
git add .
git commit -m "..."
git push
```

Vor Commit pruefen:

- keine `.env`
- keine Secret-Datei
- keine Klartext-Keys
- keine Download-Originale
