import { formatIsoDateFromGerman, parseGermanNumber } from "./summary-utils.mjs";

export const INTERGOLD_PRICE_URL = "https://www.intergold-edelmetalle.com/aktuelles";

export async function fetchIntergoldPriceHtml() {
  const response = await fetch(INTERGOLD_PRICE_URL, {
    headers: { "user-agent": "finanztool-import-agent/0.1" },
  });

  if (!response.ok) {
    throw new Error(`Intergold Webseite nicht erreichbar: HTTP ${response.status}`);
  }

  return response.text();
}

function htmlToLines(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(h[1-6]|p|li|div|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&euro;/g, "€")
    .replace(/&#038;/g, "&")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function isMetalCandidate(line) {
  return /^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\s-]{2,32}$/.test(line);
}

export async function fetchIntergoldPrices() {
  return parseIntergoldPricesFromHtml(await fetchIntergoldPriceHtml());
}

export function parseIntergoldPricesFromHtml(html) {
  const lines = htmlToLines(html);
  const prices = [];

  for (let index = 0; index < lines.length; index += 1) {
    const verkaufLine = lines[index];
    if (!verkaufLine.startsWith("Verkauf:")) continue;

    const metal = lines[index - 1];
    if (!isMetalCandidate(metal)) continue;

    const blockLines = lines.slice(index, index + 4);
    const ankaufLine = blockLines.find((line) => line.startsWith("Ankauf:"));
    const standLine = blockLines.find((line) => line.startsWith("Stand "));
    if (!verkaufLine || !ankaufLine || !standLine) continue;

    const verkauf = verkaufLine.match(/Verkauf:\s*€\s*([\d.\s,]+)\s*\/\s*([A-Za-z]+)/);
    const ankauf = ankaufLine.match(/Ankauf:\s*€\s*([\d.\s,]+)\s*\/\s*([A-Za-z]+)/);
    const priceDate = formatIsoDateFromGerman(standLine);

    if (!verkauf || !ankauf || !priceDate) {
      prices.push({
        metal,
        status: "UNVOLLSTAENDIG",
        rawText: [metal, ...blockLines].join("\n"),
      });
      continue;
    }

    const unit = verkauf[2];
    const ankaufUnit = ankauf[2];
    prices.push({
      metal,
      unit,
      saleEur: parseGermanNumber(verkauf[1]),
      buyEur: parseGermanNumber(ankauf[1]),
      priceDate,
      source: "Intergold",
      rawText: [metal, ...blockLines].join("\n"),
      status: unit === ankaufUnit ? "OK" : "FEHLER",
    });
  }

  if (prices.length === 0) {
    throw new Error("Keine Intergold-Preisblöcke gefunden.");
  }

  return prices;
}
