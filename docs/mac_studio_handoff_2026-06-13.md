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
| Ginmon | Dokumente + API | `sourceDocuments`, `sourceDocumentFacts`, `sourcePositions`, `sourceSummaries/ginmon` | Dokumente taeglich 02:00, API stuendlich |
| Trade Republic | Apple-Mail-PDF-Agent | `sourcePositions`, `sourceSummaries/traderepublic` | stuendlich |
| Intergold | Webseite + Belege | `sourcePositions`, `sourceSummaries/intergold` | taeglich |
| VBV | Meine-VBV-Saldo | `sourceSummaries/vbv` | quartalsweise |
| Wertpapierkurse | Boerse Frankfurt | `quotesCurrent`, `instruments`, aktualisierte Positionen | stuendlich |

EODHD ist nicht relevant. Kurse kommen aktuell aus Boerse Frankfurt.

Noch nicht produktiv integriert:

- Bankkonten/Kreditkarten: Sparkasse/George, Amazon Visa, TF Bank Kreditkarte,
  spaeter Revolut
- Trading 212

## Aktueller Firestore-Stand

Zuletzt erfolgreich geprueft:

- Capital.com: `OK`, Live-Konto, `0,00 EUR`, 0 Positionen
- VBV: `OK`, `1.815,86 EUR`, Stichtag `2026-05-31`
- Bitget: 6 Positionen, sichtbare inkludierte Positionssumme `3.807,42 EUR`
- Health: `OK`, 0 Fehler, 0 Warnungen

Bekannter Bitget-Hinweis:

- Der Firestore-Datenbestand ist konsistent, aber ein frischer lokaler
  Bitget-Import meldete am 2026-06-13 `40009 sign signature error`.
- Vor dem naechsten Dauerbetrieb muessen API-Key, Secret und Passphrase im
  macOS-Schluesselbund gegen den aktuellen Bitget-Key geprueft oder neu erzeugt
  werden.

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
- `com.niklas.finanztool.ginmon-documents`
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

1. Bankkonten/Kreditkarten ueber Open-Banking-Ansatz pruefen und integrieren:
   Sparkasse/George, Amazon Visa, TF Bank Kreditkarte, spaeter Revolut
2. Trading 212 als eigene Quelle ergaenzen
3. Einheitliches Konto-/Depotmodell in Firestore ergaenzen
4. Bitget API-Credentials reparieren (`40009 sign signature error`)
5. Ginmon-Kostenlogik spaeter vertiefen
6. Flatex nach ein paar automatischen Exportlaeufen erneut gegen Broker pruefen
7. Trade-Republic-Private-Equity bleibt dokumentbasiert
8. Equate Plus erst nach erster Mail/Benachrichtigung umsetzen
