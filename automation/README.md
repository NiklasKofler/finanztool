# Finanztool Import-Agent

Dieser Agent laeuft lokal auf deinem Mac Studio und ueberwacht deinen Drive-Ordner automatisch.
Neue CSV/PDF-Dateien werden ohne manuelles Klicken erkannt und in Firebase verarbeitet.

Das vollstaendige 1:1 Runbook liegt unter
[`docs/export_import_runbook_mac_studio.md`](../docs/export_import_runbook_mac_studio.md).

## Was automatisch passiert

- Beobachtet `DEPOT_ROOT` und alle Unterordner.
- Erkennt Duplikate per SHA-256 Datei-Hash.
- Schreibt Metadaten nach Firestore `imports`.
- Speichert Originaldateien in Firebase Storage `raw/<source>/...`.
- Flatex CSV wird direkt geparst und schreibt:
  - `transactions`
  - `positions`
  - `snapshots`
- Bitget kann per Read-only API importiert werden und schreibt:
  - `sourcePositions`
  - `sourceSummaries/bitget`
  - `ledgerEntries`

## Setup

1. Abhaengigkeiten installieren

```bash
cd /Users/niklaskofler/Documents/finanztool/automation
npm install
```

2. Service Account hinterlegen (Firebase Console -> Service Accounts -> new private key)
   - Datei z. B. unter `/Users/niklaskofler/Documents/finanztool/secrets/firebase-service-account.json`

3. Env anlegen

```bash
cp /Users/niklaskofler/Documents/finanztool/automation/.env.example /Users/niklaskofler/Documents/finanztool/automation/.env
```

4. Agent starten

```bash
cd /Users/niklaskofler/Documents/finanztool/automation
npm start
```

## Bitget API-Import

Der Bitget-Key muss Read-only sein. Keine Trading- oder Withdrawal-Rechte vergeben.

Die Zugangsdaten werden bevorzugt lokal im macOS-Schluesselbund gespeichert.
Der Setup-Befehl fragt alle drei Werte verdeckt ab:

```bash
cd /Users/niklaskofler/Documents/finanztool/automation
npm run setup:bitget
```

Secrets niemals in Git oder Firestore speichern. Alternativ werden weiterhin
`BITGET_API_KEY`, `BITGET_API_SECRET` und `BITGET_API_PASSPHRASE` aus der
lokalen `.env` unterstuetzt.

Zuerst nur den Read-only-Zugang testen:

```bash
cd /Users/niklaskofler/Documents/finanztool/automation
npm run check:bitget
```

Erst nach erfolgreichem Test in Firestore importieren:

```bash
npm run import:bitget
```

Der Import nutzt:

- `GET /api/v2/spot/account/info`
- `GET /api/v2/spot/account/assets`
- `GET /api/v2/account/all-account-balance`
- `GET /api/v2/spot/market/tickers`
- `GET /api/v2/spot/account/bills`

## Mac Studio Dauerbetrieb (launchd)

Beispiel `~/Library/LaunchAgents/com.niklas.finanztool.import-agent.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.niklas.finanztool.import-agent</string>
    <key>ProgramArguments</key>
    <array>
      <string>/Users/niklaskofler/.nvm/versions/node/v22.22.3/bin/node</string>
      <string>src/drive-watcher.mjs</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/niklaskofler/Documents/finanztool/automation</string>
    <key>EnvironmentVariables</key>
    <dict>
      <key>PATH</key>
      <string>/Users/niklaskofler/.nvm/versions/node/v22.22.3/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/finanztool-import-agent.out.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/finanztool-import-agent.err.log</string>
  </dict>
</plist>
```

Aktivieren:

```bash
launchctl load ~/Library/LaunchAgents/com.niklas.finanztool.import-agent.plist
launchctl start com.niklas.finanztool.import-agent
```

Stoppen:

```bash
launchctl stop com.niklas.finanztool.import-agent
launchctl unload ~/Library/LaunchAgents/com.niklas.finanztool.import-agent.plist
```
