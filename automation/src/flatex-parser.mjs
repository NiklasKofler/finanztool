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

function safeHeaderKey(header, index) {
  const cleaned = String(header ?? "").trim();
  if (cleaned) return cleaned;
  return `col_${index + 1}`;
}

function findHeaderKey(headers, candidates) {
  for (const candidate of candidates) {
    const hit = headers.find((header) => header.includes(candidate));
    if (hit) return hit;
  }
  return null;
}

export function parseFlatexCsv(csvText) {
  const lines = csvText
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
  const rawHeaders = parseCsvLine(lines[0], delimiter).map(safeHeaderKey);
  const normalizedHeaders = rawHeaders.map(normalizeHeader);

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

  const warnings = [];
  if (!amountKey) warnings.push("Keine Betrags-Spalte erkannt.");
  if (!dateKey) warnings.push("Keine Datums-Spalte erkannt.");

  const rows = [];
  let skippedRows = 0;

  for (let index = 1; index < lines.length; index += 1) {
    const values = parseCsvLine(lines[index], delimiter);
    const rowRaw = {};
    rawHeaders.forEach((header, colIndex) => {
      rowRaw[header] = (values[colIndex] ?? "").trim();
    });

    const normalizedRow = new Map();
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

  return { rows, skippedRows, warnings };
}

export function buildPositionMap(rows) {
  const positions = new Map();
  for (const row of rows) {
    if (row.quantity === null || row.quantity === 0) continue;
    const key = row.isin ?? `TEXT:${row.bookingText}`;
    const current = positions.get(key) ?? {
      isin: row.isin,
      label: row.bookingText,
      quantity: 0,
      currency: row.currency || "EUR",
    };
    current.quantity += row.quantity;
    positions.set(key, current);
  }
  return Array.from(positions.entries()).map(([key, value]) => ({ key, ...value }));
}
