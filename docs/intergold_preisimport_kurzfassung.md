# Intergold Preisimport Kurzfassung

## Ziel

Intergold-Bestand aus Einlagerungsbelegen bewerten. Fuer die konservative Bewertung wird der
Intergold-Ankaufspreis verwendet.

## Datenquellen

- Preisquelle: `https://www.intergold-edelmetalle.com/aktuelles`
- Bestandsquelle: PDF-Belege in `Depot/01_Originale/Intergold/Einlagerungsbestaetigungen`

## Ablauf

1. Intergold-Webseite abrufen.
2. Sichtbaren Text in Zeilen normalisieren.
3. Alle Preisbloecke erkennen, die dieses Muster enthalten:
   - Metallname
   - `Verkauf: € ... / Einheit`
   - `Ankauf: € ... / Einheit`
   - `Stand ...`
4. Deutsche Zahlen in echte Zahlen umwandeln.
   - `46,19` -> `46.19`
   - `2.154,00` -> `2154.00`
5. Intergold-PDFs auslesen und alle Metallpositionen aggregieren.
6. `...oxid` im Beleg wird fuer die Preiszuordnung auf den Metallnamen gekuerzt.
   - `Terbiumoxid` -> `Terbium`
   - `Dysprosiumoxid` -> `Dysprosium`
7. Bestand mit Ankaufspreisen bewerten.
8. Ergebnis nach Firestore schreiben:
   - `sourceSummaries/intergold`
   - `intergoldHoldings`
   - `intergoldPrices`

## Aktueller importierter Stand

- Bestand: 13 Intergold-Positionen
- Bewertungsmethode: Ankaufspreise
- Preisstand: `2026-06-12`
- Ankauf-Bewertung: `30.286,77 EUR`
- Verkauf-Bewertung: `35.670,60 EUR`
- Investierter Betrag all-in laut Belegen: `23.040,51 EUR`
- Davon Metall-Rechnungswerte: `21.532,57 EUR`
- Anteilig beruecksichtigte Kaufgebuehren: `1.507,94 EUR`

## Lokale Befehle

Dry-Run ohne Firestore-Schreibzugriff:

```bash
npm --prefix automation run reconcile:intergold
```

Firestore-Abgleich mit aktuellem Preis-Snapshot:

```bash
npm --prefix automation run sync:intergold
```

## Wichtig

Die Website liefert nur Preise. Der persoenliche Bestand kommt aus den Belegen.
Preisimport und Belegimport bleiben getrennt.
