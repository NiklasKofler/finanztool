# Geraetewechsel-Protokoll

Stand: 2026-06-20

Dieses Protokoll haelt fest, was beim Wechsel zwischen Mac Studio und MacBook
Pro passiert ist. Es soll verhindern, dass lokale Probleme, offene Schritte
oder Geraeteunterschiede im Chat verloren gehen.

## Regeln

- Jeder `3333`-Handoff bekommt hier einen neuen Eintrag.
- Jeder erkannte Wechsel-Fehler bekommt hier einen neuen Eintrag.
- Jeder `1111`-Start liest den letzten Eintrag und meldet ihn im Chat kurz
  zurueck.
- Secrets werden hier nie ausgeschrieben. Nur Pfade, Keychain-Service-Namen
  oder der Hinweis "fehlt/lokal vorhanden" sind erlaubt.

## Eintragsformat

```text
Datum/Zeit:
Quellgeraet:
Zielgeraet:
Commit/Stand:
Aktion:
Erledigt:
Naechste Schritte:
Wechselprobleme:
Lokale Besonderheiten:
```

## Eintraege

### 2026-06-21 15:25 CEST - 3333 Handoff Mac Studio zu MacBook Pro

Datum/Zeit: 2026-06-21 15:25 CEST
Quellgeraet: Mac Studio von Niklas (`Mac.fritz.box`)
Zielgeraet: MacBook Pro
Commit/Stand: Ausgangscommit `7808ec6`; Handoff-Doku-Commit wird in diesem
`3333`-Lauf erstellt
Aktion: Lokal gespeicherten Depot-Agent-/Kursstrategie-Stand bauen, auf
GitHub pushen und nach Firebase deployen
Erledigt:
- Lokaler Savepoint `7808ec6` enthaelt die Agent-/DB-/GUI-Aenderungen:
  Flatex-Broker-Snapshot als primaere Bewertung, Bitget-Ledger-Erweiterungen,
  Firestore-Datenvertrag, manueller Vollrefresh und neue Kursstrategie
- Boerse-Frankfurt-Kurse laufen auf dem Mac Studio alle 5 Minuten in
  `quotesCurrent`; Tageshistorie laeuft getrennt um 22:00 in `priceHistory`
- `quoteAsOf`, `quoteFetchedAt`, `quoteVenue`, `quoteAgeMinutes` und
  `quoteFreshness` sind produktiv im Datenmodell vorgesehen
- App-Build und Agent-Tests waren vor dem Handoff erfolgreich
Naechste Schritte:
- Auf dem MacBook Pro `1111` ausfuehren
- Danach Pflichtdokumente lesen und kurz rueckmelden:
  `docs/device_workflow.md`, `docs/device_switch_log.md`,
  `docs/working_memory.md`, `README.md`
- Auf dem MacBook Pro keine produktiven LaunchAgents starten
- Falls weiter an Agents gearbeitet wird, spaeter per `3333` wieder an den
  Mac Studio uebergeben und dort `1111` plus Agent-Installation/Health pruefen
Wechselprobleme:
- Secrets und produktive LaunchAgents werden nicht per Git uebertragen
- Der Mac Studio bleibt produktiver Agent-Knoten fuer Drive, Browser-Syncs,
  API-Syncs und Kurslaeufe
- Firestore/Hosting-Deploy kann nach erfolgreichem Deploy die Firebase
  Hosting-Cache-Datei veraendern; falls das passiert, muss sie nachcommittet
  und erneut gepusht werden
Lokale Besonderheiten:
- `com.niklas.finanztool.quote-sync` laeuft auf dem Mac Studio alle 5 Minuten
- `com.niklas.finanztool.quote-history` laeuft auf dem Mac Studio taeglich
  um 22:00 Europe/Vienna

### 2026-06-20 18:38 CEST - 3333 Handoff MacBook Pro zu Mac Studio

Datum/Zeit: 2026-06-20 18:38 CEST
Quellgeraet: MacBook Pro
Zielgeraet: Mac Studio von Niklas
Commit/Stand: Ausgangscommit `1f659c5`; Handoff-Commit wird in diesem
`3333`-Lauf erstellt
Aktion: MacBook-Pro-Stand bauen, Uebergabe dokumentieren, auf GitHub pushen
und Firebase deployen
Erledigt:
- Handoff-Commit `f054467` auf GitHub gepusht
- Firebase Deploy am 2026-06-20 18:43 CEST erfolgreich ausgefuehrt
- Projekt auf dem MacBook Pro per `1111` von GitHub aktualisiert
- Pflichtdokumente gelesen und aktiver Stand uebernommen
- Node `22.23.0` per `nvm use` fuer Build verwendet
- App-Build erfolgreich ausgefuehrt
- Projektordner in Visual Studio Code geoeffnet:
  `/Users/niklaskofler/Documents/finanztool`
- Kein produktiver Mac-Studio-Agent wurde auf dem MacBook Pro gestartet
Naechste Schritte:
- Auf dem Mac Studio `1111` ausfuehren
- Danach pruefen:
  - lokale Secrets/Env-Dateien
  - `npm --prefix automation run sync:health`
  - `launchctl list | grep finanztool`
- Danach nur auf dem Mac Studio die produktiven Agents installieren oder neu
  starten, falls der Code-/Template-Stand es verlangt
Wechselprobleme:
- `automation/.env` und `secrets/firebase-service-account.json` fehlen auf
  dem MacBook Pro lokal; das ist fuer Entwicklung ok, aber nicht fuer
  lokale Agent-/Admin-Syncs
- Die Shell auf dem MacBook Pro nutzt ohne `nvm use` weiterhin Node `20.19.3`;
  fuer Agenten/PDF-Tooling ist Node 22 erforderlich
- Der interne Codex-Browser konnte auf dem MacBook Pro wegen eines
  Pluginfehlers `missing field sandboxPolicy` nicht automatisiert geoeffnet
  werden
- Ein LaunchAgent `com.niklas.finanztool.bitget-import` war auf dem MacBook
  Pro sichtbar; produktive Agenten sollen aber auf dem Mac Studio laufen
- `npx firebase-tools` `15.22.0` scheiterte wiederholt mit `Premature close`;
  der Deploy war mit der lokal installierten Firebase CLI `14.9.0`
  erfolgreich
Lokale Besonderheiten:
- `app/.env.local` ist auf dem MacBook Pro vorhanden
- Google-Drive-Depotordner sind auf dem MacBook Pro erreichbar

### 2026-06-20 17:47 CEST - 3333 Handoff Mac Studio zu MacBook Pro

Datum/Zeit: 2026-06-20 17:47 CEST
Quellgeraet: Mac Studio von Niklas
Zielgeraet: MacBook Pro
Commit/Stand: Ausgangscommit `0c65ab4`; Handoff-Commit `1f659c5`;
Firebase Deploy erfolgreich am 2026-06-20 17:48 CEST
Aktion: Projektstand fuer Geraetewechsel dokumentieren, bauen, auf GitHub
pushen und Firebase deployen
Erledigt:
- Geraetewechsel-Regeln zentral in `docs/device_workflow.md` festgelegt
- Wechselprotokoll `docs/device_switch_log.md` angelegt
- README und Working Memory verweisen auf `device_workflow` und
  `device_switch_log`
- Build, GitHub-Push und Firebase Deploy wurden erfolgreich ausgefuehrt
- Standardpfad auf beiden Geraeten bleibt:
  `/Users/niklaskofler/Documents/finanztool`
- Zahlencodes gelten auf beiden Geraeten gleich:
  `1111`, `2222`, `3333`
Naechste Schritte:
- Auf dem MacBook Pro Codex mit dem Erstprompt aus
  `docs/device_workflow.md` starten
- Danach `1111` ausfuehren lassen
- Codex muss am MacBook Pro kurz melden: aktives Geraet, Commit/Stand,
  letzter Stand vom Mac Studio, naechste Schritte und Wechselprobleme
Wechselprobleme:
- Secrets und produktive Agents werden nicht per Git uebertragen
- MacBook Pro darf keine produktiven Mac-Studio-LaunchAgents starten
- Falls lokale Aenderungen am MacBook Pro existieren, darf `1111` sie nicht
  ueberschreiben
Lokale Besonderheiten:
- Produktive Agents laufen weiter auf dem Mac Studio
- Mac Studio ist der produktive Agent-Knoten fuer Drive, Imports, API-Sync
  und Kurslaeufe

### 2026-06-20 - Mac Studio als aktueller Arbeitsstand

Datum/Zeit: 2026-06-20 CEST
Quellgeraet: Mac Studio
Zielgeraet: MacBook Pro spaeter
Commit/Stand: lokal mit uncommitteten Doku-Aenderungen nach Commit `0c65ab4`
Aktion: Geraetewechsel-Regeln und Zahlencodes dokumentiert
Erledigt:
- Standardpfad auf beiden Geraeten festgelegt:
  `/Users/niklaskofler/Documents/finanztool`
- `1111`, `2222`, `3333` als Projektcodes definiert
- Mac Studio als produktiver Agent-Knoten festgelegt
- MacBook Pro als Entwicklungsgeraet ohne produktive Studio-Agents festgelegt
- Erstprompt fuer neue Codex-Sessions dokumentiert
Naechste Schritte:
- Bei spaeterem `3333`: Doku-Aenderungen committen, GitHub pushen und
  Firebase deployen
- Danach auf dem MacBook Pro mit `1111` uebernehmen
Wechselprobleme:
- Bisher wichtigster Risikopunkt: lokale Secrets und produktive Agents sind
  nicht automatisch zwischen den Geraeten identisch
- Codex muss bei jedem Wechsel zuerst Status/Doku pruefen und kurz Feedback
  geben
Lokale Besonderheiten:
- Produktive Agents laufen auf dem Mac Studio
- Secrets liegen lokal, nicht in Git
