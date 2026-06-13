# Export-Import Runbook (Mac Studio)

Stand: 2026-06-13

Dieses Runbook ist fuer den Mac Studio gedacht. Ziel: Der Mac Studio laeuft als
dauerhafter Import-Knoten und schreibt aktuelle Finanzdaten nach Firestore.

## 0. Vor jeder Codex-Session am Mac Studio

```bash
cd /Users/niklaskofler/Documents/Finanztool
git pull
```

Dann zuerst lesen:

1. `docs/working_memory.md`
2. `docs/mac_studio_handoff_2026-06-13.md`
3. dieses Runbook

## 1. Projektpfade

Standardpfad auf MacBook und Mac Studio:

```text
/Users/niklaskofler/Documents/Finanztool
```

Automation:

```text
/Users/niklaskofler/Documents/Finanztool/automation
```

Google-Drive-Depotordner:

```text
/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot
```

## 2. Einmaliges Setup auf Mac Studio

### 2.1 Dependencies

```bash
cd /Users/niklaskofler/Documents/Finanztool
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
cd /Users/niklaskofler/Documents/Finanztool/automation
npm run secrets:export
```

Die erzeugte Datei:

```text
/Users/niklaskofler/Documents/Finanztool/automation/runtime/secrets/finanztool-keychain-secrets.enc
```

per iCloud/Drive auf den Mac Studio kopieren.

Auf dem Mac Studio:

```bash
cd /Users/niklaskofler/Documents/Finanztool/automation
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
cd /Users/niklaskofler/Documents/Finanztool/automation
npm run check:bitget
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
cd /Users/niklaskofler/Documents/Finanztool/automation
npm run install:all-agents
```

Das installiert aktuell:

- Bitget API-Agent alle 15 Minuten
- Capital.com API-Agent stuendlich
- Flatex Browser-Export-Agent taeglich um 08:00, 10:00, 13:00, 17:00, 22:00
- Ginmon Sync-Agent alle 6 Stunden
- Intergold Sync-Agent taeglich um 08:20
- Trade-Republic-Mail-Agent stuendlich
- VBV Sync-Agent quartalsweise am 5.1., 5.4., 5.7., 5.10. um 09:15
- Boerse-Frankfurt-Kursagent stuendlich
- Command-Runner fuer den App-Button `Kurse aktualisieren`

## 5. Agenten pruefen

```bash
launchctl list | grep finanztool
```

Logs:

```bash
ls -lh /tmp/finanztool-*.log
tail -n 80 /tmp/finanztool-bitget-import.err.log
tail -n 80 /tmp/finanztool-capitalcom-import.err.log
tail -n 80 /tmp/finanztool-flatex-sync.err.log
tail -n 80 /tmp/finanztool-ginmon-sync.err.log
tail -n 80 /tmp/finanztool-intergold-sync.err.log
tail -n 80 /tmp/finanztool-traderepublic-mail.err.log
tail -n 80 /tmp/finanztool-quote-sync.err.log
```

Firestore-Kontrolle in der App:

- Warnkarte oben rechts pruefen
- Depotkarten pruefen
- `Aktualisiert` je Quelle pruefen
- `Kurse aktualisieren` anklicken und nach einigen Minuten erneut laden

## 6. Aktuelle Importlogik je Quelle

### Bitget

- API-Key, Secret und Passphrase im macOS-Schluesselbund
- Positionen in `sourcePositions`
- Summary in `sourceSummaries/bitget`
- Agentstatus in `agentStatus/bitget`
- Bekannte Health-Warnung: kleine Summary-Abweichung zwischen Positionssumme und
  Bitget-Gesamtsummary ist noch zu pruefen

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
- Cash/Kreditlinie kommt rechnerisch aus Konto-/Depotdaten, nicht aus Dashboard-Screenshot
- Aktuelle Wertpapierkurse kommen aus Boerse Frankfurt

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
- Nur Karte/Summary `sourceSummaries/vbv`
- Quartalswert aus Meine VBV

### Kurse

- Boerse Frankfurt als primaere Quelle
- Kein EODHD erforderlich
- Neue Wertpapierpositionen sollen automatisch anhand ISIN gemappt werden
- Private Equity bleibt dokumentbasiert

## 7. Deployment

Deployment vom MacBook oder Mac Studio:

```bash
cd /Users/niklaskofler/Documents/Finanztool
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
cd /Users/niklaskofler/Documents/Finanztool
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

