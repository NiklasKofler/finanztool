# Geraetewechsel und Codex-Workflow

Stand: 2026-06-20

Dieses Dokument ist die zentrale Regeldatei fuer Arbeit zwischen Mac Studio
und MacBook Pro.

## Grundregel

Das Projekt soll auf beiden Geraeten am gleichen Pfad liegen:

```bash
/Users/niklaskofler/Documents/finanztool
```

GitHub ist die Code-Uebergabe zwischen den Geraeten.
Firebase ist die produktive App-/Datenbank-Umgebung.
Der Mac Studio ist der produktive Agent-Knoten.

## Rollen der Geraete

### Mac Studio

- Produktive Automation/Agents laufen hier.
- Lokale Secrets liegen hier im macOS-Schluesselbund.
- Google Drive Desktop muss hier laufen.
- Nach Code-Aenderungen an Agents muessen die LaunchAgents auf dem Studio
  aktualisiert werden.

### MacBook Pro

- Entwicklungsgeraet fuer App, Parser und Dokumentation.
- Keine produktiven Studio-Agents starten.
- Code wird per GitHub an den Mac Studio uebergeben.

## Codex-Start in einem neuen Chat

Wenn Codex das Projekt suchen soll, immer zuerst diesen Pfad verwenden:

```bash
cd /Users/niklaskofler/Documents/finanztool
```

Danach lesen:

```bash
docs/device_workflow.md
docs/device_switch_log.md
docs/working_memory.md
README.md
```

Wenn das Projekt dort fehlt:

```bash
cd /Users/niklaskofler/Documents
git clone https://github.com/NiklasKofler/finanztool.git finanztool
cd /Users/niklaskofler/Documents/finanztool
```

## Kurzbefehle

Es gelten nur noch diese Kurzbefehle:

```bash
ftd   # download/update
fts   # save/lokaler commit
ftu   # upload/push/deploy/handoff
```

Alte numerische Befehle sind deaktiviert und duerfen nicht mehr verwendet
werden.

Installation pro Geraet:

```bash
cd /Users/niklaskofler/Documents/finanztool
npm run ft:install
source ~/.zshrc
```

Die Kurzbefehle lesen den Projektkontext aus dem Repo, pruefen das aktuelle
Geraet und fuehren die passende Rolle aus. Auf dem MacBook Pro werden keine
produktiven Studio-Agents gestartet. Auf dem Mac Studio fuehrt `ftd` zusaetzlich
Agent-Installation/Health-Checks aus.

Wichtig fuer alle Kurzbefehle:

- zuerst den aktuellen Projektstand pruefen, nicht blind ausfuehren
- `git status --short`, letzter Commit und relevante Doku lesen
- danach im Chat kurz melden:
  - auf welchem Geraet gearbeitet wird
  - welcher Stand uebernommen wurde
  - wo am alten Geraet aufgehoert wurde
  - welche naechsten Schritte geplant sind
  - ob es Wechselprobleme oder lokale Abweichungen gibt

## Sicherheitsprinzip

- `ftd` ueberschreibt keine lokalen Aenderungen. Wenn lokale Aenderungen,
  ein Merge, ein Rebase oder ein anderer Git-Zwischenzustand vorhanden ist,
  bricht `ftd` ab.
- `ftd --force` ist der bewusste Notfall-Download. Dabei wird vorher ein
  Backup-Branch unter `backup/ftd-force-*` angelegt und lokale geaenderte
  Dateien werden nach `automation/runtime/force-download-backups/*`
  kopiert. Erst danach wird hart auf `origin/main` gesetzt.
- `ftu` startet nur von Branch `main` und nur ohne offenen Merge/Rebase.
- `ftu` prueft vor dem Commit, ob `origin/main` im lokalen Stand enthalten
  ist. Wenn GitHub neuer ist, wird nicht gepusht und nicht deployed.
- Nach dem Push verifiziert `ftu`, dass lokaler `HEAD` und `origin/main`
  identisch sind. Firebase wird nur danach deployed.
- `ftu` deployed bewusst nur Firebase Hosting. Firestore/Storage-Regeln und
  Indexes werden dadurch nicht versehentlich ueberschrieben.

### ftd

Projekt auf der aktuellen Maschine richtig herunterladen/aktualisieren.

Wichtig: `ftd` muss nach `npm run ft:install` und `source ~/.zshrc` als
Shell-Funktion verfuegbar sein. Nur dann kann `ftd` das aktuelle Terminal nach
erfolgreichem Lauf dauerhaft nach
`/Users/niklaskofler/Documents/finanztool` setzen. Wird direkt das Script
`bin/ftd` gestartet, wechselt nur der Kindprozess intern in den Projektordner.

Ablauf:

```bash
cd /Users/niklaskofler/Documents/finanztool
git status --short
git fetch origin
git pull --ff-only origin main
npm --prefix app install
npm --prefix automation install
npm --prefix app run build
```

Wenn `git status --short` lokale Aenderungen zeigt:

- nichts ueberschreiben
- zuerst `fts` ausfuehren oder den Konflikt melden

Zusatz auf Mac Studio:

```bash
cd /Users/niklaskofler/Documents/finanztool/automation
npm run install:all-agents
npm run sync:health
launchctl list | grep finanztool
```

Zusatz auf MacBook Pro:

- keine produktiven LaunchAgents starten
- nur App/Code bauen und weiterentwickeln

Nach erfolgreichem `ftd` muss Codex kurz zusammenfassen:

- letzter Geraetewechsel-Eintrag aus `docs/device_switch_log.md`
- kurzer Arbeitsstand aus `docs/working_memory.md`
- naechster empfohlener Schritt
- ob lokale Secrets/Agents auf diesem Geraet fehlen oder bewusst nicht laufen

Bewusster Notfall-Reset auf GitHub-Stand:

```bash
ftd --force
```

Nur verwenden, wenn klar ist, dass der GitHub-Stand die Wahrheit ist.

### fts

Projekt lokal speichern, aber nicht uebergeben.

```bash
fts "optionale Commit Message"
```

Ablauf:

```bash
cd /Users/niklaskofler/Documents/finanztool
npm --prefix app run build
git status --short
git diff --stat
git add <relevante-dateien>
git commit -m "<kurze beschreibung>"
```

Nicht ausfuehren:

- kein `git push`
- kein Firebase Deploy

Wichtig: Ein `fts`-Commit ist nur auf diesem Geraet sichtbar. Das andere
Geraet bekommt ihn erst nach `ftu`.

### ftu

Projekt hochladen, Firebase deployen und an das andere Geraet uebergeben.

```bash
ftu "optionale Commit Message"
```

Ablauf:

```bash
cd /Users/niklaskofler/Documents/finanztool
npm --prefix app run build
git status --short
git diff --stat
git add <relevante-dateien>
git commit -m "<kurze beschreibung>" # nur wenn Aenderungen vorhanden
git push origin main
npx firebase-tools deploy --project finanzperformance-tool
```

Der Kurzworkflow deployed aktuell bewusst nur Hosting:

```bash
npx firebase-tools deploy --only hosting --project finanzperformance-tool
```

Nach einem Firebase Deploy kann sich diese Datei aendern:

```bash
.firebase/hosting.YXBwL2Rpc3Q.cache
```

Wenn sie getrackt ist und sich geaendert hat:

```bash
git add .firebase/hosting.YXBwL2Rpc3Q.cache
git commit -m "Update Firebase hosting cache"
git push origin main
```

Uebergabe-Beispiele:

- Mac Studio entwickelt -> `ftu` -> MacBook Pro `ftd`
- MacBook Pro entwickelt -> `ftu` -> Mac Studio `ftd`

Bei `ftu` muss Codex vor dem Commit die Arbeitsdoku aktualisieren:

- `docs/device_switch_log.md`
- `docs/working_memory.md` nur als kurze Orientierung, nicht als zweite
  Handoff-Wahrheit
- falls betroffen: README oder fachliche Konzept-/Runbook-Dateien

Der `docs/device_switch_log.md`-Eintrag muss enthalten:

- Quellgeraet
- Zielgeraet
- Stand/Commit
- was erledigt wurde
- naechste Schritte auf dem Zielgeraet
- bekannte Probleme beim Wechsel

## Lokale Dateien, die nicht in Git gehoeren

Diese Dateien/Secrets muessen pro Geraet lokal vorhanden sein:

```text
app/.env.local
automation/.env
secrets/firebase-service-account.json
macOS-Schluesselbund: finanztool-*
```

Sie duerfen nicht in Git, Screenshots oder Chat landen.

## Wichtige Pfade

Projekt:

```bash
/Users/niklaskofler/Documents/finanztool
```

App:

```bash
/Users/niklaskofler/Documents/finanztool/app
```

Automation:

```bash
/Users/niklaskofler/Documents/finanztool/automation
```

Service Account:

```bash
/Users/niklaskofler/Documents/finanztool/secrets/firebase-service-account.json
```

Drive Originale:

```bash
/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/01_Originale
```

Drive Archiv:

```bash
/Users/niklaskofler/Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/02_Archiviert
```

## Nach dem Geraetewechsel pruefen

Auf beiden Geraeten:

```bash
cd /Users/niklaskofler/Documents/finanztool
npm --prefix app run build
git status --short
```

Nur auf Mac Studio:

```bash
cd /Users/niklaskofler/Documents/finanztool/automation
npm run sync:health
launchctl list | grep finanztool
```

## Erstbefehl fuer ein neues Codex-Fenster

Diesen Prompt kann Niklas am jeweils anderen Geraet einfuegen:

```text
Bitte uebernimm das Projekt Finanzperformance-Tool auf diesem Geraet.

Arbeite im Standardpfad:
/Users/niklaskofler/Documents/finanztool

Falls das Projekt dort fehlt, clone es von:
https://github.com/NiklasKofler/finanztool.git

Lies danach zwingend:
docs/device_workflow.md
docs/device_switch_log.md
docs/working_memory.md
README.md

Fuehre dann `ftd` aus: aktuellen Stand pruefen, GitHub-Stand
holen, Dependencies aktualisieren und Build pruefen. Ueberschreibe keine
lokalen Aenderungen. Gib mir danach kurz Feedback:

1. Auf welchem Geraet sind wir?
2. Welcher Commit/Stand ist aktiv?
3. Wo wurde am alten Geraet aufgehoert?
4. Was sind die naechsten geplanten Schritte?
5. Gibt es Wechselprobleme, fehlende Secrets oder Agenten, die hier nicht
   laufen sollen?

Merke dir fuer diesen Chat die Finanztool-Kurzbefehle:
ftd = Projekt herunterladen/aktualisieren
fts = lokal speichern/committen
ftu = bauen, GitHub pushen, Firebase deployen und an das andere Geraet uebergeben
```

## Was immer dokumentiert werden muss

- neue Kurzbefehle oder geaenderte Bedeutung
- neue lokale Pfade
- neue Secrets oder Schluesselbund-Service-Namen
- neue LaunchAgents
- geaenderte Agent-Zeitplaene
- neue Firestore-Collections oder Feldnamen
- Datenquellen, die nur auf Mac Studio laufen
- bekannte Fehler/Blocker, die beim Geraetewechsel relevant sind
- jedes konkrete Problem beim Wechsel zwischen Mac Studio und MacBook Pro in
  `docs/device_switch_log.md`
