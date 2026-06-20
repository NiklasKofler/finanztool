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
- Wertpapierkurse werden ueber Boerse Frankfurt aktualisiert und schreiben:
  - `instrumentMappings`
  - `instruments`
  - `quotesCurrent`
  - aktualisierte `sourcePositions` und `sourceSummaries`

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

## Schluesselbund auf Mac Studio uebertragen

Die Broker- und API-Secrets liegen lokal im macOS-Schluesselbund. Fuer den
Wechsel vom MacBook auf den Mac Studio koennen sie verschluesselt exportiert
und dort wieder importiert werden.

Auf dem MacBook:

```bash
cd /Users/niklaskofler/Documents/finanztool/automation
npm run secrets:export
```

Die Datei liegt danach standardmaessig hier:

```text
/Users/niklaskofler/Documents/finanztool/automation/runtime/secrets/finanztool-keychain-secrets.enc
```

Diese verschluesselte Datei auf den Mac Studio kopieren, z. B. ueber iCloud
Drive. Auf dem Mac Studio dann:

```bash
cd /Users/niklaskofler/Documents/finanztool/automation
npm run secrets:import
npm run secrets:list
```

Das Transfer-Passwort wird nicht gespeichert. Die Exportdatei enthaelt keine
lesbaren Secrets, sollte nach erfolgreichem Import aber trotzdem geloescht
werden.

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

Auf einem Entwicklungs-Mac mit bestehendem Firebase-CLI-Login kann der Import
ohne lokalen Service Account ausgefuehrt werden:

```bash
npm run import:bitget:local
```

Automatische Aktualisierung alle 15 Minuten auf dem aktuellen Mac installieren:

```bash
npm run install:bitget-agent
```

Der lokale Import ueberschreibt aktuelle Positionen, Summary und Agent-Status.
Pro Kalendertag wird nur ein Import-Dokument aktualisiert, damit Firestore nicht
durch die 15-Minuten-Aktualisierung unnoetig waechst.

Der Import nutzt:

- `GET /api/v2/spot/account/info`
- `GET /api/v2/spot/account/assets`
- `GET /api/v2/account/all-account-balance`
- `GET /api/v2/spot/market/tickers`
- `GET /api/v2/spot/account/bills`

## Capital.com API

Capital.com wird per offizieller API angebunden. Laut Capital.com-Doku gibt es
aktuell keine Read-only-API-Keys; der Key kann Trading-Funktionalitaet haben.
Der Finanztool-Agent nutzt deshalb bewusst nur lesende Endpunkte:

- `POST /session`
- `GET /session`
- `GET /accounts`
- `GET /positions`

API-Key in der Web-Plattform erzeugen:

1. Capital.com oeffnen
2. `Settings` -> `API integrations`
3. neuen API-Key mit eigenem Custom Password erzeugen
4. API-Key sofort sichern, weil er spaeter maskiert wird

Zugangsdaten lokal im macOS-Schluesselbund speichern:

```bash
cd /Users/niklaskofler/Documents/finanztool/automation
npm run setup:capitalcom
```

API-Zugang testen:

```bash
npm run check:capitalcom
```

Capital.com nach Firestore importieren:

```bash
npm run import:capitalcom:local
```

Stuendlichen Agent auf dem aktuellen Mac installieren:

```bash
npm run install:capitalcom-agent
```

CFD-Positionen werden sichtbar als Positionen gespeichert, aber nicht zur
Depot-Summe addiert. Der Kontowert kommt aus `GET /accounts`.

## VBV Vorsorgekasse

VBV wird als Quelle ohne Einzelpositionen gefuehrt. Es wird nur der Saldo der
Vorsorgekasse samt Stichtag nach `sourceSummaries/vbv` geschrieben.

Einmalig Zugangsdaten lokal im macOS-Schluesselbund speichern:

```bash
cd /Users/niklaskofler/Documents/finanztool/automation
npm run setup:vbv
```

Aktuellen VBV-Wert aus Meine VBV abrufen und in Firestore schreiben:

```bash
npm run sync:vbv
```

Falls Meine VBV schon in Chrome offen und eingeloggt ist, kann der Wert aus dem
aktuellen Chrome-Tab uebernommen werden:

```bash
npm run sync:vbv -- --from-current-chrome
```

Quartalsweisen Agent auf dem aktuellen Mac installieren:

```bash
npm run install:vbv-agent
```

## Flatex Browser-Export

Flatex wird lokal ueber ein eigenes Chrome-Profil automatisiert. Die Zugangsdaten
liegen im macOS-Schluesselbund, die Session-TAN bleibt deaktiviert.

Einmalig Zugangsdaten lokal hinterlegen:

```bash
cd /Users/niklaskofler/Documents/finanztool/automation
npm run setup:flatex
```

Nur Browser/Login pruefen und Fenster offen lassen:

```bash
npm run inspect:flatex -- --keep-open
```

Depotumsaetze und Kontoumsaetze als CSV in die Drive-Inbox laden:

```bash
npm run download:flatex
```

Download plus Firestore-Abgleich ausfuehren:

```bash
npm run sync:flatex
```

Automatische Aktualisierung auf dem aktuellen Mac installieren:

```bash
npm run install:flatex-agent
```

Der Flatex-Agent laeuft taeglich um 08:00, 10:00, 13:00, 17:00 und 22:00.
Der Export nutzt standardmaessig den Zeitraum `zwei Wochen`. Die Daten werden
beim Abgleich anhand `TA.-Nr.` bzw. stabilem Zeilenhash dedupliziert, damit
ueberlappende Exporte keine doppelten Positionen erzeugen.
Flatex liefert Stueckzahlen, Einstandswerte und Cash/Kontoumsaetze. Aktuelle
Wertpapierkurse kommen aus dem allgemeinen Boerse-Frankfurt-Kursabgleich.

## Warnsystem

Der Health-Check schreibt `systemHealth/current` nach Firestore. Die App zeigt
diese Meldungen oben rechts in der Warnkarte an.

```bash
npm run sync:health
```

Geprueft werden unter anderem:

- Agentstatus und veraltete Aktualisierungen
- fehlende Positionen je Quelle
- fehlende aktuelle Werte oder Einstandswerte
- fehlende Kurs-Mappings
- Summary-Werte, die nicht zur Positionssumme passen
- Importstatus `FEHLER` oder `UNVOLLSTAENDIG`

## Wertpapierkurse ueber Boerse Frankfurt

Der Kursabgleich braucht keinen API-Key. Neue Wertpapierpositionen werden ueber
ihre ISIN automatisch bei Boerse Frankfurt gemappt und danach bewertet.

Dry-Run ohne Firestore-Schreibzugriff:

```bash
npm run reconcile:quotes
```

Kurse in Firestore schreiben:

```bash
npm run sync:quotes
```

Lokaler Kurs-Sync inklusive Health-Check und Agentstatus:

```bash
npm run sync:quotes:local
```

Stuendliche Aktualisierung auf dem aktuellen Mac installieren:

```bash
npm run install:quote-agent
```

Der Button `Kurse aktualisieren` in der App schreibt nur einen Befehl nach
Firestore. Damit dieser Befehl lokal ausgefuehrt wird, muss der Command-Runner
auf dem Mac Studio laufen:

```bash
npm run install:command-runner
```

Fuer Tests kann die Anzahl begrenzt werden:

```bash
npm run reconcile:quotes -- --max-instruments=5
```

Bekannter Sonderfall: Trade Republic Private Equity `LU3176111881` ist bei Boerse
Frankfurt nicht auffindbar und bleibt deshalb auf dem zuletzt aus dem Net-Worth-PDF
importierten Wert.

## Trade Republic Mail-PDFs

Trade Republic wird nicht per Login automatisiert, weil die 2FA auf dem Handy
bleibt. Stattdessen liest der lokale Agent Apple Mail aus, speichert neue
Abrechnungs-PDFs aus den `Duplicates customer ...` Mails, entsperrt sie mit dem
Passwort aus der letzten `Password for duplicates ...` Mail und bucht nur neue
Dokument-IDs auf den Bestand.

Die Dateien landen hier:

- verschluesselte Originale:
  `/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/01_Originale/TradeRepublic/Abrechnungen/Verschluesselt`
- entsperrte PDFs:
  `/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/02_Archiviert/TradeRepublic/Abrechnungen/Entsperrt`
- extrahierter Text:
  `/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/02_Archiviert/TradeRepublic/Abrechnungen/Text`

Trockenlauf ohne Firestore-Schreibzugriff:

```bash
cd /Users/niklaskofler/Documents/finanztool
npm --prefix automation run reconcile:traderepublic-mail -- --no-firestore
```

PDFs verarbeiten, neue Dokumente auf Positionen anwenden und danach Kurse
aktualisieren:

```bash
cd /Users/niklaskofler/Documents/finanztool
npm --prefix automation run sync:traderepublic-mail
```

Der Agent ist idempotent: derselbe PDF-Import wird in `imports` anhand
`tr_settlement_<document-id>` erkannt und nicht erneut auf `sourcePositions`
angewendet.

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
