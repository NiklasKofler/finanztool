# Kursdaten-API Plan

## Ziel

Alle brokerbasierten Positionen sollen dynamisch bewertet werden. Der erfasste Gesamtwert in der
App ergibt sich aus den bewerteten Einzelpositionen, nicht aus manuell gepflegten Depot-Summaries.

Intergold bleibt separat, weil die Bewertung dort ueber Intergold-Ankauf- und Verkaufspreise laeuft.

## Datenmodell

```text
sourcePositions
  Bestandspositionen je Anbieter. Nach dem Kursabgleich enthalten Wertpapiere currentValue,
  quotePrice, quoteCurrency, quoteProviderSymbol und quoteAsOf.

instruments
  Stammdaten je ISIN, z. B. Name, Typ, primaeres Provider-Symbol und Boerse.

instrumentMappings
  Provider-spezifisches Mapping, aktuell ISIN -> Boerse-Frankfurt-MIC.

quotesCurrent
  Letzter Kurs je Instrument inklusive Preis in Originalwaehrung, FX-Rate und EUR-Preis.
```

## Bewertungslogik

```text
positionswert_eur = quantity * quote_price_eur
source_summary = sum(sourcePositions.currentValue where accountValueIncluded != false)
```

Cash wird ebenfalls als eigene Position gespeichert, z. B. `flatex_cash_eur`. Dadurch kann die
App den Gesamtwert aus Positionen berechnen und trotzdem Depotwert und Kontostand getrennt anzeigen.

## Boerse Frankfurt

Boerse Frankfurt ist die primaere Kursquelle fuer Wertpapiere. Der Agent nutzt die
oeffentlichen Website-APIs der Boerse Frankfurt und erzeugt die noetigen
Website-Sicherheitsheader lokal. Es ist kein API-Key notwendig.

Stand 2026-06-13: Die aktuelle Implementierung nutzt
`https://api.live.deutsche-boerse.com/v1` ueber
`automation/src/quote-provider-boerse-frankfurt.mjs`. Das ist ein
Website-Endpunkt der Deutsche-Boerse-Live-/Boerse-Frankfurt-Oberflaeche und
keine vertraglich garantierte stabile API. Die Deutsche Boerse verweist fuer
offizielle API-Produkte auf ihre API Platform; falls der Website-Endpunkt
geaendert oder blockiert wird, muss ein offizieller Datenzugang oder ein
Fallback wie EODHD bewertet werden.

Der Abgleich funktioniert dynamisch:

1. Neue Positionen mit ISIN werden aus `sourcePositions` gelesen.
2. Fuer jede ISIN wird automatisch das Instrument bei Boerse Frankfurt gesucht.
3. Das Mapping wird in `instrumentMappings` gespeichert.
4. Der Kurs wird bevorzugt ueber Xetra (`XETR`) geladen, sonst ueber Frankfurt (`XFRA`) oder den von Boerse Frankfurt gelieferten Standardplatz.
5. `sourcePositions.currentValue` und `sourceSummaries` werden aus den Einzelpositionen neu berechnet.

Dry-Run ohne Firestore-Schreibzugriff:

```bash
npm --prefix automation run reconcile:quotes
```

Firestore-Abgleich:

```bash
npm --prefix automation run sync:quotes
```

Ein Teil-Lauf fuer Tests:

```bash
npm --prefix automation run reconcile:quotes -- --max-instruments=5
```

Verifizierter Teil-Lauf am 2026-06-13:

```bash
cd /Users/niklaskofler/Documents/finanztool/automation
npm run reconcile:quotes -- --max-instruments=5 --delay-ms=50
```

Ergebnis:

- 20 Flatex/Trade-Republic-Instrumente im Kursuniversum
- 5 Testinstrumente verarbeitet
- 5/5 Kurse erfolgreich geladen
- keine Mapping-Warnung im Testlauf

Alle Instrumente werden standardmaessig verarbeitet. Explizit geht das auch so:

```bash
npm --prefix automation run reconcile:quotes -- --max-instruments=0
```

Die Requests werden standardmaessig leicht gedrosselt. Fuer Tests kann die Pause angepasst werden:

```bash
npm --prefix automation run reconcile:quotes -- --delay-ms=50
```

## EODHD

EODHD bleibt als optionaler spaeterer Fallback moeglich, ist aber aktuell nicht die
primaere Quelle. Der bisher angelegte Setup-Befehl fuer den API-Key bleibt im Projekt,
wird fuer den Boerse-Frankfurt-Abgleich aber nicht benoetigt.

```bash
npm --prefix automation run setup:eodhd
```

## Sicherheitsregel

Wenn das ISIN-Mapping unsicher oder nicht vorhanden ist, wird kein Kurs geraten. Die Position bekommt
`quoteStatus: MAPPING_REQUIRED` und bleibt pruefbar.

Aktueller bekannter Sonderfall:

- Trade Republic Private Equity `LU3176111881` ist bei Boerse Frankfurt nicht auffindbar. Der zuletzt aus dem Trade-Republic-Net-Worth-PDF importierte Wert bleibt daher erhalten, bis wir eine passende Quelle oder einen manuellen Bewertungsmechanismus definieren.
