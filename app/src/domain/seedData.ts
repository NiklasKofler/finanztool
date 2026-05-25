import type { PipelineStep, SourceOverview, UpdateScheduleItem } from "./types";

export const sourceOverviews: SourceOverview[] = [
  {
    id: "flatex",
    name: "Flatex",
    kind: "broker",
    purpose: "Aktien, ETFs, Cash, Depotentwicklung",
    status: "ready",
    currentValue: 17266.88,
    importMethod: "CSV-Exporte plus Broker-Snapshot",
    nextStep: "Parser für Konto- und Depotumsätze bauen",
  },
  {
    id: "trade-republic",
    name: "Trade Republic",
    kind: "broker",
    purpose: "Aktien, ETFs, Cash, Zinsen",
    status: "manual",
    currentValue: 2174.99,
    importMethod: "E-Mail-Anhänge vom iPhone",
    nextStep: "Mail-Ablage und Dateibenennung automatisieren",
  },
  {
    id: "ginmon",
    name: "Ginmon",
    kind: "robo",
    purpose: "Robo-Advisor, Global 8 / AP18",
    status: "automated",
    currentValue: 9227.24,
    importMethod: "Dokumente aus Portal",
    nextStep: "Asset Status, Kontoauszüge und Kosten extrahieren",
  },
  {
    id: "intergold",
    name: "Intergold",
    kind: "metals",
    purpose: "Edelmetalle und Technologiemetalle",
    status: "automated",
    importMethod: "Preis-Webseite plus E-Mail-Belege",
    nextStep: "Preisimport und Belegimport getrennt implementieren",
  },
  {
    id: "bitget",
    name: "Bitget",
    kind: "crypto",
    purpose: "BTC und spätere Krypto-Positionen",
    status: "planned",
    importMethod: "Read-only API",
    nextStep: "API-Key später nur lesend hinterlegen",
  },
];

export const importPipeline: PipelineStep[] = [
  {
    order: "01",
    title: "Original sichern",
    description: "PDFs und CSVs bleiben unverändert im Archiv und werden per Hash eindeutig erkannt.",
  },
  {
    order: "02",
    title: "Staging lesen",
    description: "Parser schreiben Rohdaten in Zwischenmodelle, bevor etwas den Bestand verändert.",
  },
  {
    order: "03",
    title: "Validieren",
    description: "Summen, Währungen, ISINs, Zeiträume und Duplikate werden vor dem Commit geprüft.",
  },
  {
    order: "04",
    title: "Firestore schreiben",
    description: "Nur geprüfte Änderungen landen in Transaktionen, Beständen und Snapshots.",
  },
  {
    order: "05",
    title: "Abgleichen",
    description: "App-Werte werden gegen Broker-Snapshots verglichen, damit Updates nicht schief laufen.",
  },
];

export const updateSchedule: UpdateScheduleItem[] = [
  {
    source: "Flatex",
    cadence: "Initial quartalsweise, danach täglich oder bei Aktivität Export anstoßen.",
    needsAttention: false,
  },
  {
    source: "Trade Republic",
    cadence: "Transaction export wöchentlich, Account statement monatlich, Net Worth bei Bedarf.",
    needsAttention: true,
  },
  {
    source: "Ginmon",
    cadence: "Monatlich Dokumente laden, Kosten und Status im Bestand nachziehen.",
    needsAttention: false,
  },
  {
    source: "Intergold",
    cadence: "Preise täglich, Einlagerungs- und Verkaufsbestätigungen sofort aus Mail importieren.",
    needsAttention: false,
  },
];
