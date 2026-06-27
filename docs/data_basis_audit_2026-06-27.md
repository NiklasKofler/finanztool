# Datenbasis-Audit 2026-06-27

Ziel: pruefen, ob die Portfolio-Datenbasis fuer die ersten Dashboards belastbar
ist und welche Luecken vor Dashboard- und Abo-/Research-Integration offen
bleiben.

## Geprueft

- App-Build: `npm --prefix app run build` erfolgreich.
- Health: `npm --prefix automation run sync:health` erfolgreich. Aktuell
  Status `WARNUNG`, 0 Fehler, 3 Warnungen:
  - Capital.com API-Key ungueltig, Quelle derzeit inaktiv/zurueckgestellt.
  - Flatex-Portal meldete Wartungsseite; Datenmodell nicht betroffen.
  - 9 Ginmon-Informations-/Rechtsdokumente stehen bewusst im Postfach.
- Node-Syntaxchecks fuer geaenderte Agent-Dateien erfolgreich.
- In-App-Browser: lokale App unter `http://localhost:5173/` laedt ohne
  Konsolenfehler. Trade-Republic-Karte zeigt nur noch den Portal-Agenten und
  den Button `Nur Kurse`; Mail-/Manual-Export-Agenten erscheinen nicht mehr.
- LaunchAgents:
  - Bitget Import alle 5 Minuten.
  - Bitget Ledger stuendlich.
  - Flatex Broker-Snapshot alle 5 Minuten headless.
  - Flatex Dokumente taeglich 22:10.
  - Ginmon API alle 5 Minuten.
  - Ginmon Dokumente taeglich 02:00.
  - Intergold taeglich 08:20.
  - Bankkonten 07:00, 12:00, 17:30, 21:30.
  - VBV woechentlich Montag 06:45.
  - Quote-History taeglich 22:00.
  - Health alle 30 Minuten.
  - Command-Runner jede Minute.

## Umgesetzte Korrekturen

- Trade Republic:
  - `traderepublic_mail` und `traderepublic_manual_exports` sind nicht mehr
    aktive Agenten in der App-Karte.
  - Der Health-Check ignoriert alte Statusdokumente dieser beiden Legacy-
    Kanaele.
  - NPM-/LaunchAgent-Installationspfad fuer den alten
    Trade-Republic-Mail-Agenten entfernt.
- UI-Berechnung:
  - Gesamt-G/V oben wird jetzt aus `sourceSummaries.*.performanceValue` und
    `sourceSummaries.*.costValue` berechnet, nicht mehr nur aus
    Einzelpositionen. Dadurch werden auch Quellen ohne Einzelpositionen oder
    mit Summary-Performance korrekt beruecksichtigt.
  - Karten-/Gesamtwerte verwenden `sourceSummaries` als primaere Wahrheit;
    Positionen bleiben fuer Detailansicht, Aufklappen und Tagesaenderung.
- Trade Republic Refresh:
  - App-Button `Trade Republic: Refresh` nutzt den schnellen Portal-Snapshot.
  - Button `Nur Kurse` startet nur den Kurs-Sync ohne Trade-Republic-Login.
  - Voller Portal-Scan bleibt separat fuer gezielte Dokument-/Kosten-/Steuer-
    und Transaktionspruefung verfuegbar.
- Zentrales Eventmodell:
  - `event_model_v1_2026-06-27` fuer `transactions`, `ledgerEntries`,
    `costEvents` und `incomeEvents` festgelegt.
  - 4.305 bestehende Event-Dokumente in Firestore mit
    `eventGroupId`, `instrumentId`, `sourceAccountId`,
    `financialImpactEur`, `allocationStatus`, `allocationMethod`,
    `allocationConfidence` und `comparisonScope` ergaenzt.
  - Zweiter Dry-Run zeigt `changed=0`; kuenftige Laeufe schreiben nur noch
    geaenderte/fehlende Modellfelder.

## Aktuelle Datenabdeckung

| Quelle | Stand | Abdeckung | Restluecke |
| --- | --- | --- | --- |
| Flatex | OK | 17 Positionen, Brokerwerte aktuell, Cash/Kredit, 283 Dokumente, 409 Dokumentfakten, 89 Transaktionen, 119 Ledger, 129 Kosten, 39 Ertraege, Preis-History vorhanden | Keine akute Datenbasis-Luecke fuer diesen Sprint |
| Trade Republic | OK | 6 Positionen, Portal-Snapshot aktuell, 78 Dokumente, 351 Fakten, 212 Ledger, 13 Kosten, 15 Ertraege | Private-Markets-Dokumentbewertung weiter als Sonderfall; Portal-Vollscan nur gezielt |
| Ginmon | OK | 26 Positionen, 3 Depots, API aktuell, 382 Dokumente, 727 Fakten, 74 Transaktionen, 124 Ledger, 120 Kosten, 28 Ertraege | Keine akute Datenbasis-Luecke fuer diesen Sprint |
| Intergold | OK fuer Bewertung | 13 Positionen, 19 Webpreise, Ankauf/Verkauf/Einstand/GV berechnet | Belege sind nicht als `sourceDocuments`/`sourceDocumentFacts` sichtbar; Belegparser/Bestandsreduktionen fehlen |
| Bitget | OK | 3 Positionen, API-Wert aktuell, 2814 Ledger, 874 Fakten, 2 Kosten, 96 Ertraege | Historischer Vollstaendigkeits-Backfill nur bei Bedarf; keine externe Kursquelle gewuenscht |
| VBV | OK | 1 Kontoinformation-PDF, Vertragswerte, Einstand/GV | Keine Einzelpositionen/Transaktionen, erwartungsgemaess |
| EquatePlus | OK fuer aktuellen Stand | Manuelle Novartis-Anteile und Einstand, SIX-Kurs, G/V | Keine Dokumente, keine Vesting-/Kauf-/Steuerhistorie |
| Bankkonten | OK | 5 Unterkonten, Geldstand/Kreditlinien, 275 Umsaetze/Fakten, 2 Kosten | Revolut hat aktuell keine Umsaetze geliefert; Kreditkartenumsatzdetails/Abrechnungen fehlen |
| Capital.com | Inaktiv OK | 0 EUR, 0 Positionen | Keine offene Aufgabe, solange Konto inaktiv |

## Nachentscheidung 2026-06-27

- EquatePlus wird fuer den Datenbasis-Cleanup zurueckgestellt. Der aktuelle
  manuelle Novartis-Stand mit SIX-Kurs darf sichtbar bleiben, aber Vesting-,
  Kauf-, Steuer- und Dokumenthistorie werden erst spaeter erweitert.
- Kreditkarten werden fuer den Datenbasis-Cleanup zurueckgestellt. Bestehende
  Saldo-Unterkonten duerfen als Transparenzwerte sichtbar bleiben; weitere
  Portal-, Abrechnungs- und Transaktionsautomatisierung kommt spaeter.
- Der Cleanup konzentriert sich zuerst auf Flatex, Trade Republic, Ginmon,
  Intergold, Bitget, VBV und Bankkonten ohne Kreditkarten.
- Der verbindliche Plan liegt in
  [Datenbasis-Cleanup-Plan](/Users/niklaskofler/Documents/finanztool/docs/data_basis_cleanup_plan_2026-06-27.md).
- Nachtrag Agenten-Effizienz:
  - Ginmon und Flatex muessen inkrementell arbeiten und duerfen ohne neue
    Dokumente keine Vollverarbeitung starten.
  - Ginmon-Dokumenttest: 343 bekannte Portal-Dokumente, 0 neue Downloads,
    Reconcile uebersprungen.
  - Flatex-Portaltest am 2026-06-27 lieferte `https://www.flatex.at/wartung/`.
    Das ist kein Datenmodellfehler, wird aber korrekt als Health-Warnung
    gemeldet, bis der naechste erfolgreiche Broker-Snapshot laeuft.

## Fehlende Daten vor hochwertigen Dashboards

1. Kosten/Steuern/Ertraege je Produkt normalisieren:
   - Trade Republic Portal-/Tax-Report-Fakten in einheitliche Event-Struktur
     ueberfuehren.
2. Intergold-Belege als Dokumente/Fakten nachziehen:
   - Originalbelege, Einlagerung, Kaufkosten, Bestand und spaetere
     Bestandsreduktionen nachvollziehbar speichern.
3. EquatePlus nur mit aktuellen Werten belastbar und zurueckgestellt:
   - Fuer Kosten, Vesting, Kaufzeitpunkte, Rabattvorteil und Steuern fehlen
     echte Dokument-/Transaktionsdaten.
4. Kreditkarten zurueckgestellt:
   - Amazon Visa und TF Bank haben aktuell nur Saldo/Limit/Verfuegbar.
   - Umsatzdetails, Zinsen und Gebuehren fehlen noch.
5. Bankkonten:
   - Erste/Sparkasse und bank99 Umsaetze sind vorhanden.
   - Revolut muss beobachtet werden, weil aktuell keine Umsaetze geliefert
     wurden.

## Dashboard-Freigabe

Die aktuelle Datenbasis ist gut genug fuer erste Vermoegens-, Depotwert-,
Cash-/Kredit- und Performance-Dashboards. Fuer Kosten-/Steuer-/Produktanalyse
ist sie noch nicht vollstaendig genug; dafuer muessen die oben genannten
Event-Luecken geschlossen oder als eingeschraenkte Datenabdeckung sichtbar
gemacht werden.

## Nachpruefung vor Dashboard/GUI 2026-06-27 12:08 CEST

- App-Build erneut erfolgreich: `npm --prefix app run build`.
- Node-Syntaxcheck fuer alle `automation/src/*.mjs` erfolgreich.
- Eventmodell-Dry-Run erneut stabil:
  - `transactions`: 294, `changed=0`
  - `ledgerEntries`: 3550, `changed=0`
  - `costEvents`: 283, `changed=0`
  - `incomeEvents`: 178, `changed=0`
  - Gesamt: 4305 Events, `updated=0`
- Flatex-Event-Dry-Run stabil:
  - 409 Dokumentfakten
  - 89 Transaktionen
  - 119 Ledger
  - 129 Kosten
  - 39 Ertraege
- Ginmon-Event-Dry-Run stabil:
  - 727 Dokumentfakten
  - 74 Transaktionen
  - 124 Ledger
  - 120 Kosten
  - 28 Ertraege
- Kosten-Audit fuer relevante Depotpositionen erfolgreich:
  - 65 gepruefte Positionen
  - 58 mit Einstand in EUR
  - 7 Cash-/ausgeschlossene Positionen
  - 0 fehlende Einstandswerte
- Preis-Historie vorhanden:
  - `priceHistory`: 1133 Eintraege
  - Zeitraum: 2026-06-13 bis 2026-06-26
  - Quellen: Boerse Frankfurt, Bitget, Flatex, Ginmon, Intergold,
    Trade Republic
  - Positionshistorie-Dry-Run fuer 2026-06-27:
    72 Positionen verarbeitet, 49 mit Vortagsbasis, 29 mit Tagesaenderung.
- Dokumenten-Postfach aktuell leer: keine offenen `documentInbox`-Faelle.
- Health-Check aktuell `WARNUNG`, aber 0 Fehler:
  - Bankkonten: 1 Bank ohne Abruf, trotzdem 2 Konten und 2141,64 EUR
    Geldstand gelesen.
  - Capital.com: API-Key ungueltig, Quelle derzeit zurueckgestellt.
  - Flatex: Portal zeigte Wartungsseite; vorhandene Datenbasis nicht
    betroffen.
  - Ginmon: 9 Informations-/Rechtsdokumente warten bewusst auf User-
    Entscheidung oder spaeteren Parser.

Freigabe: Die Datenbasis ist fuer die naechste Phase
`Dashboards und GUI` ausreichend stabil. Dashboards muessen aber Warnungen,
Quellenstand und Datenabdeckung sichtbar machen, statt fehlende Quellen still
zu ueberdecken.
