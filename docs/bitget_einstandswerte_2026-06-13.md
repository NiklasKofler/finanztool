# Bitget Einstandswerte - Stand 2026-06-13

## Ergebnis

Die historischen Bitget-Exporte wurden am 13.06.2026 heruntergeladen und unter
folgendem Google-Drive-Pfad abgelegt:

`My Drive/Depot/01_Originale/Bitget/API_Exports/`

Dateien:

- `Bitget_OrderHistory_2024-06-13_bis_2025-06-12.zip`
- `Bitget_OrderHistory_2025-06-13_bis_2026-06-13.zip`

Damit ist der gesamte von Bitget im Self-Service angebotene Zeitraum abgedeckt.
Die erste im Export enthaltene Bewegung ist eine BTC-Einzahlung vom 24.08.2024.

## Verifizierte Einstandswerte

| Position | Aktueller Bestand | Brutto gekauft | Gebuehr in Coin | Bezahlter Betrag | Einstand je aktuellem Coin |
| --- | ---: | ---: | ---: | ---: | ---: |
| TRUMP | 20,20977 TRUMP | 20,23 TRUMP | 0,02023 TRUMP | 990,80114 USDT | 49,025849 USDT |
| MELANIA | 66,20373 MELANIA | 66,27 MELANIA | 0,06627 MELANIA | 289,53119 USDT | 4,373337 USDT |

Die Einstandswerte enthalten die beim Kauf in Coin abgezogenen Gebuehren. Sie
sind in USDT exakt, koennen aber noch nicht verlaesslich in EUR umgerechnet
werden, weil die tatsaechlich fuer die USDT-Kaeufe beziehungsweise Einzahlungen
bezahlten EUR-Betraege in den Bitget-Exporten fehlen.

## BTC-Herkunft

| Datum | Bewegung | Betrag | Aussage zum Einstand |
| --- | --- | ---: | --- |
| 24.08.2024 | Externe BTC-Einzahlung | 0,066 BTC | Urspruenglicher Kaufpreis ist Bitget nicht bekannt |
| 06.09.2024 | BTC-Kauf mit Karte | 0,000856 BTC | Bezahlter Kartenbetrag fehlt im Export |
| 22.01.2025 | Transfer in Spot | 0,066 BTC | Interne Rueckuebertragung, kein neuer Kauf |
| 06.02.2025 | Simple Earn Einzahlung | 0,066856 BTC | Gesamter damaliger BTC-Bestand wurde angelegt |

Der aktuelle Spot-BTC-Bestand stammt praktisch vollstaendig aus Earn-Zinsen.
Der Earn-Bestand von `0,066856 BTC` ist der angelegte urspruengliche Bestand.

## Noch fehlende Informationen

Fuer vollstaendige EUR-Einstandswerte werden einmalig benoetigt:

- EUR-Betrag der Kartenbuchung fuer `0,000856 BTC` vom 06.09.2024
- urspruenglicher Kaufpreis der extern eingezahlten `0,066 BTC`
- EUR-Gegenwert der am 20.01.2025 per Karte gekauften `981,0823 USDT`
- EUR-Gegenwert der am 21.01.2025 eingezahlten `289,7462 USDT`

Diese Werte koennen am verlaesslichsten aus Kreditkarten- oder Bankumsatzdaten
rekonstruiert werden. Bis dahin bleiben die EUR-Einstandswerte in Firestore
bewusst leer; aktuelle Wechselkurse duerfen nicht rueckwirkend als Einstand
verwendet werden.

## Importlogik

- Aktuelle Bestaende und Kurse kommen weiterhin alle 15 Minuten aus der Bitget
  Read-only API.
- Historische Exporte dienen nur zur einmaligen Rekonstruktion und Kontrolle.
- Die verifizierten Werte liegen persistent in `sourceCostBasis` und werden bei
  jedem API-Snapshot zugemischt.
- TRUMP und MELANIA bleiben mit `VERIFIED_QUOTE_ONLY` markiert, bis ihr
  tatsaechlicher EUR-Einstand bekannt ist.
- Earn-BTC ist mit `MISSING_EXTERNAL_COST` markiert.
- Spot-BTC ist mit `VERIFIED_ZERO_COST` markiert, weil dieser Bestand laut
  Export aus Earn-Zinsen stammt.
- Earn-Zinsen haben einen Einstand von null und erhoehen nicht die historische
  Kostenbasis.
