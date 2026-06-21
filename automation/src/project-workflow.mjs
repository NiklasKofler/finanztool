#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const handoffStatePath = path.join(repoRoot, "automation/runtime/ftu-handoff-state.json");
const backupRoot = path.join(repoRoot, "automation/runtime/force-download-backups");
const commandName = path.basename(process.argv[1]);
const rawCommand = process.argv[2] ?? commandName;
const args = process.argv.slice(3);

const commandAliases = {
  ftd: "download",
  download: "download",
  d: "download",
  fts: "save",
  save: "save",
  s: "save",
  ftu: "upload",
  upload: "upload",
  u: "upload",
  "upload-pre": "upload-pre",
  "upload-finalize": "upload-finalize",
  context: "context",
};

const command = commandAliases[rawCommand] ?? commandAliases[commandName];

function printUsage() {
  console.log("Nutzung: ftd | fts [commit-message] | ftu [commit-message]");
  console.log("Hinweis: Alte numerische Kurzbefehle sind deaktiviert. Bitte nur ftd, fts und ftu verwenden.");
}

if (rawCommand === "--help" || rawCommand === "-h" || args.includes("--help") || args.includes("-h")) {
  printUsage();
  process.exit(0);
}

function section(title) {
  console.log(`\n== ${title} ==`);
}

function fail(message, code = 1) {
  console.error(`\nFEHLER: ${message}`);
  process.exit(code);
}

function run(cmd, cmdArgs = [], options = {}) {
  const result = spawnSync(cmd, cmdArgs, {
    cwd: options.cwd ?? repoRoot,
    stdio: options.capture ? "pipe" : "inherit",
    encoding: "utf8",
    shell: false,
    env: options.env ? { ...process.env, ...options.env } : process.env,
  });

  if (result.error) {
    fail(`${cmd} konnte nicht gestartet werden: ${result.error.message}`);
  }

  if (result.status !== 0 && !options.allowFailure) {
    fail(`${cmd} ${cmdArgs.join(" ")} ist fehlgeschlagen`);
  }

  if (options.capture) {
    return {
      status: result.status ?? 0,
      stdout: result.stdout?.trim() ?? "",
      stderr: result.stderr?.trim() ?? "",
    };
  }

  return { status: result.status ?? 0, stdout: "", stderr: "" };
}

function shell(commandLine, options = {}) {
  return run("zsh", ["-lc", commandLine], options);
}

function formatViennaTime() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Vienna",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  })
    .format(new Date())
    .replace("GMT+2", "CEST")
    .replace("GMT+1", "CET");
}

function runWithProjectNode(commandLine, options = {}) {
  return shell(`source ~/.zshrc >/dev/null 2>&1 || true; nvm use >/dev/null; ${commandLine}`, options);
}

function capture(commandLine, options = {}) {
  return shell(commandLine, { ...options, capture: true, allowFailure: true }).stdout;
}

function git(args, options = {}) {
  return run("git", args, options);
}

function gitOutput(args) {
  return git(args, { capture: true }).stdout;
}

function gitStatusPorcelain() {
  return gitOutput(["status", "--porcelain"]);
}

function gitRev(ref) {
  return git(["rev-parse", "--verify", ref], { capture: true, allowFailure: true }).stdout;
}

function currentBranch() {
  return git(["rev-parse", "--abbrev-ref", "HEAD"], { capture: true, allowFailure: true }).stdout;
}

function isAncestor(ancestor, descendant) {
  if (!ancestor || !descendant) return false;
  return git(["merge-base", "--is-ancestor", ancestor, descendant], { allowFailure: true }).status === 0;
}

function hasGitOperationInProgress() {
  return [
    ".git/rebase-merge",
    ".git/rebase-apply",
    ".git/MERGE_HEAD",
    ".git/CHERRY_PICK_HEAD",
    ".git/REVERT_HEAD",
  ].some((item) => existsSync(path.join(repoRoot, item)));
}

function ensureNormalGitState() {
  if (hasGitOperationInProgress()) {
    fail(
      "Git hat noch einen angefangenen Merge/Rebase/Cherry-Pick. Erst manuell klaeren oder bewusst `ftd --force` verwenden.",
    );
  }

  const branch = currentBranch();
  if (branch !== "main") {
    fail(`Aktiver Branch ist '${branch}'. Bitte auf 'main' wechseln, bevor ftd/fts/ftu laufen.`);
  }
}

function ensureRemoteIsIncluded() {
  section("Git Sicherheitscheck");
  ensureNormalGitState();
  git(["fetch", "origin", "--prune"]);
  const head = gitRev("HEAD");
  const remote = gitRev("origin/main");
  if (!isAncestor(remote, head)) {
    fail(
      "GitHub ist neuer oder die Historie ist auseinander gelaufen. Bitte zuerst `ftd` ausfuehren; bei bewusstem Reset `ftd --force`.",
    );
  }
}

function writeHandoffState(state) {
  mkdirSync(path.dirname(handoffStatePath), { recursive: true });
  writeFileSync(handoffStatePath, `${JSON.stringify(state, null, 2)}\n`);
}

function readHandoffState() {
  if (!existsSync(handoffStatePath)) return null;
  try {
    return JSON.parse(readFileSync(handoffStatePath, "utf8"));
  } catch {
    return null;
  }
}

function ensureCleanWorkingTree() {
  const status = gitStatusPorcelain();
  if (!status) return;

  console.log(status);
  fail(
    "Lokale Aenderungen vorhanden. Bitte zuerst `fts` ausfuehren oder manuell klaeren. `ftd` ueberschreibt nichts.",
  );
}

function timestampId() {
  return new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
}

function statusPathFromLine(line) {
  const raw = line.slice(3);
  if (raw.includes(" -> ")) return raw.split(" -> ").at(-1);
  return raw.replace(/^"|"$/g, "");
}

function backupDirtyFiles(label) {
  const status = gitStatusPorcelain();
  const backupDir = path.join(backupRoot, label);
  if (!status) return null;
  mkdirSync(backupDir, { recursive: true });
  for (const line of status.split("\n").filter(Boolean)) {
    const relativePath = statusPathFromLine(line);
    const sourcePath = path.join(repoRoot, relativePath);
    if (!existsSync(sourcePath)) continue;
    const targetPath = path.join(backupDir, relativePath);
    mkdirSync(path.dirname(targetPath), { recursive: true });
    cpSync(sourcePath, targetPath, { recursive: true });
  }
  writeFileSync(path.join(backupDir, "git-status.txt"), `${status}\n`);
  return backupDir;
}

function newestMtime(paths) {
  return paths
    .filter((item) => existsSync(item))
    .map((item) => statSync(item).mtimeMs)
    .reduce((max, value) => Math.max(max, value), 0);
}

function dependenciesNeedInstall(projectDir) {
  const nodeModules = path.join(projectDir, "node_modules");
  if (!existsSync(nodeModules)) return true;
  const manifests = [
    path.join(projectDir, "package.json"),
    path.join(projectDir, "package-lock.json"),
  ];
  return newestMtime(manifests) > statSync(nodeModules).mtimeMs;
}

function installIfNeeded(relativeDir, label) {
  const projectDir = path.join(repoRoot, relativeDir);
  if (dependenciesNeedInstall(projectDir)) {
    runWithProjectNode(`npm --prefix ${relativeDir} install`);
  } else {
    console.log(`${label}: dependencies aktuell, npm install uebersprungen`);
  }
}

function getDevice() {
  const computerName =
    capture("scutil --get ComputerName 2>/dev/null") || capture("hostname 2>/dev/null") || "Unbekannt";
  const hostname = capture("hostname 2>/dev/null") || "Unbekannt";
  const role = /mac studio/i.test(computerName)
    ? "studio"
    : /macbook/i.test(computerName)
      ? "macbook"
      : "unknown";

  return { computerName, hostname, role };
}

function targetFor(device) {
  if (device.role === "studio") return "MacBook Pro";
  if (device.role === "macbook") return "Mac Studio von Niklas";
  return "anderes Geraet";
}

function readSection(filePath, heading) {
  if (!existsSync(filePath)) return "";
  const text = readFileSync(filePath, "utf8");
  const start = text.indexOf(heading);
  if (start === -1) return "";
  const rest = text.slice(start);
  const next = rest.slice(heading.length).search(/\n## /);
  return next === -1 ? rest.trim() : rest.slice(0, heading.length + next).trim();
}

function readLatestSwitchEntry() {
  const filePath = path.join(repoRoot, "docs/device_switch_log.md");
  if (!existsSync(filePath)) return "";
  const text = readFileSync(filePath, "utf8");
  const entriesIndex = text.indexOf("## Eintraege");
  if (entriesIndex === -1) return "";
  const entries = text.slice(entriesIndex);
  const first = entries.search(/\n### /);
  if (first === -1) return "";
  const fromFirst = entries.slice(first + 1);
  const second = fromFirst.slice(4).search(/\n### /);
  return second === -1 ? fromFirst.trim() : fromFirst.slice(0, second + 4).trim();
}

function printContext() {
  const device = getDevice();
  const currentCommit = gitOutput(["rev-parse", "--short", "HEAD"]);

  section("Kontext");
  console.log(`Geraet: ${device.computerName} (${device.hostname})`);
  console.log(
    `Rolle: ${
      device.role === "studio"
        ? "Mac Studio, produktive Agents erlaubt"
        : device.role === "macbook"
          ? "MacBook Pro, keine produktiven Studio-Agents starten"
          : "unbekannt, keine produktiven Agents automatisch starten"
    }`,
  );
  console.log(`Repo: ${repoRoot}`);
  console.log(`Commit: ${currentCommit}`);

  const latestSwitch = readLatestSwitchEntry();
  if (latestSwitch) {
    console.log("\nLetzter Geraetewechsel:");
    console.log(latestSwitch.split("\n").slice(0, 18).join("\n"));
  }

  const handoff = readSection(path.join(repoRoot, "docs/working_memory.md"), "## Aktueller Geraete-Handoff");
  if (handoff) {
    console.log("\nAktueller Handoff aus Working Memory:");
    console.log(handoff);
  }
}

function printLocalStatus() {
  const device = getDevice();
  section("Lokaler Status");
  console.log(`app/.env.local: ${existsSync(path.join(repoRoot, "app/.env.local")) ? "vorhanden" : "fehlt"}`);
  console.log(`automation/.env: ${existsSync(path.join(repoRoot, "automation/.env")) ? "vorhanden" : "fehlt"}`);
  console.log(
    `Service Account: ${
      existsSync(path.join(repoRoot, "secrets/firebase-service-account.json")) ? "vorhanden" : "fehlt"
    }`,
  );

  const driveOriginale = path.join(
    os.homedir(),
    "Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/01_Originale",
  );
  const driveArchiv = path.join(
    os.homedir(),
    "Library/CloudStorage/GoogleDrive-niklas.kofler@gmail.com/My Drive/Depot/02_Archiviert",
  );
  console.log(`Drive Originale: ${existsSync(driveOriginale) ? "vorhanden" : "fehlt"}`);
  console.log(`Drive Archiv: ${existsSync(driveArchiv) ? "vorhanden" : "fehlt"}`);

  const agents = capture("launchctl list 2>/dev/null | grep finanztool || true");
  if (agents) {
    console.log("\nGeladene finanztool LaunchAgents:");
    console.log(agents);
    if (device.role === "macbook") {
      console.log("\nHinweis: Auf dem MacBook Pro sollen produktive Agents nicht betrieben werden.");
    }
  } else {
    console.log("\nKeine geladenen finanztool LaunchAgents gefunden.");
  }
}

function installDependenciesAndBuild() {
  section("Dependencies und Build");
  installIfNeeded("app", "App");
  installIfNeeded("automation", "Automation");
  runWithProjectNode("npm --prefix app run build");
}

function runDownload() {
  section("ftd / Download");
  printContext();
  section("Git");
  const force = args.includes("--force");
  if (force) {
    git(["fetch", "origin", "--prune"]);
    const label = `ftd-force-${timestampId()}`;
    const backupBranch = `backup/${label}`;
    git(["branch", backupBranch, "HEAD"], { allowFailure: true });
    const backupDir = backupDirtyFiles(label);
    if (existsSync(path.join(repoRoot, ".git/rebase-merge")) || existsSync(path.join(repoRoot, ".git/rebase-apply"))) {
      git(["rebase", "--abort"], { allowFailure: true });
    }
    if (existsSync(path.join(repoRoot, ".git/MERGE_HEAD"))) {
      git(["merge", "--abort"], { allowFailure: true });
    }
    git(["checkout", "main"]);
    git(["reset", "--hard", "origin/main"]);
    git(["clean", "-fd"]);
    console.log(`Force-Download: Backup-Branch ${backupBranch}`);
    if (backupDir) console.log(`Force-Download: Datei-Backup ${backupDir}`);
  } else {
    ensureNormalGitState();
    ensureCleanWorkingTree();
  }
  git(["fetch", "origin", "--prune"]);
  git(["pull", "--ff-only", "origin", "main"]);
  installDependenciesAndBuild();

  const device = getDevice();
  if (device.role === "studio") {
    section("Mac Studio Agents");
    runWithProjectNode("npm --prefix automation run install:all-agents");
    runWithProjectNode("npm --prefix automation run sync:health");
    shell("launchctl list | grep finanztool || true");
  } else {
    section("Agents");
    console.log("MacBook Pro erkannt: produktive Studio-Agents werden nicht gestartet.");
  }

  printLocalStatus();
  section("Fertig");
  console.log(`Aktiver Stand: ${gitOutput(["rev-parse", "--short", "HEAD"])}`);
}

function runSave() {
  section("fts / Save");
  ensureNormalGitState();
  runWithProjectNode("npm --prefix app run build");
  const status = gitStatusPorcelain();
  if (!status) {
    console.log("Keine lokalen Aenderungen zum Committen.");
    return;
  }

  section("Aenderungen");
  shell("git diff --stat");
  console.log(status);

  const message = args.join(" ").trim() || "Save local project state";
  git(["add", "-A"]);
  git(["commit", "-m", message]);
  section("Fertig");
  console.log(`Lokaler Commit: ${gitOutput(["rev-parse", "--short", "HEAD"])}`);
  console.log("Nicht gepusht und nicht deployed. Fuer Uebergabe `ftu` ausfuehren.");
}

function updateHandoffDocs({ phase, source, target, baseCommit, handoffCommit, deployTime }) {
  const now = formatViennaTime();

  const switchPath = path.join(repoRoot, "docs/device_switch_log.md");
  const memoryPath = path.join(repoRoot, "docs/working_memory.md");
  const status = gitStatusPorcelain().split("\n").filter(Boolean).slice(0, 30).join("\n");

  if (phase === "start") {
    const entry = `### ${now} - ftu Handoff ${source} zu ${target}

Datum/Zeit: ${now}
Quellgeraet: ${source}
Zielgeraet: ${target}
Commit/Stand: Ausgangscommit \`${baseCommit}\`; Handoff-Commit wird in diesem
\`ftu\`-Lauf erstellt
Aktion: Projektstand bauen, Uebergabe dokumentieren, auf GitHub pushen und
Firebase deployen
Erledigt:
- \`ftu\` wurde auf ${source} gestartet
- App-Build wird im Workflow ausgefuehrt
- Geaenderte Dateien vor Handoff:
${status ? status.split("\n").map((line) => `  - ${line}`).join("\n") : "  - keine vorbestehenden Aenderungen"}
Naechste Schritte:
- Auf ${target} \`ftd\` ausfuehren
- Danach lokalen Status, Secrets und ggf. Agents pruefen
Wechselprobleme:
- Secrets und produktive LaunchAgents werden nicht per Git uebertragen
- Mac Studio bleibt produktiver Agent-Knoten
Lokale Besonderheiten:
- Kurzbefehle: \`ftd\` Download, \`fts\` Save, \`ftu\` Upload

`;

    if (existsSync(switchPath)) {
      const text = readFileSync(switchPath, "utf8");
      writeFileSync(switchPath, text.replace("## Eintraege\n\n", `## Eintraege\n\n${entry}`));
    }

    if (existsSync(memoryPath)) {
      const text = readFileSync(memoryPath, "utf8");
      const replacement = `## Aktueller Geraete-Handoff

- Stand: ${now}
- Aktion: \`ftu\` vom ${source} Richtung ${target}
- Ausgangscommit: \`${baseCommit}\`
- Handoff-Commit: wird in diesem \`ftu\`-Lauf erstellt
- Firebase Deploy: wird in diesem \`ftu\`-Lauf ausgefuehrt
- Naechster Schritt auf ${target}: \`ftd\` ausfuehren
- Bekannte Wechselpunkte:
  - Secrets und produktive LaunchAgents werden nicht per Git uebertragen
  - Mac Studio bleibt produktiver Agent-Knoten
  - Kurzbefehle sind \`ftd\`, \`fts\`, \`ftu\`
`;
      writeFileSync(memoryPath, replaceSection(text, "## Aktueller Geraete-Handoff", replacement));
    }
  }

  if (phase === "deployed") {
    if (existsSync(memoryPath)) {
      let text = readFileSync(memoryPath, "utf8");
      text = text.replace("- Handoff-Commit: wird in diesem `ftu`-Lauf erstellt", `- Handoff-Commit: \`${handoffCommit}\``);
      text = text.replace(
        "- Firebase Deploy: wird in diesem `ftu`-Lauf ausgefuehrt",
        `- Firebase Deploy: ${deployTime} erfolgreich`,
      );
      writeFileSync(memoryPath, text);
    }

    if (existsSync(switchPath)) {
      let text = readFileSync(switchPath, "utf8");
      text = text.replace("`ftu`-Lauf erstellt", `\`ftu\`-Lauf erstellt; Handoff-Commit \`${handoffCommit}\``);
      text = text.replace(
        "Erledigt:\n",
        `Erledigt:\n- Handoff-Commit \`${handoffCommit}\` auf GitHub gepusht\n- Firebase Deploy ${deployTime} erfolgreich\n`,
      );
      writeFileSync(switchPath, text);
    }
  }
}

function replaceSection(text, heading, replacement) {
  const start = text.indexOf(heading);
  if (start === -1) return `${text.trimEnd()}\n\n${replacement}\n`;
  const rest = text.slice(start + heading.length);
  const next = rest.search(/\n## /);
  if (next === -1) {
    return `${text.slice(0, start)}${replacement}\n`;
  }
  return `${text.slice(0, start)}${replacement}${rest.slice(next)}`;
}

function firebaseDeploy() {
  const deployTarget = process.env.FT_FIREBASE_ONLY || "hosting";
  const deployArgs = ["deploy", "--only", deployTarget, "--project", "finanzperformance-tool"];
  const maxAttempts = Number.parseInt(process.env.FT_FIREBASE_DEPLOY_ATTEMPTS || "5", 10);
  const nodeOptions = "--dns-result-order=ipv4first";
  const preferred = path.join(os.homedir(), ".nvm/versions/node/v20.19.3/bin/firebase");
  const firebasePath = existsSync(preferred) ? preferred : capture("command -v firebase 2>/dev/null");
  const command = firebasePath || "npx";
  const args = firebasePath ? deployArgs : ["firebase-tools", ...deployArgs];
  const env = { NODE_OPTIONS: nodeOptions };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) {
      console.log(`Firebase Deploy Versuch ${attempt}/${maxAttempts} nach kurzem Retry...`);
    }

    const result = run(command, args, { allowFailure: true, env });
    if (result.status === 0) return;
    if (attempt < maxAttempts) run("sleep", [String(attempt * 3)], { allowFailure: true });
  }

  fail(`${command} ${args.join(" ")} ist nach ${maxAttempts} Versuchen fehlgeschlagen`);
}

function runUploadPrepare() {
  section("ftu / Upload vorbereiten");
  const device = getDevice();
  const source = device.computerName;
  const target = targetFor(device);
  const baseCommit = gitOutput(["rev-parse", "--short", "HEAD"]);

  ensureRemoteIsIncluded();
  printContext();
  runWithProjectNode("npm --prefix app run build");
  updateHandoffDocs({ phase: "start", source, target, baseCommit });

  const status = gitStatusPorcelain();
  if (!status) {
    console.log("Keine Aenderungen vorhanden. Push/Deploy werden trotzdem geprueft.");
  } else {
    section("Commit");
    shell("git diff --stat");
    const message = args.join(" ").trim() || `Handoff ${source} to ${target}`;
    git(["add", "-A"]);
    git(["commit", "-m", message]);
  }

  section("Remote-Pruefung");
  git(["fetch", "origin", "--prune"]);
  const head = gitRev("HEAD");
  const remote = gitRev("origin/main");
  if (!isAncestor(remote, head)) {
    fail("GitHub wurde waehrend des Uploads aktualisiert. Kein Push/Deploy. Bitte zuerst `ftd` ausfuehren.");
  }

  section("Push");
  git(["push", "origin", "main"]);

  git(["fetch", "origin", "--prune"]);
  const pushedHead = gitRev("HEAD");
  const pushedRemote = gitRev("origin/main");
  if (pushedHead !== pushedRemote) {
    fail("Push-Verifikation fehlgeschlagen: lokaler HEAD und origin/main unterscheiden sich. Kein Firebase Deploy.");
  }

  const handoffCommit = gitOutput(["rev-parse", "--short", "HEAD"]);
  writeHandoffState({ source, target, baseCommit, handoffCommit });
  section("Firebase Deploy");
  console.log("Vorbereitung abgeschlossen. Firebase Deploy wird vom Shell-Wrapper ausgefuehrt.");
}

function runUploadFinalize() {
  section("ftu / Upload abschliessen");
  const device = getDevice();
  const state = readHandoffState() ?? {};
  const source = state.source ?? device.computerName;
  const target = state.target ?? targetFor(device);
  const baseCommit = state.baseCommit ?? gitOutput(["rev-parse", "--short", "HEAD"]);
  const handoffCommit = state.handoffCommit ?? gitOutput(["rev-parse", "--short", "HEAD"]);
  const deployTime = formatViennaTime();
  updateHandoffDocs({ phase: "deployed", source, target, baseCommit, handoffCommit, deployTime });

  if (gitStatusPorcelain()) {
    section("Deploy-Status Commit");
    shell("git diff --stat");
    git(["add", "-A"]);
    git(["commit", "-m", "Update deployed handoff status"]);
    git(["push", "origin", "main"]);
  }

  section("Fertig");
  console.log(`Aktiver Stand: ${gitOutput(["rev-parse", "--short", "HEAD"])}`);
  console.log(`Naechster Schritt auf ${target}: ftd`);
}

function runUpload() {
  runUploadPrepare();
  section("Firebase Deploy");
  firebaseDeploy();
  runUploadFinalize();
}

if (!command) {
  printUsage();
  fail(`Unbekannter Workflow: ${rawCommand}`, 2);
}

if (command === "context") printContext();
else if (command === "download") runDownload();
else if (command === "save") runSave();
else if (command === "upload") runUpload();
else if (command === "upload-pre") runUploadPrepare();
else if (command === "upload-finalize") runUploadFinalize();
else fail(`Unbekannter Workflow: ${rawCommand}`);
