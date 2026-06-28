import type { PortfolioPosition } from "./types";

export type NormalizedAssetClass =
  | "stock"
  | "etf"
  | "fund"
  | "cash"
  | "crypto"
  | "metal"
  | "pension"
  | "cfd"
  | "bank"
  | "credit_card"
  | "private_equity"
  | "other";

export interface NormalizedAssetClassInfo {
  assetClass: NormalizedAssetClass;
  label: string;
  confidence: "high" | "medium" | "low";
  source: "stored" | "source" | "category" | "name" | "fallback";
}

const assetClassLabels: Record<NormalizedAssetClass, string> = {
  stock: "Aktie",
  etf: "ETFs",
  fund: "Fonds",
  cash: "Cash",
  crypto: "Krypto",
  metal: "Metalle",
  pension: "Vorsorge",
  cfd: "CFD",
  bank: "Bankkonto",
  credit_card: "Kreditkarte",
  private_equity: "Private Equity",
  other: "Sonstiges",
};

const storedAssetClassMap: Record<string, NormalizedAssetClass> = {
  stock: "stock",
  stocks: "stock",
  aktie: "stock",
  aktien: "stock",
  equity: "stock",
  equities: "stock",
  etf: "etf",
  etfs: "etf",
  fund: "fund",
  funds: "fund",
  fonds: "fund",
  investmentfonds: "fund",
  cash: "cash",
  crypto: "crypto",
  kryptowaehrung: "crypto",
  kryptowahrung: "crypto",
  metal: "metal",
  metall: "metal",
  metals: "metal",
  pension: "pension",
  vorsorge: "pension",
  cfd: "cfd",
  bank: "bank",
  bankkonto: "bank",
  credit_card: "credit_card",
  kreditkarte: "credit_card",
  private_equity: "private_equity",
  privateequity: "private_equity",
};

function normalizeText(value?: string | null) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function fromStoredAssetClass(value?: string | null): NormalizedAssetClass | null {
  const normalized = normalizeText(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!normalized) return null;
  return storedAssetClassMap[normalized] ?? null;
}

function info(
  assetClass: NormalizedAssetClass,
  confidence: NormalizedAssetClassInfo["confidence"],
  source: NormalizedAssetClassInfo["source"],
): NormalizedAssetClassInfo {
  return {
    assetClass,
    label: assetClassLabels[assetClass],
    confidence,
    source,
  };
}

export function normalizePositionAssetClass(position: PortfolioPosition): NormalizedAssetClassInfo {
  const stored = fromStoredAssetClass(position.assetClass ?? position.assetClassLabel);
  if (stored) return info(stored, position.assetClassConfidence === "low" ? "low" : "high", "stored");

  const source = normalizeText(position.source);
  const category = normalizeText(position.category);
  const name = normalizeText(position.name);
  const combined = `${source} ${category} ${name} ${normalizeText(position.valuationMethod)}`;

  if (
    category.includes("cash") ||
    name.includes("geldkonto") ||
    name.includes("cashkonto") ||
    name.includes("barwert") ||
    name === "eur" ||
    name === "usdt" ||
    name.includes("kontostand")
  ) {
    return info("cash", "high", "category");
  }
  if (source === "equateplus") return info("stock", "high", "source");
  if (source === "intergold" || category.includes("metall")) return info("metal", "high", "source");
  if (source === "bitget" || combined.includes("crypto")) return info("crypto", "high", "source");
  if (source === "vbv") return info("pension", "high", "source");
  if (source === "capitalcom" || combined.includes("cfd")) return info("cfd", "high", "source");
  if (category.includes("credit_card")) return info("credit_card", "high", "category");
  if (source === "bank_accounts") return info("bank", "medium", "source");
  if (combined.includes("private market") || combined.includes("private equity")) {
    return info("private_equity", "high", "category");
  }
  if (
    combined.includes(" etf") ||
    combined.includes(" ucits") ||
    combined.includes("ishares") ||
    combined.includes("xtrackers") ||
    combined.includes("vanguard") ||
    combined.includes("amundi") ||
    combined.includes("spdr") ||
    combined.includes("invesco") ||
    combined.includes("wisdomtree") ||
    combined.includes("msci") ||
    combined.includes("s&p") ||
    combined.includes("nasdaq")
  ) {
    return info("etf", "medium", "name");
  }
  if (category.includes("fund") || category.includes("fonds") || category.includes("investmentfonds")) {
    return info("fund", "medium", "category");
  }
  if (category.includes("stock") || category.includes("aktie") || category.includes("wertpapier")) {
    return info("stock", "low", "category");
  }

  return info("other", "low", "fallback");
}
