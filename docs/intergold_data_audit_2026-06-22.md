# Intergold Daten-Audit

Stand: 2026-06-22 00:35 CEST, Mac Studio

## Kurzfazit

Intergold ist als dokument- und preisbasierte Quelle produktiv nutzbar:

- Bestand kommt aus Intergold-Einlagerungsbestaetigungen.
- Bewertung kommt von der Intergold-Webseite.
- Konservative Bewertung nutzt den Intergold-Ankaufspreis.
- Belegimport und Preisimport bleiben getrennt.
- Firestore speichert jetzt getrennt:
  - Dokumentstand
  - Preisstand Website
  - letzte echte Preisaenderung
  - letzter Agentlauf
- Update 2026-06-27: Intergold-PDFs werden jetzt auch in
  `sourceDocuments`, `sourceDocumentFacts`, `transactions` und `costEvents`
  registriert. Nicht geparste Intergold-Anhaenge bleiben im zentralen
  Dokumenten-Postfach und werden nicht automatisch ignoriert.

## Wie Intergold aktuell aktualisiert wird

LaunchAgent:

- `com.niklas.finanztool.intergold-sync`
- Script: `automation/src/reconcile-intergold-local.mjs --write`
- NPM-Script: `npm --prefix automation run sync:intergold`
- Zeitplan: taeglich 08:20 am Mac Studio

Der Agent macht bei jedem Lauf:

1. Intergold-Webseite abrufen:
   `https://www.intergold-edelmetalle.com/aktuelles`
2. sichtbare Preisbloecke parsen:
   `Metall`, `Verkauf`, `Ankauf`, `Stand`
3. vorhandene Intergold-PDFs parsen
4. Metallbestand aggregieren
5. Bestand mit Ankaufspreisen bewerten
6. Firestore aktualisieren
7. HTML-Preissnapshot in Drive ablegen

## Firestore-Daten

Aktuell geschrieben:

- `sourcePositions`: 13 Metallpositionen
- `sourceSummaries/intergold`: Intergold-Karte
- `intergoldHoldings`: aggregierter Bestand je Metall
- `intergoldPrices`: aktueller Preis je Metall
- `intergoldPriceHistory`: historische Preisstaende, idempotent
- `agentStatus/intergold`: Agentstatus
- `sourceDocuments`: registrierte Intergold-Anhaenge
- `sourceDocumentFacts`: Kaufbeleg- und Positionsfakten
- `transactions`: Metall-Kaufzeilen
- `costEvents`: anteilige Kauf-/Lagerkosten

## Aktueller Stand

Verifizierter Lauf:

- Preisbloecke: 19
- gueltige Preisbloecke: 19
- Intergold-Preisstand Website: `2026-06-16`
- PDF-Dateien: 2
- geparste Einlagerungsbestaetigungen: 2
- Dokumentstand Bestand: `2026-03-23`
- Metallpositionen: 13
- fehlende Preise: 0
- konservativer Ankaufwert: `30.540,92 EUR`
- Verkaufswert: `35.559,33 EUR`
- Einstand inklusive anteiliger Kosten: `23.040,51 EUR`
- G/V konservativ: `+7.500,41 EUR`
- Performance konservativ: `+32,55 %`

## Berechnung

Je Metall:

- Menge aus Einlagerungsbestaetigungen
- Einstand = Positionswert laut Beleg plus anteilig zugeordnete Nebenkosten
- aktueller Wert = Menge mal Intergold-Ankaufspreis
- Verkaufswert = Menge mal Intergold-Verkaufspreis
- G/V = aktueller Ankaufwert minus Einstand
- Performance = G/V / Einstand

Summary:

- `currentValue`: Summe Ankaufwerte
- `saleValue`: Summe Verkaufswerte
- `costValue`: Summe Einstandswerte inklusive anteiliger Kosten
- `performanceValue`: `currentValue - costValue`
- `performancePct`: `performanceValue / costValue`

## Transparenzfelder

Intergold schreibt jetzt:

- `sourceDataUpdatedAt`: letzter fachlicher Dokumentstand
- `sourceDataProvider`: `intergold_confirmation_pdf`
- `documentDataUpdatedAt`: letzter fachlicher Dokumentstand
- `documentDataProvider`: `intergold_confirmation_pdf`
- `quoteDataUpdatedAt`: Preisstand der Intergold-Webseite
- `quoteDataProvider`: `intergold_website`
- `quoteDataChangedAt`: letzter Zeitpunkt, an dem dieser Preisstand erstmals
  in der History gespeichert wurde
- `lastAgentRunAt`: technischer Lauf
- `lastAgentSuccessAt`: letzter erfolgreicher Lauf

Beim aktuellen Lauf:

- Dokumentstand: `2026-03-23`
- Preisstand Website: `2026-06-16`
- letzte bekannte Preisaenderung: `2026-06-21T19:07:05.114Z`
- Agent zuletzt: `2026-06-21T22:34:03.750Z`
- `priceChanged`: `false`, weil sich die Websitepreise gegenueber dem bereits
  gespeicherten Stand nicht geaendert haben

## Robuste History

`intergoldPriceHistory` wird ueber einen stabilen Preis-ID-Schluessel
idempotent geschrieben:

```text
Metall + Preisstand + Einheit + Verkaufspreis + Ankaufspreis
```

Ein Agentlauf ohne geaenderte Preise erzeugt keinen neuen
History-Datensatz fuer denselben Preisstand.

## Verifizierte Checks

Ausgefuehrt:

```bash
npm --prefix automation run reconcile:intergold
npm --prefix automation run sync:intergold
npm --prefix automation run sync:health
npm --prefix app run build
```

Ergebnis:

- Dry-Run erfolgreich.
- Schreibender Sync erfolgreich.
- Health: `OK`.
- App-Build erfolgreich.

## Update 2026-06-27

Aktueller verifizierter Lauf:

- Preisbloecke: 19
- gueltige Preisbloecke: 19
- Intergold-Preisstand Website: `2026-06-23`
- PDF-Dateien: 2
- registrierte `sourceDocuments`: 2
- geparste Kauf-/Einlagerungsbestaetigungen: 2
- offene Intergold-Info-Dokumente im Postfach: 0
- `sourceDocumentFacts`: 19
- `transactions`: 17
- `costEvents`: 17
- Dokumentstand Bestand: `2026-03-23`
- Metallpositionen: 13
- fehlende Preise: 0
- konservativer Ankaufwert: `29.895,52 EUR`
- Verkaufswert: `34.863,99 EUR`
- Einstand inklusive anteiliger Kosten: `23.040,51 EUR`
- G/V konservativ: `+6.855,01 EUR`

Regel fuer neue Intergold-Anhaenge:

- Kauf-/Einlagerungsbelege werden geparst und in Bestand, Fakten,
  Transaktionen und Kosten uebernommen.
- Verkaufs-/Auslagerungsdokumente werden aktuell nicht automatisch gebucht,
  weil es noch keine echten Verkaufsdaten gibt. Sie bleiben im zentralen
  Dokumenten-Postfach.
- Sonstige Intergold-Anhaenge werden als Info-Dokumente registriert und
  bleiben im Dokumenten-Postfach, bis du sie als nicht relevant, wichtig/spaeter
  oder parserwuerdig markierst.
- Der Agent darf keine Intergold-Dokumente automatisch als nicht relevant,
  ignoriert oder fachlich erledigt markieren. Diese Entscheidung gehoert immer
  dir im Dokumenten-Postfach.

## Offene Punkte

- Verkaufsbestaetigungen und Rechnungen sind konzeptionell vorgesehen, aber
  aktuell nicht als eigener Reduktions-/Transaktionsstrom geprueft.
- Automatische Mailablage fuer neue Intergold-Belege muss noch end-to-end mit
  echten neuen E-Mail-Anhaengen auditiert werden.
