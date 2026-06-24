import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const defaultExportPath = path.resolve("runtime", "secrets", "finanztool-keychain-secrets.enc");
const services = [
  { service: "finanztool-bitget-api-key", label: "Bitget API-Key" },
  { service: "finanztool-bitget-api-secret", label: "Bitget API-Secret" },
  { service: "finanztool-bitget-api-passphrase", label: "Bitget API-Passphrase" },
  { service: "finanztool-capitalcom-identifier", label: "Capital.com Login/E-Mail" },
  { service: "finanztool-capitalcom-api-key", label: "Capital.com API-Key" },
  { service: "finanztool-capitalcom-api-password", label: "Capital.com API-Key Custom Password" },
  { service: "finanztool-eodhd-api-key", label: "EODHD API-Key" },
  { service: "finanztool-flatex-user-id", label: "Flatex Kundennummer" },
  { service: "finanztool-flatex-password", label: "Flatex Passwort" },
  { service: "finanztool-ginmon-email", label: "Ginmon E-Mail" },
  { service: "finanztool-ginmon-password", label: "Ginmon Passwort" },
  { service: "finanztool-traderepublic-phone", label: "Trade Republic Telefonnummer" },
  { service: "finanztool-traderepublic-pin", label: "Trade Republic PIN" },
  { service: "finanztool-traderepublic-pdf-password", label: "Trade Republic PDF-Passwort" },
  { service: "finanztool-vbv-email", label: "VBV E-Mail" },
  { service: "finanztool-vbv-password", label: "VBV Passwort" },
];

function readArg(name) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function promptHidden(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  const originalWrite = rl._writeToOutput;
  rl._writeToOutput = function writeToOutput(value) {
    if (rl.stdoutMuted && value !== "\n" && value !== "\r\n") {
      rl.output.write("*");
      return;
    }
    originalWrite.call(rl, value);
  };

  const answer = await new Promise((resolve) => {
    rl.stdoutMuted = true;
    rl.question(prompt, resolve);
  });
  rl.close();
  process.stdout.write("\n");
  return String(answer);
}

async function readSecret(service) {
  try {
    const { stdout } = await execFileAsync("security", ["find-generic-password", "-s", service, "-w"]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function writeSecret(service, value) {
  await execFileAsync("security", [
    "add-generic-password",
    "-U",
    "-s",
    service,
    "-a",
    process.env.USER ?? os.userInfo().username,
    "-w",
    value,
  ]);
}

function deriveKey(passphrase, salt) {
  return crypto.pbkdf2Sync(passphrase, salt, 250_000, 32, "sha256");
}

function encryptPayload(payload, passphrase) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(passphrase, salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    kdf: "pbkdf2-sha256",
    iterations: 250_000,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    payload: encrypted.toString("base64"),
  };
}

function decryptPayload(container, passphrase) {
  if (container.version !== 1 || container.algorithm !== "aes-256-gcm") {
    throw new Error("Unbekanntes Secrets-Exportformat.");
  }
  const salt = Buffer.from(container.salt, "base64");
  const iv = Buffer.from(container.iv, "base64");
  const authTag = Buffer.from(container.authTag, "base64");
  const encrypted = Buffer.from(container.payload, "base64");
  const key = deriveKey(passphrase, salt);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"));
}

async function exportSecrets() {
  const outputPath = path.resolve(readArg("--out") ?? defaultExportPath);
  const passphrase = await promptHidden("Transfer-Passwort: ");
  const confirmation = await promptHidden("Transfer-Passwort wiederholen: ");
  if (!passphrase || passphrase !== confirmation) {
    throw new Error("Transfer-Passwoerter stimmen nicht ueberein.");
  }

  const entries = [];
  for (const item of services) {
    const value = await readSecret(item.service);
    if (value) entries.push({ ...item, value });
  }
  if (!entries.length) throw new Error("Keine Finanztool-Secrets im Schluesselbund gefunden.");

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const container = encryptPayload(
    {
      createdAt: new Date().toISOString(),
      host: os.hostname(),
      entries,
    },
    passphrase,
  );
  await fs.writeFile(outputPath, `${JSON.stringify(container, null, 2)}\n`, { mode: 0o600 });
  console.log(`[ok] ${entries.length} Secrets verschluesselt exportiert: ${outputPath}`);
}

async function importSecrets() {
  const inputPath = path.resolve(readArg("--in") ?? defaultExportPath);
  const passphrase = await promptHidden("Transfer-Passwort: ");
  const container = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const payload = decryptPayload(container, passphrase);
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  if (!entries.length) throw new Error("Secrets-Datei enthaelt keine Eintraege.");

  for (const entry of entries) {
    if (!services.some((item) => item.service === entry.service)) {
      throw new Error(`Unbekannter Secret-Service im Export: ${entry.service}`);
    }
    await writeSecret(entry.service, entry.value);
  }
  console.log(`[ok] ${entries.length} Secrets in den lokalen Schluesselbund importiert.`);
}

async function listSecrets() {
  const found = [];
  const missing = [];
  for (const item of services) {
    const value = await readSecret(item.service);
    (value ? found : missing).push(item.label);
  }
  console.log(JSON.stringify({ found, missing }, null, 2));
}

const command = process.argv[2];
if (command === "export") {
  await exportSecrets();
} else if (command === "import") {
  await importSecrets();
} else if (command === "list") {
  await listSecrets();
} else {
  console.log("Nutzung: node src/keychain-secret-transfer.mjs export|import|list [--out DATEI] [--in DATEI]");
  process.exit(command ? 1 : 0);
}
