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
- EquatePlus/Novartis wird mit manuellen Anteilen, Einstandswert EUR und SIX
  Swiss Exchange Kurs bewertet.

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

Stand 2026-06-27: Die technische Anbindung ist vorbereitet, der aktuell lokal
gespeicherte Capital.com-Key ist aber ungueltig (`401 error.invalid.api.key`).
Vor aktiver Nutzung zuerst einen neuen API-Key in Capital.com erzeugen und mit
`npm run setup:capitalcom` im Schluesselbund speichern.

Der Import schreibt bei gueltigem Key:

- `sourceSummaries/capitalcom`
- `sourcePositions/capitalcom_*`
- `ledgerEntries/capitalcom_*`
- `sourceDocumentFacts/capitalcom_*`
- `costEvents/capitalcom_*`
- `incomeEvents/capitalcom_*`
- `rawDocuments/api_capitalcom_latest`

History wird inkrementell gelesen: initial standardmaessig 30 Tage
(`CAPITALCOM_HISTORY_DAYS`), danach ab letztem `lastHistorySyncEndAt` mit
2 Tagen Ueberlappung (`CAPITALCOM_HISTORY_OVERLAP_DAYS`). Fuer einen vollen
neuen History-Lauf:

```bash
npm run import:capitalcom:local -- --backfill
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

Taeglichen headless Agent auf dem aktuellen Mac installieren:

```bash
npm run install:vbv-agent
```

Der VBV-Agent prueft taeglich den Portal-Stichtag. Die PDF-Kontoinformation
wird nur neu heruntergeladen/geparst, wenn der Stichtag neu ist oder fuer diesen
Stichtag noch keine Kontoinformation in Firestore liegt.

## EquatePlus / Novartis

EquatePlus ist vorerst keine Dokumenten- oder Portalautomation. Fuer den
aktuellen Gesamtwert werden nur die Novartis-Anteile und der gesamte
Einstandswert in EUR manuell gepflegt. Der Kurs kommt von SIX Swiss Exchange
und wird nach EUR umgerechnet.

Die App schreibt die manuelle Eingabe nach:

```text
manualInputs/equateplus_novartis
```

Agent dry-run:

```bash
cd /Users/niklaskofler/Documents/finanztool
npm --prefix automation run reconcile:equateplus
```

Aktuelle Bewertung nach Firestore schreiben:

```bash
npm --prefix automation run sync:equateplus
```

Einmaliger Startwert aus Screenshot/Nutzerangabe kann bei Bedarf lokal gesetzt
werden:

```bash
node automation/src/sync-equateplus-manual-local.mjs --write --seed-manual --quantity=16.2 --entry-value-eur=1500
```

Der normale Kurs-Sync (`npm --prefix automation run sync:quotes:current`) ruft
EquatePlus automatisch mit auf.

## Kreditkarten-Portale

Kreditkarten werden als Unterkonten der Quelle `bank_accounts` gespeichert,
nicht als eigene Depotkarten. Der offene Kreditkartensaldo wird als negativer
Vermoegenswert geschrieben; verfuegbarer Kredit und Kreditlimit sind nur
Transparenzwerte.

### Amazon Visa

Secrets liegen ausschliesslich im macOS-Schluesselbund:

- `finanztool-amazon-visa-email`
- `finanztool-amazon-visa-pin`

Aktuellen Amazon-Visa-Saldo abrufen und in Firestore schreiben:

```bash
cd /Users/niklaskofler/Documents/finanztool
npm --prefix automation run sync:amazon-visa
```

Der Agent schreibt als Bank-Unterkonto nach
`sourceSummaries/bank_accounts`,
`sourcePositions/bank_accounts_amazon_visa_card`,
`sourceAccounts/bank_accounts_amazon_visa_card`, `imports` und
`agentStatus/amazon_visa`.

### TF Bank Kreditkarte

Secrets liegen ausschliesslich im macOS-Schluesselbund:

- `finanztool-tfbank-customer-number`
- `finanztool-tfbank-birthdate`

Aktuellen TF-Bank-Saldo abrufen:

```bash
cd /Users/niklaskofler/Documents/finanztool
npm --prefix automation run sync:tfbank
```

Der produktive LaunchAgent laeuft nur alle 3 Stunden, weil TF Bank fuer einen
frischen Login regelmaessig eine SMS-TAN verlangt. Amazon Visa bleibt davon
unabhaengig stuendlich.

Wenn das Portal eine SMS-TAN verlangt, wartet der Agent standardmaessig bis zu
300 Sekunden auf eine neue TAN. Primaer versucht er, die neue TF-Bank-SMS aus
der lokalen macOS-Nachrichten-App zu lesen. Dafuer nutzt er den lokalen Swift-
Helper `automation/src/read-messages-tan.swift` und akzeptiert nur einen Code,
der neuer ist als der zuletzt sichtbare Code vor dem Login.

Wenn der Login aus TAN-Gruenden nicht abgeschlossen werden kann, z. B. weil
der Code ablaeuft, vom Portal abgelehnt wird oder der TAN-Schritt haengen
bleibt, bricht der Agent den Browserlauf ab und startet den kompletten Login
neu. Erst nach 5 solchen TAN-Login-Versuchen schreibt er eine Fehlermeldung.
Die Anzahl kann lokal mit `TFBANK_TAN_LOGIN_ATTEMPTS` oder
`--tan-login-attempts=5` angepasst werden.

Voraussetzungen fuer die automatische TAN-Erkennung:

- Nachrichten/iMessage-SMS-Sync empfaengt die TF-Bank-SMS auf dem Mac Studio.
- macOS erlaubt dem ausfuehrenden Prozess Accessibility-Zugriff auf Messages.
- Falls die automatische Erkennung nicht klappt, bleibt die TAN-Datei als
  Fallback.

Fallback per lokaler TAN-Datei. Die Datei wird nach dem Lesen geloescht.

```bash
mkdir -p ~/.finanztool
printf "123456" > ~/.finanztool/tfbank-tan.txt
```

Mit TAN kann der Login auch direkt so abgeschlossen werden:

```bash
node automation/src/sync-tfbank-local.mjs --write --tan=123456
```

Wenn der Code erst nach Start des Logins aus Nachrichten gelesen wird, muss
derselbe Prozess offen bleiben:

```bash
node automation/src/sync-tfbank-local.mjs --write --tan-stdin
```

Die TAN wird nicht gespeichert.

Der Agent meldet sich nach erfolgreichem Lesen des Saldos standardmaessig aus
TF Bank ab. Dadurch wird beim naechsten Lauf wieder eine frische SMS-TAN
erwartet. Fuer Debug-Laeufe kann der Logout mit `--no-logout` deaktiviert
werden.

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

Nur aktuellen Broker-Snapshot inklusive Flatex-Kursen schreiben:

```bash
npm run sync:flatex-snapshot
```

Automatische Aktualisierung auf dem aktuellen Mac installieren:

```bash
npm run install:flatex-agent
```

Der Flatex-Broker-Snapshot laeuft alle 5 Minuten headless und liest die
aktuellen Flatex-Positionen, Kurse, Einstandswerte, Cash und Kreditfelder
direkt aus der Flatex-Oberflaeche. Dieser Lauf erzeugt keine CSV-Dateien.

Der Flatex-Dokumentexport laeuft getrennt taeglich um 22:10 headless und nutzt
standardmaessig den Zeitraum `zwei Wochen`. Die Daten werden beim Abgleich
anhand `TA.-Nr.` bzw. stabilem Zeilenhash dedupliziert, damit ueberlappende
Exporte keine doppelten Positionen erzeugen.

Boerse Frankfurt ist fuer Flatex nicht mehr die primaere Kursquelle. Externe
Kurse duerfen Flatex-Brokerwerte nur als explizite Vergleichswerte ergaenzen,
nicht still ersetzen.

## Warnsystem

Der Health-Check schreibt `systemHealth/current` nach Firestore. Die App zeigt
diese Meldungen oben rechts in der Warnkarte an. Im produktiven LaunchAgent
laeuft der Health-Check alle 30 Minuten und nicht mehr bei jedem 5-Minuten-
Kurslauf.

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

Lokaler Kurs-Sync inklusive Agentstatus:

```bash
npm run sync:quotes:local
```

Aktualisierung alle 5 Minuten auf dem aktuellen Mac installieren:

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

Der allgemeine externe Kurs-Sync bewertet standardmaessig nur noch Trade
Republic-Wertpapiere. Flatex kommt aus dem Flatex-Broker-Snapshot, Ginmon aus
der Ginmon-API, Bitget aus Bitget und EquatePlus aus SIX.

Bekannter Sonderfall: Trade Republic Private Equity `LU3176111881` ist bei
Boerse Frankfurt nicht auffindbar und bleibt deshalb auf dem zuletzt aus dem
Net-Worth-/Portalwert importierten Wert.

## Trade Republic Portal und Legacy-Mail

Trade Republic wird produktiv nicht mehr ueber den alten Manual-/Mail-Export-
Agenten aktualisiert. Zielquelle ist der Portal-Agent
`download-traderepublic-local.mjs`, der bei Bedarf headless startet und auf die
App-Freigabe wartet. Der alte Mail-PDF-Agent bleibt nur als Legacy-Fallback im
Code, ist aber in `install:all-agents` deaktiviert.

Der App-Button in der Trade-Republic-Karte nutzt bewusst den schnellen
Snapshot-Modus:

```bash
npm --prefix automation run sync:traderepublic-portal-fast
```

Dieser Lauf liest den aktuellen Portal-Snapshot fuer Depotwert, Cash,
Positionen und Broker-Kursstand und ueberspringt den langsamen
Dokument-/Transaktionsdetailscan. Dadurch kommt die App-Freigabe schneller zum
eigentlichen Ziel: aktuelle Werte in der GUI. Der volle Portal-Lauf bleibt fuer
gezielte Dokument-/PDF- und Transaktionspruefungen erhalten:

```bash
npm --prefix automation run sync:traderepublic-portal
```

Auch dieser Lauf arbeitet inkrementell: Sobald mehrere neueste Transaktionen
hintereinander bereits bekannte Dokument-Signaturen haben, bricht der Agent ab.
Fuer eine vollstaendige Neu-Inventarisierung gibt es den expliziten Full-Scan:

```bash
npm --prefix automation run sync:traderepublic-portal-full
```

Der zweite Button `Nur Kurse` in der Trade-Republic-Karte startet nur den
allgemeinen Kurs-Sync und benoetigt keinen Trade-Republic-Login.

Die Dateien landen hier:

- verschluesselte Originale:
  `/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/01_Originale/TradeRepublic/Abrechnungen/Verschluesselt`
- entsperrte PDFs:
  `/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/02_Archiviert/TradeRepublic/Abrechnungen/Entsperrt`
- extrahierter Text:
  `/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/02_Archiviert/TradeRepublic/Abrechnungen/Text`

Der alte Trade-Republic-Mail-Agent fuer Duplicates-PDFs ist nicht mehr als
produktiver Agent installierbar. Die aktive Quelle ist der Portal-Agent; alte
Statusdokumente `traderepublic_mail` und `traderepublic_manual_exports` werden
im Health-Check ignoriert.

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
