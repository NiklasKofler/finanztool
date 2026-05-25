# Ginmon Import Konzept

## Ziel

Ginmon wird als eigenes Modul gefuehrt. Die App soll den aktuellen Bestand,
die Performance, die Gebuehren und die Strategie sauber auswerten koennen.

## Was wir schon haben

- `Asset Status` Reports mit Depotwert, Geldkonto, Gesamtvermoegen und Gebuehren
- `Account Statements` mit Kontobewegungen und Wertpapierbewegungen
- `Invoices` fuer die laufenden Verwaltungsgebuehren
- `Quarterly Reports` fuer die Zusammenfassung je Quartal
- `Strategie`-Material zur Zielallokation und Risikoausrichtung

## Aktueller Stand

- Zugriff ist ohne 2FA moeglich
- Struktur ist bereits fuer Download und Archivierung geeignet
- Die relevante Strategie ist `AP18 / Global 8`
- Die laufende Verwaltungsgebuehr liegt bei `0,75 % p.a.`

## Wichtige Felder fuer die App

- Depotwert
- Geldkonto / Liquiditaet
- Gesamtvermoegen
- Nettoumlauf / Einzahlungen
- Performance
- Verwaltungsgebuehren
- Positionen nach ISIN
- Zielstrategie und Risikoprofil

## Sinnvolle Taktung

- `Asset Status`: monatlich reicht fuer den Normalfall
- `Account Statements`: monatlich oder bei auffaelligen Veraenderungen
- `Invoices`: sobald eine neue Rechnung verfuegbar ist
- `Quarterly Report`: quartalsweise
- `Strategie`: nur bei Aenderungen oder neuem Angebot

## Ablage

Ginmon-Dokumente liegen im Depot-Ordner unter:

`/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/01_Originale/Ginmon`

## Einordnung

Ginmon ist fuer die App vor allem:

- automatisierbarer Bestand
- klare Kostenquelle
- Strategie- und Risikoquelle
- kein manueller Handelsschwerpunkt

Damit ist Ginmon neben Flatex und Trade Republic ein zentrales Modul fuer die
spaeteren Depot- und Kostenanalysen.
