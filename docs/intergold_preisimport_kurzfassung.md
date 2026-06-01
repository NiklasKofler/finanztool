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
- Ankauf-Bewertung: `31.289,53 EUR`
- Verkauf-Bewertung: `36.670,63 EUR`
- Investierter Betrag laut Belegen: `23.040,51 EUR`

## Wichtig

Die Website liefert nur Preise. Der persoenliche Bestand kommt aus den Belegen.
Preisimport und Belegimport bleiben getrennt.

