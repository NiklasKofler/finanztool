import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function findFirebaseToolsAuthPath() {
  const { stdout } = await execFileAsync("which", ["firebase"]);
  const firebaseBinary = await fs.realpath(stdout.trim());
  return path.join(path.dirname(firebaseBinary), "../auth.js");
}

export async function getFirebaseCliAccessToken() {
  const configPath = path.join(os.homedir(), ".config/configstore/firebase-tools.json");
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  const refreshToken = config.tokens?.refresh_token;
  if (!refreshToken) {
    throw new Error('Firebase CLI ist nicht angemeldet. Fuehre zuerst "firebase login" aus.');
  }

  let auth;
  try {
    auth = await import(await findFirebaseToolsAuthPath());
  } catch {
    throw new Error(
      "Die lokale Firebase-CLI-Installation wurde nicht gefunden. " +
        'Installiere firebase-tools oder verwende "npm run import:bitget" mit Service Account.',
    );
  }

  const token = await auth.getAccessToken(refreshToken, []);
  if (!token?.access_token) throw new Error("Firebase CLI konnte keinen Access Token bereitstellen.");
  return token.access_token;
}
