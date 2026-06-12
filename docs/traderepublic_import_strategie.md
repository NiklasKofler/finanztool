# Trade Republic Import Strategie

Stand: 2026-06-13

## Ziel

Trade-Republic-Transaktionen sollen moeglichst automatisch und zeitnah in die App gelangen.
Wegen 2FA bleibt der direkte automatisierte Broker-Zugriff ungeeignet.

## Primaerer Weg: taegliche Abrechnungsmails

Wenn Transaktionen stattgefunden haben, sendet Trade Republic am Ende des Tages automatisch eine Mail:

```text
Duplicates customer Niklas Andre Kofler of DD.MM.YYYY.
```

Diese Mail enthaelt ein oder mehrere passwortgeschuetzte PDFs vom Typ:

```text
duplicates-dispatch_Securities Settlement-<id>.pdf
```

Der geplante Mail-Agent auf dem Mac Studio soll:

1. passende Trade-Republic-Mails erkennen
2. PDF-Anhaenge herunterladen
3. Originaldateien unveraendert archivieren
4. PDF-Passwort aus dem macOS-Schluesselbund lesen
5. PDFs fuer die Textauswertung entschluesseln
6. enthaltene Transaktionen parsen
7. Duplikate erkennen und nach Firestore schreiben

## Passwortbehandlung

Trade Republic sendet das PDF-Passwort separat per Mail:

```text
Password for duplicates of your employees
```

Sicherheitsentscheidung:

- Passwort nicht in der App speichern
- Passwort nicht in Firestore speichern
- Passwort nicht in Git oder Dokumentation speichern
- Passwort lokal im macOS-Schluesselbund des Mac Studio speichern
- Agent soll eine neue Passwort-Mail erkennen und den Schluesselbundwert aktualisieren

## Periodischer Abgleich

Die taeglichen PDFs sind der zeitnahe Transaktionskanal. Folgende Reports bleiben als Kontroll- und Ergaenzungsquellen:

- `Transaction export.csv`: periodisch fuer Historie und Vollstaendigkeitsabgleich
- `Net Worth.pdf`: periodisch fuer aktuelle Positionswerte
- `Account statement.pdf`: monatlich fuer Cash- und Kontoabgleich
- `Tax Report`: jaehrlich als Steuerbeleg

## Noch zu pruefen

1. Welche Transaktionsarten stehen in den taeglichen `Securities Settlement` PDFs?
2. Sind Sparplaene, Verkaeufe, Dividenden, Zinsen, Gebuehren und Steuern vollstaendig enthalten?
3. Welche Daten fehlen gegenueber `Transaction export.csv` und `Account statement.pdf`?
4. Kann die Zuordnung anhand einer stabilen Dokument-ID erfolgen?

## Ziel-Aktualitaet

- Transaktionen: automatisch am Folgetag nach Eingang der Sammelmail
- Positionen und Marktwerte: periodisch ueber `Net Worth.pdf`
- Cash-Abgleich: monatlich ueber `Account statement.pdf`
