function normalizeHeader(value) {
  return value
    .trim()
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .replace(/[^a-z0-9]+/g, " ");
}

function decodeCsvInput(input) {
  if (!Buffer.isBuffer(input)) return String(input ?? "");
  const utf8 = input.toString("utf8");
  if (!utf8.includes("\uFFFD")) return utf8;
  return new TextDecoder("windows-1252").decode(input);
}

function parseGermanNumber(value) {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) return null;
  const signSafe = cleaned.replace(/[^\d,.-]/g, "");
  if (!signSafe) return null;
  const noThousands = signSafe.replace(/\./g, "");
  const decimalDot = noThousands.replace(",", ".");
  const parsed = Number.parseFloat(decimalDot);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseGermanDate(value) {
  const cleaned = String(value ?? "").trim();
  const match = cleaned.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

function detectDelimiter(firstLine) {
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return semicolons >= commas ? ";" : ",";
}

function parseCsvLine(line, delimiter) {
  const cells = [];
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

function safeHeaderKey(header, index, existingKeys) {
  const cleaned = String(header ?? "").trim();
  const base = cleaned || `col_${index + 1}`;
  let key = base;
  let suffix = 2;
  while (existingKeys.has(key)) {
    key = `${base}_${suffix}`;
    suffix += 1;
  }
  existingKeys.add(key);
  return key;
}

function findHeaderIndex(headers, candidates) {
  for (const candidate of candidates) {
    const hit = headers.findIndex((header) => header.includes(candidate));
    if (hit !== -1) return hit;
  }
  return -1;
}

export function parseFlatexCsv(input) {
  const lines = decodeCsvInput(input)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return {
      rows: [],
      skippedRows: 0,
      warnings: ["CSV enthaelt zu wenig Zeilen fuer einen Import."],
    };
  }

  const delimiter = detectDelimiter(lines[0]);
  const existingHeaderKeys = new Set();
  const rawHeaders = parseCsvLine(lines[0], delimiter).map((header, index) =>
    safeHeaderKey(header, index, existingHeaderKeys),
  );
  const normalizedHeaders = rawHeaders.map(normalizeHeader);

  const dateIndex = findHeaderIndex(normalizedHeaders, ["buchungstag", "datum", "valuta"]);
  const textIndex = findHeaderIndex(normalizedHeaders, [
    "buchungsinformationen",
    "buchungsinformation",
    "buchungstext",
    "transaktion",
    "bezeichnung",
    "empfaenger",
    "wertpapier",
    "text",
  ]);
  const labelIndex = findHeaderIndex(normalizedHeaders, [
    "bezeichnung",
    "wertpapier",
    "empfaenger",
    "buchungsinformationen",
  ]);
  const isinIndex = findHeaderIndex(normalizedHeaders, ["isin"]);
  const quantityIndex = findHeaderIndex(normalizedHeaders, [
    "nominal stk",
    "nominal",
    "stueck",
    "anzahl",
    "menge",
  ]);
  const amountIndex = findHeaderIndex(normalizedHeaders, ["betrag", "umsatz", "wert"]);
  const currencyIndex = findHeaderIndex(normalizedHeaders, ["waehrung", "currency"]);
  const transactionIdIndex = findHeaderIndex(normalizedHeaders, ["ta nr", "transaktionsnummer"]);

  const warnings = [];
  if (amountIndex === -1) warnings.push("Keine Betrags-Spalte erkannt.");
  if (dateIndex === -1) warnings.push("Keine Datums-Spalte erkannt.");

  const rows = [];
  let skippedRows = 0;

  for (let index = 1; index < lines.length; index += 1) {
    const values = parseCsvLine(lines[index], delimiter);
    const rowRaw = {};
    rawHeaders.forEach((header, colIndex) => {
      rowRaw[header] = (values[colIndex] ?? "").trim();
    });

    const valueAt = (columnIndex) =>
      columnIndex >= 0 ? String(values[columnIndex] ?? "").trim() : "";
    const dateRaw = valueAt(dateIndex);
    const amountRaw = valueAt(amountIndex);
    const textRaw = valueAt(textIndex);
    const labelRaw = valueAt(labelIndex);
    const isinRaw = valueAt(isinIndex);
    const qtyRaw = valueAt(quantityIndex);
    const adjacentCurrency = amountIndex >= 0 ? valueAt(amountIndex + 1) : "";
    const currencyRaw = valueAt(currencyIndex) || adjacentCurrency || "EUR";
    const transactionIdRaw = valueAt(transactionIdIndex);

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
      label: labelRaw || bookingText,
      transactionId: transactionIdRaw || null,
      isin: isinRaw || null,
      quantity,
      amount,
      currency: currencyRaw || "EUR",
      raw: rowRaw,
    });
  }

  return { rows, skippedRows, warnings };
}

export function buildPositionMap(rows) {
  const positions = new Map();
  for (const row of rows) {
    if (row.quantity === null || row.quantity === 0) continue;
    const key = row.isin ?? `TEXT:${row.bookingText}`;
    const current = positions.get(key) ?? {
      isin: row.isin,
      label: row.label || row.bookingText,
      quantity: 0,
      currency: row.currency || "EUR",
    };
    current.quantity += row.quantity;
    positions.set(key, current);
  }
  return Array.from(positions.entries()).map(([key, value]) => ({ key, ...value }));
}
