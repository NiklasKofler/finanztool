# Intergold Importkonzept

## Ziel

Intergold wird im Finanztool als eigene Quelle behandelt. Es gibt zwei getrennte Datenstroeme:

1. Preisimport von der oeffentlichen Intergold-Webseite
2. Belegimport aus Einlagerungs-, Verkaufs- und Rechnungs-PDFs

Die beiden Module duerfen nicht vermischt werden. Preise beschreiben den Marktwert, Belege beschreiben den persoenlichen Bestand beziehungsweise Transaktionen.

## Aktiver Ablageort

Basisordner:

```text
/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot
```

Intergold-Originale:

```text
01_Originale/Intergold/
├── Einlagerungsbestaetigungen/
├── Verkaufsbestaetigungen/
├── Rechnungen/
└── PreisSnapshots/
```

Neue, noch nicht einsortierte Dateien koennen zunaechst hier abgelegt werden:

```text
00_Inbox/Intergold/
```

## Dateiarten

### Einlagerungsbestaetigungen

Quelle:

- E-Mail-Anhaenge von Intergold
- aktuell vorhandene PDF-Dateien

Ablage:

```text
01_Originale/Intergold/Einlagerungsbestaetigungen/
```

Zweck:

- Nachweis ueber eingelagerte Metalle
- spaeter Extraktion von Metall, Menge, Datum, Referenznummer und ggf. Kauf-/Einstandsdaten

### Verkaufsbestaetigungen

Quelle:

- E-Mail-Anhaenge von Intergold

Ablage:

```text
01_Originale/Intergold/Verkaufsbestaetigungen/
```

Zweck:

- spaeter Extraktion von Verkaufsvorgaengen
- Reduktion des Bestands
- Ermittlung realisierter Gewinne/Verluste

### Rechnungen

Quelle:

- E-Mail-Anhaenge oder manuelle Ablage

Ablage:

```text
01_Originale/Intergold/Rechnungen/
```

Zweck:

- Kontrolle der Anschaffungskosten
- spaeter Abgleich mit Bestand und Einlagerungsbestaetigungen

### Preis-Snapshots

Quelle:

- oeffentliche Webseite: https://www.intergold-edelmetalle.com/aktuelles

Ablage:

```text
01_Originale/Intergold/PreisSnapshots/
```

Zweck:

- optionaler Rohdaten-/HTML-Snapshot je Preisabruf
- Nachvollziehbarkeit, falls sich die Webseite spaeter aendert

## Automatisierungsgrad

### Sofort sinnvoll

- Intergold-Webpreise automatisch abrufen
- sichtbaren Text nach Preisbloecken parsen
- Preisstand historisch speichern
- aktuellen Preis je Metall berechnen
- manuellen Bestand gegen Ankaufspreis bewerten

### Naechste Ausbaustufe

- Intergold-Mails erkennen
- PDF-Anhaenge automatisch speichern
- Duplikate per Dateiname, Mail-ID, Dateigroesse und Hash vermeiden
- Importstatus je Datei protokollieren

### Spaetere Ausbaustufe

- PDF-Inhalte aus Einlagerungs- und Verkaufsbestaetigungen extrahieren
- daraus Intergold-Transaktionen und Bestand ableiten
- unsichere Werte zur manuellen Pruefung markieren

## Preisimport

Datenquelle:

```text
https://www.intergold-edelmetalle.com/aktuelles
```

Parser-Prinzip:

- keine feste Metallliste
- keine Abhaengigkeit von CSS-Klassen
- Erkennung ueber sichtbare Textmuster

Erwartetes Muster:

```text
Metallname
Verkauf: EUR Betrag / Einheit
Ankauf: EUR Betrag / Einheit
Stand Datum
```

Beispiele:

```text
Antimon
Verkauf: € 46,19 / kg
Ankauf: € 39,75 / kg
Stand 12.05.2026

Gallium
Verkauf: € 2.154,00 / kg
Ankauf: € 1.795,00 / kg
Stand 12.05.2026
```

Deutsche Zahlenformate muessen normalisiert werden:

```text
46,19 -> 46.19
2.154,00 -> 2154.00
```

Das Datum wird als ISO-Datum gespeichert:

```text
12.05.2026 -> 2026-05-12
```

Wenn nach dem Datum Zusatztext steht, wird trotzdem nur das erste Datum nach `Stand` verwendet.

## Zieldatenmodell

### intergold_prices

Historische Preistabelle. Neue, nicht doppelte Preisstaende werden gespeichert.

```text
id
import_run_id
fetched_at
metal
unit
sell_price_eur
buy_price_eur
price_date
source
raw_text
status
created_at
```

Statuswerte:

```text
OK
UNVOLLSTAENDIG
FEHLER
DUPLIKAT
```

Duplikatregel:

```text
metal + price_date + sell_price_eur + buy_price_eur + unit
```

### intergold_current_prices

Aktueller letzter gueltiger Preis je Metall.

```text
metal
unit
sell_price_eur
buy_price_eur
price_date
last_fetched_at
source
status
```

### intergold_holdings

Persoenlicher Bestand. Anfangs manuell gepflegt, spaeter aus Belegen ableitbar.

```text
id
metal
quantity
unit
cost_basis_eur
purchase_date
source_document_id
note
status
```

### intergold_valuation

Berechnete Bewertung des Bestands.

```text
metal
quantity
unit
buy_price_eur
sell_price_eur
value_at_buy_price_eur
value_at_sell_price_eur
cost_basis_eur
profit_loss_eur
performance_percent
price_date
last_fetched_at
```

Bewertungslogik:

```text
value_at_buy_price_eur = quantity * buy_price_eur
value_at_sell_price_eur = quantity * sell_price_eur
profit_loss_eur = value_at_buy_price_eur - cost_basis_eur
performance_percent = profit_loss_eur / cost_basis_eur
```

Fuer die konservative Depotbewertung gilt primaer der Ankaufspreis.

### documents

Alle Originaldateien werden dokumentiert.

```text
id
source
document_type
original_filename
normalized_filename
path
sha256_hash
file_size
document_date
imported_at
status
```

### import_runs

Jeder Importlauf wird protokolliert.

```text
id
source
started_at
finished_at
status
message
records_found
records_imported
records_skipped
```

## Fehlerbehandlung

Wenn die Webseite nicht erreichbar ist:

- Fehler im Import-Log speichern
- bestehende aktuelle Preise nicht loeschen

Wenn keine Preisbloecke gefunden werden:

- Importlauf als FEHLER markieren
- gekuerzten Rohtext oder HTML-Snapshot speichern
- aktuelle Preise nicht ueberschreiben

Wenn ein PDF nicht sicher ausgelesen werden kann:

- Dokumentstatus `PRUEFEN`
- keine automatische Bestandsaenderung ohne Bestaetigung

## Entscheidungen

- Intergold ist ein aktives MVP-Modul.
- Preisimport und Belegimport bleiben getrennt.
- Originaldateien werden nie ueberschrieben.
- Google Sheets ist nicht Kernsystem.
- Die spaetere App liest Dateien aus der Ordnerstruktur und speichert strukturierte Daten in einer lokalen Datenbank.
- Konservative Bewertung nutzt Ankaufspreise.
- Unsichere PDF-Extraktionen muessen manuell bestaetigt werden.

## Offene Punkte

- Exakte Gmail-/Mail-Regeln fuer Intergold-Absender und Betreff definieren.
- Ein Beispiel fuer Verkaufsbestaetigung sammeln.
- Ein Beispiel fuer Rechnung sammeln, falls getrennt von Einlagerungsbestaetigung.
- Entscheiden, ob Preis-HTML-Snapshots dauerhaft gespeichert werden oder nur bei Fehlern.
