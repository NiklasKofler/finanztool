# Geraetewechsel-Protokoll

Stand: 2026-06-20

Dieses Protokoll haelt fest, was beim Wechsel zwischen Mac Studio und MacBook
Pro passiert ist. Es soll verhindern, dass lokale Probleme, offene Schritte
oder Geraeteunterschiede im Chat verloren gehen.

## Regeln

- Jeder `ftu`-Handoff bekommt hier einen neuen Eintrag.
- Jeder erkannte Wechsel-Fehler bekommt hier einen neuen Eintrag.
- Jeder `ftd`-Start liest den letzten Eintrag und meldet ihn im Chat kurz
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
- Handoff-Commit `bbc6885` auf GitHub gepusht
- Firebase Deploy 2026-06-22 20:28 CEST erfolgreich
- Handoff-Commit `434c93b` auf GitHub gepusht
- Firebase Deploy 2026-06-22 18:09 CEST erfolgreich
- Handoff-Commit `0c4e0c2` auf GitHub gepusht
- Firebase Deploy 2026-06-22 17:48 CEST erfolgreich
- Handoff-Commit `89e00e5` auf GitHub gepusht
- Firebase Deploy 2026-06-21 21:05 CEST erfolgreich
- Handoff-Commit `c760547` auf GitHub gepusht
- Firebase Deploy 2026-06-21 20:49 CEST erfolgreich
- Handoff-Commit `ea586b7` auf GitHub gepusht
- Firebase Deploy 2026-06-21 19:46 CEST erfolgreich
- Handoff-Commit `d1fff3c` auf GitHub gepusht
- Firebase Deploy 2026-06-21 19:01 CEST erfolgreich
- Handoff-Commit `3874bf2` auf GitHub gepusht
- Firebase Deploy 2026-06-21 18:08 CEST erfolgreich
Naechste Schritte:
Wechselprobleme:
Lokale Besonderheiten:
```

## Eintraege

### 2026-06-22 20:28 CEST - ftp Handoff Mac Studio von Niklas zu MacBook Pro

Datum/Zeit: 2026-06-22 20:28 CEST
Quellgeraet: Mac Studio von Niklas
Zielgeraet: MacBook Pro
Commit/Stand: Ausgangscommit `9994c4d`; Handoff-Commit wird in diesem
`ftp`-Lauf erstellt; Handoff-Commit `bbc6885`
Aktion: Projektstand bauen, Uebergabe dokumentieren, auf GitHub pushen und
Firebase deployen
Erledigt:
- `ftp` wurde auf Mac Studio von Niklas gestartet
- App-Build wird im Workflow ausgefuehrt
- Geaenderte Dateien vor Handoff:
  - M app/src/App.css
  -  M automation/src/install-ft-shortcuts.sh
  -  M automation/src/project-workflow.mjs
  -  M docs/device_workflow.md
  -  M docs/firestore_data_contract.md
  -  M docs/working_memory.md
  -  M package.json
  - ?? bin/ftp
Naechste Schritte:
- Auf MacBook Pro `ftd` ausfuehren
- Danach lokalen Status, Secrets und ggf. Agents pruefen
Wechselprobleme:
- Secrets und produktive LaunchAgents werden nicht per Git uebertragen
- Mac Studio bleibt produktiver Agent-Knoten
Lokale Besonderheiten:
- Kurzbefehle: `ftd` Download, `fts` Save, `ftp` Publish; `ftu` ist alter Alias

### 2026-06-22 18:09 CEST - ftu Handoff Mac Studio von Niklas zu MacBook Pro

Datum/Zeit: 2026-06-22 18:09 CEST
Quellgeraet: Mac Studio von Niklas
Zielgeraet: MacBook Pro
Commit/Stand: Ausgangscommit `dd9fa3a`; Handoff-Commit wird in diesem
`ftu`-Lauf erstellt; Handoff-Commit `bbc6885`; Handoff-Commit `434c93b`
Aktion: Projektstand bauen, Uebergabe dokumentieren, auf GitHub pushen und
Firebase deployen
Erledigt:
- `ftu` wurde auf Mac Studio von Niklas gestartet
- App-Build wird im Workflow ausgefuehrt
- Geaenderte Dateien vor Handoff:
  - M app/src/App.css
  -  M docs/firestore_data_contract.md
  -  M docs/working_memory.md
Naechste Schritte:
- Auf MacBook Pro `ftd` ausfuehren
- Danach lokalen Status, Secrets und ggf. Agents pruefen
Wechselprobleme:
- Secrets und produktive LaunchAgents werden nicht per Git uebertragen
- Mac Studio bleibt produktiver Agent-Knoten
Lokale Besonderheiten:
- Kurzbefehle: `ftd` Download, `fts` Save, `ftu` Upload

### 2026-06-22 17:48 CEST - ftu Handoff Mac Studio von Niklas zu MacBook Pro

Datum/Zeit: 2026-06-22 17:48 CEST
Quellgeraet: Mac Studio von Niklas
Zielgeraet: MacBook Pro
Commit/Stand: Ausgangscommit `a0cdf06`; Handoff-Commit wird in diesem
`ftu`-Lauf erstellt; Handoff-Commit `0c4e0c2`
Aktion: Projektstand bauen, Uebergabe dokumentieren, auf GitHub pushen und
Firebase deployen
Erledigt:
- `ftu` wurde auf Mac Studio von Niklas gestartet
- App-Build wird im Workflow ausgefuehrt
- Geaenderte Dateien vor Handoff:
  - M app/src/App.css
  -  M app/src/App.tsx
  -  M app/src/domain/types.ts
  -  M app/src/firebase/sourceSummaries.ts
  -  M automation/README.md
  -  M automation/launchd/com.niklas.finanztool.vbv-sync.plist.template
  -  M automation/package.json
  -  M automation/src/bitget-client.mjs
  -  M automation/src/check-health-local.mjs
  -  M automation/src/import-bitget-local.mjs
  -  M automation/src/install-all-agents.sh
  -  M automation/src/install-vbv-launch-agent.sh
  -  M automation/src/reconcile-intergold-local.mjs
  -  M automation/src/run-full-refresh-local.mjs
  -  M automation/src/sync-bitget-ledger-local.mjs
  -  M automation/src/sync-quotes-local.mjs
  -  M automation/src/sync-vbv-local.mjs
  -  M automation/src/trade-republic-mail-agent.mjs
  -  M automation/src/vbv-browser.mjs
  -  M docs/bitget_data_audit_2026-06-20.md
  -  M docs/export_import_runbook_mac_studio.md
  -  M docs/firestore_data_contract.md
  -  M docs/import_masterplan.md
  -  M docs/mac_studio_handoff_2026-06-13.md
  -  M docs/traderepublic_import_strategie.md
  -  M docs/working_memory.md
  - ?? automation/launchd/com.niklas.finanztool.traderepublic-manual-exports.plist.template
  - ?? automation/src/install-traderepublic-manual-export-agent.sh
  - ?? automation/src/trade-republic-manual-export-agent.mjs
  - ?? automation/src/vbv-account-information-parser.mjs
Naechste Schritte:
- Auf MacBook Pro `ftd` ausfuehren
- Danach lokalen Status, Secrets und ggf. Agents pruefen
Wechselprobleme:
- Secrets und produktive LaunchAgents werden nicht per Git uebertragen
- Mac Studio bleibt produktiver Agent-Knoten
Lokale Besonderheiten:
- Kurzbefehle: `ftd` Download, `fts` Save, `ftu` Upload

### 2026-06-21 20:54 CEST - ftu Handoff MacBook Pro zu Mac Studio von Niklas

Datum/Zeit: 2026-06-21 20:54 CEST
Quellgeraet: MacBook Pro
Zielgeraet: Mac Studio von Niklas
Commit/Stand: Ausgangscommit `375a247`; Handoff-Commit wird in diesem
`ftu`-Lauf erstellt; Handoff-Commit `89e00e5`
Aktion: Projektstand bauen, Uebergabe dokumentieren, auf GitHub pushen und
Firebase deployen
Erledigt:
- `ftu` wurde auf MacBook Pro gestartet
- App-Build wird im Workflow ausgefuehrt
- Geaenderte Dateien vor Handoff:
  - keine vorbestehenden Aenderungen
Naechste Schritte:
- Auf Mac Studio von Niklas `ftd` ausfuehren
- Danach lokalen Status, Secrets und ggf. Agents pruefen
Wechselprobleme:
- Secrets und produktive LaunchAgents werden nicht per Git uebertragen
- Mac Studio bleibt produktiver Agent-Knoten
Lokale Besonderheiten:
- Kurzbefehle: `ftd` Download, `fts` Save, `ftu` Upload

### 2026-06-21 20:49 CEST - ftu Handoff Mac Studio von Niklas zu MacBook Pro

Datum/Zeit: 2026-06-21 20:49 CEST
Quellgeraet: Mac Studio von Niklas
Zielgeraet: MacBook Pro
Commit/Stand: Ausgangscommit `e15ac6f`; Handoff-Commit wird in diesem
`ftu`-Lauf erstellt; Handoff-Commit `c760547`
Aktion: Projektstand bauen, Uebergabe dokumentieren, auf GitHub pushen und
Firebase deployen
Erledigt:
- `ftu` wurde auf Mac Studio von Niklas gestartet
- App-Build wird im Workflow ausgefuehrt
- Geaenderte Dateien vor Handoff:
  - keine vorbestehenden Aenderungen
Naechste Schritte:
- Auf MacBook Pro `ftd` ausfuehren
- Danach lokalen Status, Secrets und ggf. Agents pruefen
Wechselprobleme:
- Secrets und produktive LaunchAgents werden nicht per Git uebertragen
- Mac Studio bleibt produktiver Agent-Knoten
Lokale Besonderheiten:
- Kurzbefehle: `ftd` Download, `fts` Save, `ftu` Upload

### 2026-06-21 20:26 CEST - ftu Handoff MacBook Pro zu Mac Studio von Niklas

Datum/Zeit: 2026-06-21 20:26 CEST
Quellgeraet: MacBook Pro
Zielgeraet: Mac Studio von Niklas
Commit/Stand: Ausgangscommit `ed1e9ef`; Handoff-Commit wird in diesem
`ftu`-Lauf erstellt
Aktion: Projektstand bauen, Uebergabe dokumentieren, auf GitHub pushen und
Firebase deployen
Erledigt:
- `ftu` wurde auf MacBook Pro gestartet
- App-Build wird im Workflow ausgefuehrt
- Geaenderte Dateien vor Handoff:
  - keine vorbestehenden Aenderungen
Naechste Schritte:
- Auf Mac Studio von Niklas `ftd` ausfuehren
- Danach lokalen Status, Secrets und ggf. Agents pruefen
Wechselprobleme:
- Secrets und produktive LaunchAgents werden nicht per Git uebertragen
- Mac Studio bleibt produktiver Agent-Knoten
Lokale Besonderheiten:
- Kurzbefehle: `ftd` Download, `fts` Save, `ftu` Upload

### 2026-06-21 20:21 CEST - ftu Handoff MacBook Pro zu Mac Studio von Niklas

Datum/Zeit: 2026-06-21 20:21 CEST
Quellgeraet: MacBook Pro
Zielgeraet: Mac Studio von Niklas
Commit/Stand: Ausgangscommit `d606237`; Handoff-Commit wird in diesem
`ftu`-Lauf erstellt
Aktion: Projektstand bauen, Uebergabe dokumentieren, auf GitHub pushen und
Firebase deployen
Erledigt:
- `ftu` wurde auf MacBook Pro gestartet
- App-Build wird im Workflow ausgefuehrt
- Geaenderte Dateien vor Handoff:
  - keine vorbestehenden Aenderungen
Naechste Schritte:
- Auf Mac Studio von Niklas `ftd` ausfuehren
- Danach lokalen Status, Secrets und ggf. Agents pruefen
Wechselprobleme:
- Secrets und produktive LaunchAgents werden nicht per Git uebertragen
- Mac Studio bleibt produktiver Agent-Knoten
Lokale Besonderheiten:
- Kurzbefehle: `ftd` Download, `fts` Save, `ftu` Upload

### 2026-06-21 19:46 CEST - ftu Handoff Mac Studio von Niklas zu MacBook Pro

Datum/Zeit: 2026-06-21 19:46 CEST
Quellgeraet: Mac Studio von Niklas
Zielgeraet: MacBook Pro
Commit/Stand: Ausgangscommit `1d17793`; Handoff-Commit wird in diesem
`ftu`-Lauf erstellt; Handoff-Commit `ea586b7`
Aktion: Projektstand bauen, Uebergabe dokumentieren, auf GitHub pushen und
Firebase deployen
Erledigt:
- `ftu` wurde auf Mac Studio von Niklas gestartet
- App-Build wird im Workflow ausgefuehrt
- Geaenderte Dateien vor Handoff:
  - M README.md
  -  M automation/src/project-workflow.mjs
  -  M bin/ftu
  -  M docs/device_workflow.md
  -  M docs/working_memory.md
Naechste Schritte:
- Auf MacBook Pro `ftd` ausfuehren
- Danach lokalen Status, Secrets und ggf. Agents pruefen
Wechselprobleme:
- Secrets und produktive LaunchAgents werden nicht per Git uebertragen
- Mac Studio bleibt produktiver Agent-Knoten
Lokale Besonderheiten:
- Kurzbefehle: `ftd` Download, `fts` Save, `ftu` Upload

### 2026-06-21 19:40 CEST - ftu Handoff Mac Studio von Niklas zu MacBook Pro

Datum/Zeit: 2026-06-21 19:40 CEST
Quellgeraet: Mac Studio von Niklas
Zielgeraet: MacBook Pro
Commit/Stand: Ausgangscommit `4de12e8`; Handoff-Commit wird in diesem
`ftu`-Lauf erstellt
Aktion: Projektstand bauen, Uebergabe dokumentieren, auf GitHub pushen und
Firebase deployen
Erledigt:
- `ftu` wurde auf Mac Studio von Niklas gestartet
- App-Build wird im Workflow ausgefuehrt
- Geaenderte Dateien vor Handoff:
  - keine vorbestehenden Aenderungen
Naechste Schritte:
- Auf MacBook Pro `ftd` ausfuehren
- Danach lokalen Status, Secrets und ggf. Agents pruefen
Wechselprobleme:
- Secrets und produktive LaunchAgents werden nicht per Git uebertragen
- Mac Studio bleibt produktiver Agent-Knoten
Lokale Besonderheiten:
- Kurzbefehle: `ftd` Download, `fts` Save, `ftu` Upload

### 2026-06-21 19:01 CEST - ftu Handoff MacBook Pro zu Mac Studio von Niklas

Datum/Zeit: 2026-06-21 19:01 CEST
Quellgeraet: MacBook Pro
Zielgeraet: Mac Studio von Niklas
Commit/Stand: Ausgangscommit `1bbd429`; Handoff-Commit wird in diesem
`ftu`-Lauf erstellt; Handoff-Commit `d1fff3c`
Aktion: Projektstand bauen, Uebergabe dokumentieren, auf GitHub pushen und
Firebase deployen
Erledigt:
- `ftu` wurde auf MacBook Pro gestartet
- App-Build wird im Workflow ausgefuehrt
- Geaenderte Dateien vor Handoff:
  - M bin/ftu
Naechste Schritte:
- Auf Mac Studio von Niklas `ftd` ausfuehren
- Danach lokalen Status, Secrets und ggf. Agents pruefen
Wechselprobleme:
- Secrets und produktive LaunchAgents werden nicht per Git uebertragen
- Mac Studio bleibt produktiver Agent-Knoten
Lokale Besonderheiten:
- Kurzbefehle: `ftd` Download, `fts` Save, `ftu` Upload

### 2026-06-21 18:59 CEST - ftu Handoff MacBook Pro zu Mac Studio von Niklas

Datum/Zeit: 2026-06-21 18:59 CEST
Quellgeraet: MacBook Pro
Zielgeraet: Mac Studio von Niklas
Commit/Stand: Ausgangscommit `9eb16ff`; Handoff-Commit wird in diesem
`ftu`-Lauf erstellt
Aktion: Projektstand bauen, Uebergabe dokumentieren, auf GitHub pushen und
Firebase deployen
Erledigt:
- `ftu` wurde auf MacBook Pro gestartet
- App-Build wird im Workflow ausgefuehrt
- Geaenderte Dateien vor Handoff:
  - M bin/ftu
Naechste Schritte:
- Auf Mac Studio von Niklas `ftd` ausfuehren
- Danach lokalen Status, Secrets und ggf. Agents pruefen
Wechselprobleme:
- Secrets und produktive LaunchAgents werden nicht per Git uebertragen
- Mac Studio bleibt produktiver Agent-Knoten
Lokale Besonderheiten:
- Kurzbefehle: `ftd` Download, `fts` Save, `ftu` Upload

### 2026-06-21 18:58 CEST - ftu Handoff MacBook Pro zu Mac Studio von Niklas

Datum/Zeit: 2026-06-21 18:58 CEST
Quellgeraet: MacBook Pro
Zielgeraet: Mac Studio von Niklas
Commit/Stand: Ausgangscommit `a7d447c`; Handoff-Commit wird in diesem
`ftu`-Lauf erstellt
Aktion: Projektstand bauen, Uebergabe dokumentieren, auf GitHub pushen und
Firebase deployen
Erledigt:
- `ftu` wurde auf MacBook Pro gestartet
- App-Build wird im Workflow ausgefuehrt
- Geaenderte Dateien vor Handoff:
  - M automation/src/project-workflow.mjs
  -  M bin/ftu
Naechste Schritte:
- Auf Mac Studio von Niklas `ftd` ausfuehren
- Danach lokalen Status, Secrets und ggf. Agents pruefen
Wechselprobleme:
- Secrets und produktive LaunchAgents werden nicht per Git uebertragen
- Mac Studio bleibt produktiver Agent-Knoten
Lokale Besonderheiten:
- Kurzbefehle: `ftd` Download, `fts` Save, `ftu` Upload

### 2026-06-21 18:56 CEST - ftu Handoff MacBook Pro zu Mac Studio von Niklas

Datum/Zeit: 2026-06-21 18:56 CEST
Quellgeraet: MacBook Pro
Zielgeraet: Mac Studio von Niklas
Commit/Stand: Ausgangscommit `3d2f705`; Handoff-Commit wird in diesem
`ftu`-Lauf erstellt
Aktion: Projektstand bauen, Uebergabe dokumentieren, auf GitHub pushen und
Firebase deployen
Erledigt:
- `ftu` wurde auf MacBook Pro gestartet
- App-Build wird im Workflow ausgefuehrt
- Geaenderte Dateien vor Handoff:
  - M automation/src/project-workflow.mjs
Naechste Schritte:
- Auf Mac Studio von Niklas `ftd` ausfuehren
- Danach lokalen Status, Secrets und ggf. Agents pruefen
Wechselprobleme:
- Secrets und produktive LaunchAgents werden nicht per Git uebertragen
- Mac Studio bleibt produktiver Agent-Knoten
Lokale Besonderheiten:
- Kurzbefehle: `ftd` Download, `fts` Save, `ftu` Upload

### 2026-06-21 18:54 CEST - ftu Handoff MacBook Pro zu Mac Studio von Niklas

Datum/Zeit: 2026-06-21 18:54 CEST
Quellgeraet: MacBook Pro
Zielgeraet: Mac Studio von Niklas
Commit/Stand: Ausgangscommit `d8b450c`; Handoff-Commit wird in diesem
`ftu`-Lauf erstellt
Aktion: Projektstand bauen, Uebergabe dokumentieren, auf GitHub pushen und
Firebase deployen
Erledigt:
- `ftu` wurde auf MacBook Pro gestartet
- App-Build wird im Workflow ausgefuehrt
- Geaenderte Dateien vor Handoff:
  - M automation/src/project-workflow.mjs
Naechste Schritte:
- Auf Mac Studio von Niklas `ftd` ausfuehren
- Danach lokalen Status, Secrets und ggf. Agents pruefen
Wechselprobleme:
- Secrets und produktive LaunchAgents werden nicht per Git uebertragen
- Mac Studio bleibt produktiver Agent-Knoten
Lokale Besonderheiten:
- Kurzbefehle: `ftd` Download, `fts` Save, `ftu` Upload

### 2026-06-21 18:53 CEST - ftu Handoff MacBook Pro zu Mac Studio von Niklas

Datum/Zeit: 2026-06-21 18:53 CEST
Quellgeraet: MacBook Pro
Zielgeraet: Mac Studio von Niklas
Commit/Stand: Ausgangscommit `8662bb7`; Handoff-Commit wird in diesem
`ftu`-Lauf erstellt
Aktion: Projektstand bauen, Uebergabe dokumentieren, auf GitHub pushen und
Firebase deployen
Erledigt:
- `ftu` wurde auf MacBook Pro gestartet
- App-Build wird im Workflow ausgefuehrt
- Geaenderte Dateien vor Handoff:
  - M automation/src/project-workflow.mjs
Naechste Schritte:
- Auf Mac Studio von Niklas `ftd` ausfuehren
- Danach lokalen Status, Secrets und ggf. Agents pruefen
Wechselprobleme:
- Secrets und produktive LaunchAgents werden nicht per Git uebertragen
- Mac Studio bleibt produktiver Agent-Knoten
Lokale Besonderheiten:
- Kurzbefehle: `ftd` Download, `fts` Save, `ftu` Upload

### 2026-06-21 18:52 CEST - ftu Handoff MacBook Pro zu Mac Studio von Niklas

Datum/Zeit: 2026-06-21 18:52 CEST
Quellgeraet: MacBook Pro
Zielgeraet: Mac Studio von Niklas
Commit/Stand: Ausgangscommit `df42884`; Handoff-Commit wird in diesem
`ftu`-Lauf erstellt
Aktion: Projektstand bauen, Uebergabe dokumentieren, auf GitHub pushen und
Firebase deployen
Erledigt:
- `ftu` wurde auf MacBook Pro gestartet
- App-Build wird im Workflow ausgefuehrt
- Geaenderte Dateien vor Handoff:
  - D  .firebase/hosting.YXBwL2Rpc3Q.cache
  -  M .gitignore
Naechste Schritte:
- Auf Mac Studio von Niklas `ftd` ausfuehren
- Danach lokalen Status, Secrets und ggf. Agents pruefen
Wechselprobleme:
- Secrets und produktive LaunchAgents werden nicht per Git uebertragen
- Mac Studio bleibt produktiver Agent-Knoten
Lokale Besonderheiten:
- Kurzbefehle: `ftd` Download, `fts` Save, `ftu` Upload

### 2026-06-21 18:51 CEST - ftu Handoff MacBook Pro zu Mac Studio von Niklas

Datum/Zeit: 2026-06-21 18:51 CEST
Quellgeraet: MacBook Pro
Zielgeraet: Mac Studio von Niklas
Commit/Stand: Ausgangscommit `4677981`; Handoff-Commit wird in diesem
`ftu`-Lauf erstellt
Aktion: Projektstand bauen, Uebergabe dokumentieren, auf GitHub pushen und
Firebase deployen
Erledigt:
- `ftu` wurde auf MacBook Pro gestartet
- App-Build wird im Workflow ausgefuehrt
- Geaenderte Dateien vor Handoff:
  - M .firebase/hosting.YXBwL2Rpc3Q.cache
  -  M automation/src/project-workflow.mjs
Naechste Schritte:
- Auf Mac Studio von Niklas `ftd` ausfuehren
- Danach lokalen Status, Secrets und ggf. Agents pruefen
Wechselprobleme:
- Secrets und produktive LaunchAgents werden nicht per Git uebertragen
- Mac Studio bleibt produktiver Agent-Knoten
Lokale Besonderheiten:
- Kurzbefehle: `ftd` Download, `fts` Save, `ftu` Upload

### 2026-06-21 18:50 CEST - ftu Handoff MacBook Pro zu Mac Studio von Niklas

Datum/Zeit: 2026-06-21 18:50 CEST
Quellgeraet: MacBook Pro
Zielgeraet: Mac Studio von Niklas
Commit/Stand: Ausgangscommit `afe5543`; Handoff-Commit wird in diesem
`ftu`-Lauf erstellt
Aktion: Projektstand bauen, Uebergabe dokumentieren, auf GitHub pushen und
Firebase deployen
Erledigt:
- `ftu` wurde auf MacBook Pro gestartet
- App-Build wird im Workflow ausgefuehrt
- Geaenderte Dateien vor Handoff:
  - M automation/src/project-workflow.mjs
Naechste Schritte:
- Auf Mac Studio von Niklas `ftd` ausfuehren
- Danach lokalen Status, Secrets und ggf. Agents pruefen
Wechselprobleme:
- Secrets und produktive LaunchAgents werden nicht per Git uebertragen
- Mac Studio bleibt produktiver Agent-Knoten
Lokale Besonderheiten:
- Kurzbefehle: `ftd` Download, `fts` Save, `ftu` Upload

### 2026-06-21 18:49 CEST - ftu Handoff MacBook Pro zu Mac Studio von Niklas

Datum/Zeit: 2026-06-21 18:49 CEST
Quellgeraet: MacBook Pro
Zielgeraet: Mac Studio von Niklas
Commit/Stand: Ausgangscommit `4215bf0`; Handoff-Commit wird in diesem
`ftu`-Lauf erstellt
Aktion: Projektstand bauen, Uebergabe dokumentieren, auf GitHub pushen und
Firebase deployen
Erledigt:
- `ftu` wurde auf MacBook Pro gestartet
- App-Build wird im Workflow ausgefuehrt
- Geaenderte Dateien vor Handoff:
  - M .firebase/hosting.YXBwL2Rpc3Q.cache
  -  M automation/src/project-workflow.mjs
Naechste Schritte:
- Auf Mac Studio von Niklas `ftd` ausfuehren
- Danach lokalen Status, Secrets und ggf. Agents pruefen
Wechselprobleme:
- Secrets und produktive LaunchAgents werden nicht per Git uebertragen
- Mac Studio bleibt produktiver Agent-Knoten
Lokale Besonderheiten:
- Kurzbefehle: `ftd` Download, `fts` Save, `ftu` Upload

### 2026-06-21 18:49 CEST - ftu Handoff MacBook Pro zu Mac Studio von Niklas

Datum/Zeit: 2026-06-21 18:49 CEST
Quellgeraet: MacBook Pro
Zielgeraet: Mac Studio von Niklas
Commit/Stand: Ausgangscommit `2ff76f0`; Handoff-Commit wird in diesem
`ftu`-Lauf erstellt
Aktion: Projektstand bauen, Uebergabe dokumentieren, auf GitHub pushen und
Firebase deployen
Erledigt:
- `ftu` wurde auf MacBook Pro gestartet
- App-Build wird im Workflow ausgefuehrt
- Geaenderte Dateien vor Handoff:
  - keine vorbestehenden Aenderungen
Naechste Schritte:
- Auf Mac Studio von Niklas `ftd` ausfuehren
- Danach lokalen Status, Secrets und ggf. Agents pruefen
Wechselprobleme:
- Secrets und produktive LaunchAgents werden nicht per Git uebertragen
- Mac Studio bleibt produktiver Agent-Knoten
Lokale Besonderheiten:
- Kurzbefehle: `ftd` Download, `fts` Save, `ftu` Upload

### 2026-06-21 18:48 CEST - ftu Handoff MacBook Pro zu Mac Studio von Niklas

Datum/Zeit: 2026-06-21 18:48 CEST
Quellgeraet: MacBook Pro
Zielgeraet: Mac Studio von Niklas
Commit/Stand: Ausgangscommit `0ee819e`; Handoff-Commit wird in diesem
`ftu`-Lauf erstellt
Aktion: Projektstand bauen, Uebergabe dokumentieren, auf GitHub pushen und
Firebase deployen
Erledigt:
- `ftu` wurde auf MacBook Pro gestartet
- App-Build wird im Workflow ausgefuehrt
- Geaenderte Dateien vor Handoff:
  - keine vorbestehenden Aenderungen
Naechste Schritte:
- Auf Mac Studio von Niklas `ftd` ausfuehren
- Danach lokalen Status, Secrets und ggf. Agents pruefen
Wechselprobleme:
- Secrets und produktive LaunchAgents werden nicht per Git uebertragen
- Mac Studio bleibt produktiver Agent-Knoten
Lokale Besonderheiten:
- Kurzbefehle: `ftd` Download, `fts` Save, `ftu` Upload

### 2026-06-21 18:40 CEST - ftu Handoff MacBook Pro zu Mac Studio von Niklas

Datum/Zeit: 2026-06-21 18:40 CEST
Quellgeraet: MacBook Pro
Zielgeraet: Mac Studio von Niklas
Commit/Stand: Ausgangscommit `446307d`; Handoff-Commit wird in diesem
`ftu`-Lauf erstellt
Aktion: Projektstand bauen, Uebergabe dokumentieren, auf GitHub pushen und
Firebase deployen
Erledigt:
- `ftu` wurde auf MacBook Pro gestartet
- App-Build wird im Workflow ausgefuehrt
- Geaenderte Dateien vor Handoff:
  - M app/src/App.tsx
Naechste Schritte:
- Auf Mac Studio von Niklas `ftd` ausfuehren
- Danach lokalen Status, Secrets und ggf. Agents pruefen
Wechselprobleme:
- Secrets und produktive LaunchAgents werden nicht per Git uebertragen
- Mac Studio bleibt produktiver Agent-Knoten
Lokale Besonderheiten:
- Kurzbefehle: `ftd` Download, `fts` Save, `ftu` Upload

### 2026-06-21 18:08 CEST - ftu Handoff Mac Studio von Niklas zu MacBook Pro

Datum/Zeit: 2026-06-21 18:08 CEST
Quellgeraet: Mac Studio von Niklas
Zielgeraet: MacBook Pro
Commit/Stand: Ausgangscommit `5b9e5c0`; Handoff-Commit wird in diesem
`ftu`-Lauf erstellt; Handoff-Commit `3874bf2`
Aktion: Projektstand bauen, Uebergabe dokumentieren, auf GitHub pushen und
Firebase deployen
Erledigt:
- `ftu` wurde auf Mac Studio von Niklas gestartet
- App-Build wird im Workflow ausgefuehrt
- Geaenderte Dateien vor Handoff:
  - keine vorbestehenden Aenderungen
Naechste Schritte:
- Auf MacBook Pro `ftd` ausfuehren
- Danach lokalen Status, Secrets und ggf. Agents pruefen
Wechselprobleme:
- Secrets und produktive LaunchAgents werden nicht per Git uebertragen
- Mac Studio bleibt produktiver Agent-Knoten
Lokale Besonderheiten:
- Kurzbefehle: `ftd` Download, `fts` Save, `ftu` Upload

### 2026-06-21 18:01 CEST - ftu Handoff MacBook Pro zu Mac Studio von Niklas

Datum/Zeit: 2026-06-21 18:01 CEST
Quellgeraet: MacBook Pro
Zielgeraet: Mac Studio von Niklas
Commit/Stand: Ausgangscommit `8a20c5d`; Handoff-Commit wird in diesem
`ftu`-Lauf erstellt
Aktion: Projektstand bauen, Uebergabe dokumentieren, auf GitHub pushen und
Firebase deployen
Erledigt:
- `ftu` wurde auf MacBook Pro gestartet
- App-Build wird im Workflow ausgefuehrt
- Geaenderte Dateien vor Handoff:
  - keine vorbestehenden Aenderungen
Naechste Schritte:
- Auf Mac Studio von Niklas `ftd` ausfuehren
- Danach lokalen Status, Secrets und ggf. Agents pruefen
Wechselprobleme:
- Secrets und produktive LaunchAgents werden nicht per Git uebertragen
- Mac Studio bleibt produktiver Agent-Knoten
Lokale Besonderheiten:
- Kurzbefehle: `ftd` Download, `fts` Save, `ftu` Upload

### 2026-06-21 15:25 CEST - ftu Handoff Mac Studio zu MacBook Pro

Datum/Zeit: 2026-06-21 15:25 CEST
Quellgeraet: Mac Studio von Niklas (`Mac.fritz.box`)
Zielgeraet: MacBook Pro
Commit/Stand: Ausgangscommit `7808ec6`; Handoff-Doku-Commit wird in diesem
`ftu`-Lauf erstellt
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
- Auf dem MacBook Pro `ftd` ausfuehren
- Danach Pflichtdokumente lesen und kurz rueckmelden:
  `docs/device_workflow.md`, `docs/device_switch_log.md`,
  `docs/working_memory.md`, `README.md`
- Auf dem MacBook Pro keine produktiven LaunchAgents starten
- Falls weiter an Agents gearbeitet wird, spaeter per `ftu` wieder an den
  Mac Studio uebergeben und dort `ftd` plus Agent-Installation/Health pruefen
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

### 2026-06-20 18:38 CEST - ftu Handoff MacBook Pro zu Mac Studio

Datum/Zeit: 2026-06-20 18:38 CEST
Quellgeraet: MacBook Pro
Zielgeraet: Mac Studio von Niklas
Commit/Stand: Ausgangscommit `1f659c5`; Handoff-Commit wird in diesem
`ftu`-Lauf erstellt
Aktion: MacBook-Pro-Stand bauen, Uebergabe dokumentieren, auf GitHub pushen
und Firebase deployen
Erledigt:
- Handoff-Commit `f054467` auf GitHub gepusht
- Firebase Deploy am 2026-06-20 18:43 CEST erfolgreich ausgefuehrt
- Projekt auf dem MacBook Pro per `ftd` von GitHub aktualisiert
- Pflichtdokumente gelesen und aktiver Stand uebernommen
- Node `22.23.0` per `nvm use` fuer Build verwendet
- App-Build erfolgreich ausgefuehrt
- Projektordner in Visual Studio Code geoeffnet:
  `/Users/niklaskofler/Documents/finanztool`
- Kein produktiver Mac-Studio-Agent wurde auf dem MacBook Pro gestartet
Naechste Schritte:
- Auf dem Mac Studio `ftd` ausfuehren
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

### 2026-06-20 17:47 CEST - ftu Handoff Mac Studio zu MacBook Pro

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
- Kurzbefehle gelten auf beiden Geraeten gleich:
  `ftd`, `fts`, `ftu`
Naechste Schritte:
- Auf dem MacBook Pro Codex mit dem Erstprompt aus
  `docs/device_workflow.md` starten
- Danach `ftd` ausfuehren lassen
- Codex muss am MacBook Pro kurz melden: aktives Geraet, Commit/Stand,
  letzter Stand vom Mac Studio, naechste Schritte und Wechselprobleme
Wechselprobleme:
- Secrets und produktive Agents werden nicht per Git uebertragen
- MacBook Pro darf keine produktiven Mac-Studio-LaunchAgents starten
- Falls lokale Aenderungen am MacBook Pro existieren, darf `ftd` sie nicht
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
Aktion: Geraetewechsel-Regeln und Kurzbefehle dokumentiert
Erledigt:
- Standardpfad auf beiden Geraeten festgelegt:
  `/Users/niklaskofler/Documents/finanztool`
- `ftd`, `fts`, `ftu` als Kurzbefehle definiert
- Mac Studio als produktiver Agent-Knoten festgelegt
- MacBook Pro als Entwicklungsgeraet ohne produktive Studio-Agents festgelegt
- Erstprompt fuer neue Codex-Sessions dokumentiert
Naechste Schritte:
- Bei spaeterem `ftu`: Doku-Aenderungen committen, GitHub pushen und
  Firebase deployen
- Danach auf dem MacBook Pro mit `ftd` uebernehmen
Wechselprobleme:
- Bisher wichtigster Risikopunkt: lokale Secrets und produktive Agents sind
  nicht automatisch zwischen den Geraeten identisch
- Codex muss bei jedem Wechsel zuerst Status/Doku pruefen und kurz Feedback
  geben
Lokale Besonderheiten:
- Produktive Agents laufen auf dem Mac Studio
- Secrets liegen lokal, nicht in Git
