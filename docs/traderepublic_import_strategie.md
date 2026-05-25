# Trade Republic Import Strategie

## Ziel

Trade Republic wird wegen 2FA nicht direkt automatisiert. Der mobile Workflow bleibt:

1. In der Trade-Republic-App die vier Reports erzeugen.
2. Die Reports ohne Betreff an die eigene Mail schicken.
3. Codex legt die Anhange in den Depot-Ordner ab und ueberschreibt die alten Dateien.

## Zielnamen

- `2026-05-24_TradeRepublic_TransactionExport.csv`
- `2026-05-24_TradeRepublic_AccountStatement.pdf`
- `2026-05-24_TradeRepublic_NetWorth.pdf`
- `2025_TradeRepublic_TaxReport.pdf`

## Zuordnung

- `Transaction export.csv` -> `TransactionExport.csv`
- `Account statement.pdf` -> `AccountStatement.pdf`
- `Net Worth.pdf` -> `NetWorth.pdf`
- `Tax Report 2025.pdf` -> `TaxReport.pdf`

## Ablage

`/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/01_Originale/TradeRepublic`

## Sinnvolle Taktung

- `Transaction export`: woechentlich, weil die Einzahlungen woechentlich laufen und die Datei die eigentliche Bewegungsquelle ist.
- `Account statement`: monatlich reicht meist aus, weil das die Kontobewegungen und den Kontostand konsolidiert.
- `Net Worth`: bei Bedarf oder zusammen mit dem Wochenlauf, wenn ein aktueller Snapshot wichtig ist.
- `Tax Report`: jaehrlich, sobald er verfuegbar ist.

## Warum so

- Woechentliche Exporte halten den manuellen Aufwand klein.
- Tagesgenaue Werte liefert bei Trade Republic ohnehin der `Net Worth`-Report.
- Die eigentliche Buchungswahrheit liegt im `Transaction export`; das `Account statement` ist vor allem fuer Cash-Reconciliation und Belege wichtig.
- Das `Tax Report`-Dokument bleibt ein Jahresbeleg fuer Steuer und Archiv.
