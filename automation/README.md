# Finanztool Import-Agent

Dieser Agent laeuft lokal auf deinem Mac Studio und ueberwacht deinen Drive-Ordner automatisch.
Neue CSV/PDF-Dateien werden ohne manuelles Klicken erkannt und in Firebase verarbeitet.

## Was automatisch passiert

- Beobachtet `DEPOT_ROOT` und alle Unterordner.
- Erkennt Duplikate per SHA-256 Datei-Hash.
- Schreibt Metadaten nach Firestore `imports`.
- Speichert Originaldateien in Firebase Storage `raw/<source>/...`.
- Flatex CSV wird direkt geparst und schreibt:
  - `transactions`
  - `positions`
  - `snapshots`

## Setup

1. Abhaengigkeiten installieren

```bash
cd /Users/niklaskofler/Documents/Finanztool/automation
npm install
```

2. Service Account hinterlegen (Firebase Console -> Service Accounts -> new private key)
   - Datei z. B. unter `/Users/niklaskofler/Documents/Finanztool/secrets/firebase-service-account.json`

3. Env anlegen

```bash
cp /Users/niklaskofler/Documents/Finanztool/automation/.env.example /Users/niklaskofler/Documents/Finanztool/automation/.env
```

4. Agent starten

```bash
cd /Users/niklaskofler/Documents/Finanztool/automation
npm start
```

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
      <string>/usr/bin/env</string>
      <string>bash</string>
      <string>-lc</string>
      <string>cd /Users/niklaskofler/Documents/Finanztool/automation && npm start</string>
    </array>
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
