import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function readLocalSecret(envName, keychainService) {
  const envValue = process.env[envName]?.trim();
  if (envValue) return envValue;

  if (process.platform !== "darwin") return null;

  try {
    const { stdout } = await execFileAsync("security", [
      "find-generic-password",
      "-s",
      keychainService,
      "-w",
    ]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function requireLocalSecret(envName, keychainService) {
  const value = await readLocalSecret(envName, keychainService);
  if (value) return value;

  throw new Error(
    `${envName} fehlt. Setze die Umgebungsvariable oder speichere den Wert im ` +
      `macOS-Schluesselbund unter dem Dienst "${keychainService}".`,
  );
}
