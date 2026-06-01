import "dotenv/config";
import { GoogleAuth } from "google-auth-library";
import fs from "node:fs/promises";
import path from "node:path";

const required = ["FIREBASE_PROJECT_ID", "FIREBASE_SERVICE_ACCOUNT_PATH"];

for (const key of required) {
  if (!process.env[key]) throw new Error(`Fehlende Umgebungsvariable: ${key}`);
}

const serviceAccount = JSON.parse(
  await fs.readFile(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, "utf8"),
);
const rulesPath = path.resolve("../firestore.rules");
const rules = await fs.readFile(rulesPath, "utf8");

const auth = new GoogleAuth({
  credentials: serviceAccount,
  scopes: [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/firebase",
  ],
});
const client = await auth.getClient();
const token = (await client.getAccessToken()).token;

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

const rulesetResponse = await fetch(
  `https://firebaserules.googleapis.com/v1/projects/${process.env.FIREBASE_PROJECT_ID}/rulesets`,
  {
    method: "POST",
    headers,
    body: JSON.stringify({
      source: {
        files: [{ name: "firestore.rules", content: rules }],
      },
    }),
  },
);
const ruleset = await rulesetResponse.json();
if (!rulesetResponse.ok) {
  throw new Error(`Ruleset konnte nicht erstellt werden: ${JSON.stringify(ruleset)}`);
}

const releaseResponse = await fetch(
  `https://firebaserules.googleapis.com/v1/projects/${process.env.FIREBASE_PROJECT_ID}/releases/cloud.firestore`,
  {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      release: {
        name: `projects/${process.env.FIREBASE_PROJECT_ID}/releases/cloud.firestore`,
        rulesetName: ruleset.name,
      },
      updateMask: "rulesetName",
    }),
  },
);
const release = await releaseResponse.json();
if (!releaseResponse.ok) {
  throw new Error(`Ruleset konnte nicht released werden: ${JSON.stringify(release)}`);
}

console.log(JSON.stringify({ ruleset: ruleset.name, release }, null, 2));
