# Mac Studio Handoff 2026-06-13

Dieses Dokument ist die kompakte Uebergabe fuer Codex auf dem Mac Studio.

## Ziel

Der Mac Studio soll als dauerhafter Import-Knoten laufen. Die App ist auf
Firebase Hosting deployed und liest aus Firestore. Die Agents schreiben neue
Bestands-, Kurs- und Importdaten nach Firestore.

## Wichtigste Regel

Keine Secrets in Git, Firestore, App-Code oder Chat schreiben. Alle Broker- und
API-Zugangsdaten liegen lokal im macOS-Schluesselbund.

## Aktuelle produktive Quellen

| Quelle | Methode | Firestore-Ziel | Automatisierung |
| --- | --- | --- | --- |
| Bitget | API | `sourcePositions`, `sourceSummaries/bitget` | alle 15 Minuten |
| Capital.com | API, GET-only Nutzung | `sourcePositions`, `sourceSummaries/capitalcom` | stuendlich |
| Flatex | Browser-CSV-Export | `sourcePositions`, `sourceSummaries/flatex` | 5x taeglich |
| Ginmon | Browser/API/Dokumente | `sourcePositions`, `sourceSummaries/ginmon` | alle 6 Stunden |
| Trade Republic | Apple-Mail-PDF-Agent | `sourcePositions`, `sourceSummaries/traderepublic` | stuendlich |
| Intergold | Webseite + Belege | `sourcePositions`, `sourceSummaries/intergold` | taeglich |
| VBV | Meine-VBV-Saldo | `sourceSummaries/vbv` | quartalsweise |
| Wertpapierkurse | Boerse Frankfurt | `quotesCurrent`, `instruments`, aktualisierte Positionen | stuendlich |

EODHD ist nicht relevant. Kurse kommen aktuell aus Boerse Frankfurt.

## Aktueller Firestore-Stand

Zuletzt erfolgreich geprueft:

- Capital.com: `OK`, Live-Konto, `0,00 EUR`, 0 Positionen
- VBV: `OK`, `1.815,86 EUR`, Stichtag `2026-05-31`
- Health: `WARNUNG` nur wegen Bitget-Summary-Abweichung

Bekannte offene Health-Warnung:

- `summary_mismatch_bitget`: Positionssumme weicht leicht von Bitget-Summary ab.
  Das ist fachlich noch zu pruefen, aber kein Mac-Studio-Setup-Blocker.

## Mac Studio Startfolge

```bash
cd /Users/niklaskofler/Documents/Finanztool
git pull
npm run install:all
firebase login
```

Secrets importieren:

```bash
cd /Users/niklaskofler/Documents/Finanztool/automation
npm run secrets:import
npm run secrets:list
```

Falls VBV fehlt:

```bash
npm run setup:vbv
```

Smoke-Tests:

```bash
npm run check:bitget
npm run check:capitalcom
npm run reconcile:quotes -- --max-instruments=5
npm run sync:health
```

Alle Agents installieren:

```bash
npm run install:all-agents
```

Pruefen:

```bash
launchctl list | grep finanztool
```

## Agenten

`npm run install:all-agents` installiert:

- `com.niklas.finanztool.bitget-import`
- `com.niklas.finanztool.capitalcom-import`
- `com.niklas.finanztool.flatex-sync`
- `com.niklas.finanztool.ginmon-sync`
- `com.niklas.finanztool.intergold-sync`
- `com.niklas.finanztool.traderepublic-mail`
- `com.niklas.finanztool.vbv-sync`
- `com.niklas.finanztool.quote-sync`
- `com.niklas.finanztool.command-runner`

## App/Firebase

Hosting:

```text
https://finanzperformance-tool.web.app
```

Letzter Deploy:

```text
2026-06-13 09:20 CEST vom MacBook
Hosting und Firestore Rules erfolgreich deployed
```

Deploy:

```bash
firebase deploy --only hosting,firestore:rules
```

Die App darf nur den Kurs-Sync-Befehl schreiben:

```text
automationCommands/sync_quotes_manual
```

Alle Finanzdaten schreibt der lokale Mac-Studio-Agent.

## Offene fachliche Punkte

1. Bitget-Summary-Abweichung klaeren
2. Ginmon-Kostenlogik spaeter vertiefen
3. Flatex nach ein paar automatischen Exportlaeufen erneut gegen Broker pruefen
4. Trade-Republic-Private-Equity bleibt dokumentbasiert
5. Equate Plus erst nach erster Mail/Benachrichtigung umsetzen
6. Bankdaten/Kreditkarten spaeter ueber Open-Banking-Ansatz pruefen
