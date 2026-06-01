import "dotenv/config";
import admin from "firebase-admin";
import fs from "node:fs/promises";
import path from "node:path";
import { fetchIntergoldPrices, INTERGOLD_PRICE_URL } from "./intergold-prices.mjs";
import { extractPdfText } from "./pdf-text.mjs";
import {
  hashFile,
  latestByName,
  listFiles,
  formatIsoDateFromGerman,
  parseCsv,
  parseGermanNumber,
  rowsToObjects,
} from "./summary-utils.mjs";

const required = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_STORAGE_BUCKET",
  "FIREBASE_SERVICE_ACCOUNT_PATH",
  "DEPOT_ROOT",
];

for (const key of required) {
  if (!process.env[key]) throw new Error(`Fehlende Umgebungsvariable: ${key}`);
}

const serviceAccount = JSON.parse(
  await fs.readFile(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, "utf8"),
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});

const db = admin.firestore();
const bucket = admin.storage().bucket();
const depotRoot = process.env.DEPOT_ROOT;
const runId = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);

function sum(values) {
  return values.reduce((total, value) => total + (value ?? 0), 0);
}

function compactDocId(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[^\w.-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

async function replaceSourcePositions(source, positions) {
  const existing = await db.collection("sourcePositions").where("source", "==", source).get();
  const batch = db.batch();

  existing.docs.forEach((doc) => batch.delete(doc.ref));
  positions.forEach((position) => {
    batch.set(db.collection("sourcePositions").doc(position.id), {
      ...position,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  await batch.commit();
}

async function storageAvailable() {
  try {
    const [exists] = await bucket.exists();
    return exists;
  } catch {
    return false;
  }
}

async function maybeUploadOriginal({ source, filePath, content, hash, canUpload }) {
  if (!canUpload) {
    return { rawStoragePath: null, storageStatus: "SKIPPED_BUCKET_UNAVAILABLE" };
  }

  const targetPath = `raw/${source}/${hash}_${path.basename(filePath)}`;
  await bucket.file(targetPath).save(content, {
    metadata: {
      contentType: filePath.toLowerCase().endsWith(".csv") ? "text/csv" : "application/pdf",
    },
    resumable: false,
  });
  return { rawStoragePath: targetPath, storageStatus: "UPLOADED" };
}

async function writeImportRecord({ filePath, source, parser, hash, rawStoragePath, storageStatus }) {
  const importId = `file_${hash.slice(0, 24)}`;
  await db.collection("imports").doc(importId).set(
    {
      source,
      parser,
      filePath,
      fileName: path.basename(filePath),
      fileHash: hash,
      status: "SNAPSHOT_IMPORTED",
      rawStoragePath,
      storageStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      runId,
    },
    { merge: true },
  );
  return importId;
}

async function processSourceFile({ filePath, source, parser, canUpload }) {
  const { content, hash } = await hashFile(filePath);
  const storage = await maybeUploadOriginal({ source, filePath, content, hash, canUpload });
  const importId = await writeImportRecord({ filePath, source, parser, hash, ...storage });
  return { content, hash, importId, ...storage };
}

async function importFlatex(canUpload) {
  const filePath = path.join(
    depotRoot,
    "Flatex/Depotuebersicht/2026-05-24_Flatex_Depotuebersicht_Snapshot.csv",
  );
  const { content, importId, rawStoragePath, storageStatus } = await processSourceFile({
    filePath,
    source: "flatex",
    parser: "flatex_depot_snapshot_v1",
    canUpload,
  });
  const records = rowsToObjects(parseCsv(content.toString("utf8")));
  const currentValue = sum(records.map((row) => parseGermanNumber(row.total_value_text)));
  const costValue = sum(records.map((row) => parseGermanNumber(row.cost_value_text)));
  const performanceValue = currentValue - costValue;

  await db.collection("sourceSummaries").doc("flatex").set(
    {
      source: "flatex",
      displayName: "Flatex",
      currentValue,
      costValue,
      performanceValue,
      performancePct: costValue ? performanceValue / costValue : null,
      valuationDate: records[0]?.snapshot_time ?? null,
      sourceDocument: filePath,
      importId,
      rawStoragePath,
      storageStatus,
      positionCount: records.length,
      status: "VERIFIED",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const positions = records.map((row) => {
    const id = `${row.isin || row.wkn || row.name}`.replace(/[^\w.-]/g, "_");
    return {
      id: `flatex_${id}`,
      source: "flatex",
      name: row.name,
      category: row.category,
      isin: row.isin,
      wkn: row.wkn,
      quantityText: row.quantity_text,
      quoteText: row.quote_text,
      currentValue: parseGermanNumber(row.total_value_text),
      costValue: parseGermanNumber(row.cost_value_text),
      performanceValue: parseGermanNumber(row.performance_value_text),
      performancePct: parseGermanNumber(row.performance_pct_text) / 100,
      valuationDate: row.snapshot_time,
      sourceDocument: filePath,
    };
  });
  await replaceSourcePositions("flatex", positions);

  return { source: "flatex", currentValue, positionCount: records.length };
}

function parseTradeRepublicPositions(text, cash) {
  const normalized = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  const sections = [
    {
      category: "Brokerage",
      text:
        normalized.match(
          /BROKERAGE .*? STK\. \/ NOMINALE .*? KURSWERT IN EUR (.*?) ANZAHL POSITIONEN:/,
        )?.[1] ?? "",
    },
    {
      category: "Private Markets",
      text:
        normalized.match(
          /PRIVATE MARKETS .*? STK\. \/ NOMINALE .*? KURSWERT IN EUR (.*?) ANZAHL POSITIONEN:/,
        )?.[1] ?? "",
    },
  ];
  const positionPattern =
    /([\d.,]+)\s+Stk\.\s+(.+?)\s+ISIN:\s+([A-Z]{2}[A-Z0-9]{10}).*?\s+([\d ]+,\d{2}|\d+,\d{2})\s+(\d{2}\.\d{2}\.\d{4})\s+([\d ]+,\d{2}|\d+,\d{2})/g;
  const positions = [];

  for (const section of sections) {
    for (const match of section.text.matchAll(positionPattern)) {
      positions.push({
        id: `traderepublic_${match[3]}`,
        source: "traderepublic",
        name: match[2].trim(),
        category: section.category,
        isin: match[3],
        quantityText: `${match[1]} Stk.`,
        quoteText: `${match[4]} EUR`,
        quoteDate: formatIsoDateFromGerman(match[5]),
        currentValue: parseGermanNumber(match[6]),
        valuationDate: formatIsoDateFromGerman(match[5]),
      });
    }
  }

  if (cash != null) {
    positions.push({
      id: "traderepublic_cash",
      source: "traderepublic",
      name: "Cashkonto",
      category: "Cash",
      quantityText: "1 Konto",
      currentValue: cash,
    });
  }

  return positions;
}

async function importTradeRepublic(canUpload) {
  const filePath = path.join(depotRoot, "TradeRepublic/2026-05-24_TradeRepublic_NetWorth.pdf");
  const { importId, rawStoragePath, storageStatus } = await processSourceFile({
    filePath,
    source: "traderepublic",
    parser: "trade_republic_networth_v1",
    canUpload,
  });
  const text = await extractPdfText(filePath);
  const brokerage = parseGermanNumber(text.match(/Brokerage\s+([\d\s.,]+)/)?.[1] ?? "");
  const privateMarkets = parseGermanNumber(text.match(/Private Markets\s+([\d\s.,]+)/)?.[1] ?? "");
  const cash = parseGermanNumber(text.match(/Cash\s+([\d\s.,]+)/)?.[1] ?? "");
  const currentValue = parseGermanNumber(text.match(/GESAMT\s+([\d\s.,]+)\s+EUR/)?.[1] ?? "");
  const valuationDate = formatIsoDateFromGerman(
    text.match(/VERMÖGENSÜBERSICHT\s+zum\s+(\d{2}\.\d{2}\.\d{4})/)?.[1] ?? "",
  );
  const positions = parseTradeRepublicPositions(text, cash);

  await db.collection("sourceSummaries").doc("traderepublic").set(
    {
      source: "traderepublic",
      displayName: "Trade Republic",
      currentValue,
      components: { brokerage, privateMarkets, cash },
      valuationDate,
      sourceDocument: filePath,
      importId,
      rawStoragePath,
      storageStatus,
      positionCount: positions.length,
      status: currentValue ? "VERIFIED" : "UNVOLLSTAENDIG",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await replaceSourcePositions("traderepublic", positions.map((position) => ({
    ...position,
    valuationDate: position.valuationDate ?? valuationDate,
    sourceDocument: filePath,
  })));

  return { source: "traderepublic", currentValue, positionCount: positions.length };
}

function germanMonthToNumber(month) {
  const map = {
    Januar: "01",
    Februar: "02",
    März: "03",
    Maerz: "03",
    April: "04",
    Mai: "05",
    Juni: "06",
    Juli: "07",
    August: "08",
    September: "09",
    Oktober: "10",
    November: "11",
    Dezember: "12",
  };
  return map[month] ?? null;
}

function parseGermanLongDate(text) {
  const match = text.match(/zum\s+(\d{1,2})\.\s+([A-Za-zÄÖÜäöü]+)\s+(\d{4})/);
  if (!match) return null;
  const month = germanMonthToNumber(match[2]);
  return month ? `${match[3]}-${month}-${match[1].padStart(2, "0")}` : null;
}

function parseGinmonPositions(text, cash, valuationDate, filePath) {
  const normalized = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  const positionPattern =
    /([A-Z0-9][A-Z0-9().+\-/& ]{2,}?)\s+EUR\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+(-?[\d.,]+)\s+([\d.,]+)\s+([A-Z]{2}[A-Z0-9]{10})\/([A-Z0-9]+)/g;
  const positions = [];

  for (const match of normalized.matchAll(positionPattern)) {
    const name = match[1].trim();
    if (name.includes("Investmentfonds") || name.includes("Bezeichnung")) continue;
    const currentValue = parseGermanNumber(match[6]);
    const performanceValue = parseGermanNumber(match[5]);
    const costValue =
      currentValue != null && performanceValue != null ? currentValue - performanceValue : null;

    positions.push({
      id: `ginmon_${match[7]}`,
      source: "ginmon",
      name,
      category: "Investmentfonds",
      isin: match[7],
      wkn: match[8],
      quantityText: `${match[2]} Stk.`,
      costPrice: parseGermanNumber(match[3]),
      quoteValue: parseGermanNumber(match[4]),
      quoteText: `${match[4]} EUR`,
      currentValue,
      costValue,
      performanceValue,
      performancePct: costValue ? performanceValue / costValue : null,
      valuationDate,
      sourceDocument: filePath,
    });
  }

  if (cash != null) {
    positions.push({
      id: "ginmon_cash",
      source: "ginmon",
      name: "Verrechnungskonto",
      category: "Cash",
      quantityText: "1 Konto",
      currentValue: cash,
      valuationDate,
      sourceDocument: filePath,
    });
  }

  return positions;
}

async function importGinmon(canUpload) {
  const reportRoot = path.join(depotRoot, "Ginmon/Reports");
  const filePath = latestByName(
    await listFiles(reportRoot, (file) => /ASSET_STATUS_REPORT.*\.pdf$/i.test(file)),
  );
  const { importId, rawStoragePath, storageStatus } = await processSourceFile({
    filePath,
    source: "ginmon",
    parser: "ginmon_asset_status_v1",
    canUpload,
  });
  const text = await extractPdfText(filePath);
  const currentValue = parseGermanNumber(text.match(/Gesamtvermögen\s+([\d.,]+)/)?.[1] ?? "");
  const depotValue = parseGermanNumber(text.match(/Depotwert gesamt\s+([\d.,]+)/)?.[1] ?? "");
  const cash = parseGermanNumber(text.match(/Kontosalden gesamt\s+([\d.,]+)/)?.[1] ?? "");
  const valuationDate = parseGermanLongDate(text);
  const positions = parseGinmonPositions(text, cash, valuationDate, filePath);

  await db.collection("sourceSummaries").doc("ginmon").set(
    {
      source: "ginmon",
      displayName: "Ginmon",
      currentValue,
      components: { depotValue, cash },
      valuationDate,
      sourceDocument: filePath,
      importId,
      rawStoragePath,
      storageStatus,
      positionCount: positions.length,
      status: currentValue ? "VERIFIED" : "UNVOLLSTAENDIG",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await replaceSourcePositions("ginmon", positions);

  return { source: "ginmon", currentValue, positionCount: positions.length };
}

function normalizeMetalName(value) {
  return value.replace(/oxid$/i, "").trim();
}

function convertMetalValue(quantity, quantityUnit, price, priceUnit) {
  if (quantityUnit === priceUnit) return quantity * price;
  if (quantityUnit === "kg" && priceUnit === "g") return quantity * 1000 * price;
  if (quantityUnit === "g" && priceUnit === "kg") return (quantity / 1000) * price;
  return null;
}

function parseIntergoldInvoice(text) {
  const normalized = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  const invoiceNumber = normalized.match(/Rechnungsbeleg\s+(AR\d+)/)?.[1] ?? null;
  const invoiceDate = normalized.match(/Belegdatum:\s*(\d{2}\.\d{2}\.\d{2,4})/)?.[1] ?? null;
  const endsumme = parseGermanNumber(normalized.match(/Endsumme\s+([\d.,]+)\s*€/)?.[1] ?? "");
  const positions = [];
  const positionPattern =
    /\b\d+\s+HW-\d+\s+([A-Za-zÄÖÜäöüß\s-]+?)\s+([\d.,]+)\s+(kg|g)\s+([\d.]+,\d{2})/gi;

  for (const match of normalized.matchAll(positionPattern)) {
    positions.push({
      invoiceNumber,
      invoiceDate,
      metal: match[1].trim(),
      normalizedMetal: normalizeMetalName(match[1]),
      quantity: parseGermanNumber(match[2]),
      unit: match[3],
      costValue: parseGermanNumber(match[4]),
    });
  }

  return { invoiceNumber, invoiceDate, endsumme, positions };
}

async function importIntergold(canUpload) {
  const invoiceRoot = path.join(depotRoot, "Intergold/Einlagerungsbestaetigungen");
  const invoicePaths = await listFiles(invoiceRoot, (file) => /^SR-.*\.pdf$/i.test(path.basename(file)));
  const prices = (await fetchIntergoldPrices()).filter((price) => price.status === "OK");
  const priceByMetal = new Map(prices.map((price) => [price.metal.toLowerCase(), price]));
  const holdingsByMetal = new Map();
  const imports = [];
  let invoiceTotal = 0;

  for (const filePath of invoicePaths) {
    const { importId, rawStoragePath, storageStatus } = await processSourceFile({
      filePath,
      source: "intergold",
      parser: "intergold_invoice_v1",
      canUpload,
    });
    imports.push({ importId, rawStoragePath, storageStatus, filePath });
    const invoice = parseIntergoldInvoice(await extractPdfText(filePath));
    invoiceTotal += invoice.endsumme ?? 0;

    for (const position of invoice.positions) {
      const key = position.normalizedMetal.toLowerCase();
      const existing = holdingsByMetal.get(key) ?? {
        metal: position.normalizedMetal,
        originalMetals: new Set(),
        quantity: 0,
        unit: position.unit,
        costValue: 0,
      };
      existing.originalMetals.add(position.metal);
      existing.quantity += position.quantity ?? 0;
      existing.costValue += position.costValue ?? 0;
      holdingsByMetal.set(key, existing);
    }
  }

  const holdings = [...holdingsByMetal.values()].map((holding) => {
    const price = priceByMetal.get(holding.metal.toLowerCase());
    const currentValueBuy =
      price && convertMetalValue(holding.quantity, holding.unit, price.buyEur, price.unit);
    const currentValueSale =
      price && convertMetalValue(holding.quantity, holding.unit, price.saleEur, price.unit);
    return {
      metal: holding.metal,
      originalMetals: [...holding.originalMetals],
      quantity: holding.quantity,
      unit: holding.unit,
      costValue: holding.costValue,
      priceUnit: price?.unit ?? null,
      buyEur: price?.buyEur ?? null,
      saleEur: price?.saleEur ?? null,
      priceDate: price?.priceDate ?? null,
      currentValueBuy,
      currentValueSale,
      status: currentValueBuy == null || currentValueSale == null ? "UNVOLLSTAENDIG" : "VERIFIED",
    };
  });

  const currentValue = sum(holdings.map((holding) => holding.currentValueBuy));
  const saleValue = sum(holdings.map((holding) => holding.currentValueSale));
  const missingPrices = holdings.filter((holding) => holding.status !== "VERIFIED").map((h) => h.metal);

  const batch = db.batch();
  holdings.forEach((holding) => {
    batch.set(db.collection("intergoldHoldings").doc(holding.metal.toLowerCase()), {
      ...holding,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  prices.forEach((price) => {
    batch.set(db.collection("intergoldPrices").doc(price.metal.toLowerCase()), {
      ...price,
      sourceUrl: INTERGOLD_PRICE_URL,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();

  await replaceSourcePositions(
    "intergold",
    holdings.map((holding) => ({
      id: `intergold_${compactDocId(holding.metal.toLowerCase())}`,
      source: "intergold",
      name: holding.metal,
      category: "Metall",
      quantityText: `${holding.quantity.toLocaleString("de-AT")} ${holding.unit}`,
      currentValue: holding.currentValueBuy,
      saleValue: holding.currentValueSale,
      costValue: holding.costValue,
      performanceValue:
        holding.currentValueBuy != null && holding.costValue != null
          ? holding.currentValueBuy - holding.costValue
          : null,
      performancePct:
        holding.currentValueBuy != null && holding.costValue
          ? (holding.currentValueBuy - holding.costValue) / holding.costValue
          : null,
      quoteText:
        holding.buyEur != null && holding.priceUnit
          ? `Ankauf ${holding.buyEur.toLocaleString("de-AT")} EUR/${holding.priceUnit}`
          : null,
      valuationDate: holding.priceDate,
      valuationMethod: "Intergold Ankaufspreis",
      sourceUrl: INTERGOLD_PRICE_URL,
    })),
  );

  await db.collection("sourceSummaries").doc("intergold").set(
    {
      source: "intergold",
      displayName: "Intergold",
      currentValue,
      saleValue,
      costValue: invoiceTotal,
      performanceValue: currentValue - invoiceTotal,
      performancePct: invoiceTotal ? (currentValue - invoiceTotal) / invoiceTotal : null,
      valuationMethod: "Intergold Ankaufspreise",
      valuationDate: new Date().toISOString(),
      sourceDocument: invoicePaths.join("\n"),
      sourceUrl: INTERGOLD_PRICE_URL,
      importId: runId,
      storageStatus: imports.every((entry) => entry.storageStatus === "UPLOADED")
        ? "UPLOADED"
        : "SKIPPED_BUCKET_UNAVAILABLE",
      positionCount: holdings.length,
      missingPrices,
      status: missingPrices.length ? "PARTIAL" : "VERIFIED",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return { source: "intergold", currentValue, saleValue, positionCount: holdings.length, missingPrices };
}

async function main() {
  const canUpload = await storageAvailable();
  if (!canUpload) {
    console.warn("[warn] Firebase Storage bucket unavailable; originals stay in Drive only.");
  }

  const results = [];
  results.push(await importFlatex(canUpload));
  results.push(await importTradeRepublic(canUpload));
  results.push(await importGinmon(canUpload));
  results.push(await importIntergold(canUpload));

  const total = sum(results.map((result) => result.currentValue));
  await db.collection("portfolioSnapshots").doc(runId).set({
    runId,
    totalValue: total,
    sources: results,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(JSON.stringify({ runId, total, results }, null, 2));
}

await main();
