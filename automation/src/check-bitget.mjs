import "dotenv/config";
import {
  BitgetApiError,
  createBitgetClientFromLocalSecrets,
  fetchBitgetServerTime,
  fetchBitgetPortfolioSnapshot,
} from "./bitget-client.mjs";

function explainBitgetError(error) {
  if (!(error instanceof BitgetApiError)) return error.message;

  const message = String(error.message).toLowerCase();
  if (message.includes("sign signature")) {
    return (
      "Signatur wurde abgelehnt. API-Secret und Passphrase exakt pruefen. " +
      "Falls der Key eine IP-Bindung besitzt, muss auch die aktuelle oeffentliche IP erlaubt sein."
    );
  }
  if (message.includes("api key") || message.includes("apikey")) {
    return "API-Key wurde abgelehnt oder besitzt nicht die erforderliche Read-only-Berechtigung.";
  }
  if (message.includes("timestamp")) {
    return "Zeitstempel wurde abgelehnt. macOS-Zeit und Zeitzone automatisch synchronisieren.";
  }
  return error.message;
}

try {
  const serverTime = await fetchBitgetServerTime();
  console.log(`[ok] Bitget Public API erreichbar (Serverzeit: ${serverTime?.serverTime ?? "OK"})`);

  const client = await createBitgetClientFromLocalSecrets();
  const snapshot = await fetchBitgetPortfolioSnapshot(client);
  console.log(`[ok] Bitget Read-only API funktioniert: ${snapshot.positions.length} Position(en)`);
  snapshot.positions.forEach((position) => {
    console.log(`  - ${position.name}: ${position.quantityText}`);
  });
} catch (error) {
  console.error(`[fehler] ${explainBitgetError(error)}`);
  process.exitCode = 1;
}
