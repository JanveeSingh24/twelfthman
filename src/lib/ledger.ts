import type { Route, TaskClass } from "./router";

export type LedgerEntry = {
  id: string;
  createdAt: string;
  taskClass: TaskClass;
  route: Route;
  engine: string;
  localSuitability: number;
  inputTokens: number;
  sentTokens: number;
  latencyMs: number;
  sensitiveOverride: boolean;
};

export const LEDGER_KEY = "twelfthman-ledger-v1";
const LEDGER_EVENT = "twelfthman-ledger-change";
const EMPTY_LEDGER: LedgerEntry[] = [];
let cachedLedgerRaw: string | null | undefined;
let cachedLedger: LedgerEntry[] = EMPTY_LEDGER;

export function readLedger(): LedgerEntry[] {
  const raw = localStorage.getItem(LEDGER_KEY);
  if (raw === cachedLedgerRaw) return cachedLedger;
  if (!raw) {
    cachedLedgerRaw = raw;
    cachedLedger = EMPTY_LEDGER;
    return cachedLedger;
  }

  try {
    const entries = JSON.parse(raw) as Array<LedgerEntry & { confidence?: number }>;
    cachedLedgerRaw = raw;
    cachedLedger = entries.map((entry) => ({
      ...entry,
      localSuitability: entry.localSuitability ?? entry.confidence ?? 0,
      sensitiveOverride: entry.sensitiveOverride ?? false,
    }));
    return cachedLedger;
  } catch {
    cachedLedgerRaw = raw;
    cachedLedger = EMPTY_LEDGER;
    return cachedLedger;
  }
}

export function writeLedger(entries: LedgerEntry[]): void {
  const raw = JSON.stringify(entries);
  localStorage.setItem(LEDGER_KEY, raw);
  cachedLedgerRaw = raw;
  cachedLedger = entries;
  window.dispatchEvent(new Event(LEDGER_EVENT));
}

export function clearLedger(): void {
  localStorage.removeItem(LEDGER_KEY);
  cachedLedgerRaw = null;
  cachedLedger = EMPTY_LEDGER;
  window.dispatchEvent(new Event(LEDGER_EVENT));
}

export function subscribeLedger(onStoreChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === LEDGER_KEY) onStoreChange();
  };
  window.addEventListener(LEDGER_EVENT, onStoreChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(LEDGER_EVENT, onStoreChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export function emptyLedgerSnapshot(): LedgerEntry[] {
  return EMPTY_LEDGER;
}

export function summarizeLedger(entries: LedgerEntry[]) {
  const total = entries.length;
  const local = entries.filter((entry) => entry.route === "local").length;
  const rawTokens = entries.reduce((sum, entry) => sum + entry.inputTokens, 0);
  const sentTokens = entries.reduce((sum, entry) => sum + entry.sentTokens, 0);
  const avoidedTokens = Math.max(0, rawTokens - sentTokens);

  return {
    total,
    localShare: total ? Math.round((local / total) * 100) : 0,
    estimatedAvoidedTokens: avoidedTokens,
    actualCloudInputTokens: sentTokens,
    estimatedCompression: rawTokens ? Math.round((rawTokens / Math.max(1, sentTokens)) * 10) / 10 : 0,
  };
}