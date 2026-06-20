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
