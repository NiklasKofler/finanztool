export interface FlatexParsedRow {
  date: string | null;
  bookingText: string;
  isin: string | null;
  quantity: number | null;
  amount: number | null;
  currency: string;
  raw: Record<string, string>;
}

export interface FlatexParseResult {
  rows: FlatexParsedRow[];
  skippedRows: number;
  warnings: string[];
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .replace(/[^a-z0-9]+/g, " ");
}

function parseGermanNumber(value: string): number | null {
  const cleaned = value.trim();
  if (!cleaned) return null;
  const signSafe = cleaned.replace(/[^\d,.-]/g, "");
  if (!signSafe) return null;
  const noThousands = signSafe.replace(/\./g, "");
  const decimalDot = noThousands.replace(",", ".");
  const parsed = Number.parseFloat(decimalDot);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseGermanDate(value: string): string | null {
  const cleaned = value.trim();
  const match = cleaned.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

function detectDelimiter(firstLine: string): ";" | "," {
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return semicolons >= commas ? ";" : ",";
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function findHeaderKey(headers: string[], candidates: string[]): string | null {
  for (const candidate of candidates) {
    const hit = headers.find((header) => header.includes(candidate));
    if (hit) return hit;
  }
  return null;
}

export function parseFlatexCsv(csvText: string): FlatexParseResult {
  const lines = csvText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return {
      rows: [],
      skippedRows: 0,
      warnings: ["CSV enthält zu wenig Zeilen für einen Import."],
    };
  }

  const delimiter = detectDelimiter(lines[0]);
  const rawHeaders = parseCsvLine(lines[0], delimiter);
  const normalizedHeaders = rawHeaders.map(normalizeHeader);
  const headerMap = new Map<string, string>();

  normalizedHeaders.forEach((normalized, index) => {
    headerMap.set(normalized, rawHeaders[index]);
  });

  const dateKey = findHeaderKey(normalizedHeaders, ["buchungstag", "datum", "valuta"]);
  const textKey = findHeaderKey(normalizedHeaders, [
    "buchungstext",
    "transaktion",
    "bezeichnung",
    "wertpapier",
    "text",
  ]);
  const isinKey = findHeaderKey(normalizedHeaders, ["isin"]);
  const quantityKey = findHeaderKey(normalizedHeaders, ["stueck", "anzahl", "menge"]);
  const amountKey = findHeaderKey(normalizedHeaders, ["betrag", "umsatz", "wert"]);
  const currencyKey = findHeaderKey(normalizedHeaders, ["waehrung", "currency"]);

  const warnings: string[] = [];
  if (!amountKey) warnings.push("Keine Betrags-Spalte erkannt.");
  if (!dateKey) warnings.push("Keine Datums-Spalte erkannt.");

  const rows: FlatexParsedRow[] = [];
  let skippedRows = 0;

  for (let index = 1; index < lines.length; index += 1) {
    const values = parseCsvLine(lines[index], delimiter);
    const rowRaw: Record<string, string> = {};

    rawHeaders.forEach((header, colIndex) => {
      rowRaw[header] = (values[colIndex] ?? "").trim();
    });

    const normalizedRow = new Map<string, string>();
    normalizedHeaders.forEach((header, colIndex) => {
      normalizedRow.set(header, (values[colIndex] ?? "").trim());
    });

    const dateRaw = dateKey ? normalizedRow.get(dateKey) ?? "" : "";
    const amountRaw = amountKey ? normalizedRow.get(amountKey) ?? "" : "";
    const textRaw = textKey ? normalizedRow.get(textKey) ?? "" : "";
    const isinRaw = isinKey ? normalizedRow.get(isinKey) ?? "" : "";
    const qtyRaw = quantityKey ? normalizedRow.get(quantityKey) ?? "" : "";
    const currencyRaw = currencyKey ? normalizedRow.get(currencyKey) ?? "" : "EUR";

    const amount = parseGermanNumber(amountRaw);
    const date = parseGermanDate(dateRaw);
    const quantity = parseGermanNumber(qtyRaw);
    const bookingText = textRaw || "Unbekannte Buchung";

    if (!date && amount === null && !bookingText) {
      skippedRows += 1;
      continue;
    }

    rows.push({
      date,
      bookingText,
      isin: isinRaw || null,
      quantity,
      amount,
      currency: currencyRaw || "EUR",
      raw: rowRaw,
    });
  }

  if (rows.length === 0) {
    warnings.push("Keine importierbaren Datenzeilen erkannt.");
  }

  const missingMappings = [
    [dateKey, "Datum"],
    [amountKey, "Betrag"],
    [textKey, "Buchungstext"],
  ]
    .filter(([key]) => !key)
    .map(([, label]) => label);

  if (missingMappings.length > 0) {
    warnings.push(`Nicht alle Kernspalten erkannt: ${missingMappings.join(", ")}.`);
  }

  return { rows, skippedRows, warnings };
}

export async function hashFileSha256(file: File): Promise<string> {
  const content = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", content);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((value) => value.toString(16).padStart(2, "0")).join("");
}
