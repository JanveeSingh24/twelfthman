import { parseCloudEnvelopeDraft, type CloudEnvelopeDraft } from "./cloud-envelope.ts";

export const CLOUD_QUEUE_KEY = "twelfthman-cloud-queue-v1";
const CLOUD_QUEUE_EVENT = "twelfthman-cloud-queue-change";
const EMPTY_CLOUD_QUEUE: QueuedCloudEnvelope[] = [];
let cachedQueueRaw: string | null | undefined;
let cachedQueue: QueuedCloudEnvelope[] = EMPTY_CLOUD_QUEUE;

export type QueuedCloudEnvelope = {
  id: string;
  createdAt: string;
  status: "pending-connectivity" | "ready-for-review" | "reviewing";
  envelope: CloudEnvelopeDraft;
  localSuitability: number;
  sensitiveOverride: boolean;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function isQueuedCloudEnvelope(value: unknown): value is QueuedCloudEnvelope {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Partial<QueuedCloudEnvelope>;
  if (typeof candidate.id !== "string" || typeof candidate.createdAt !== "string") return false;
  if (candidate.status !== "pending-connectivity" && candidate.status !== "ready-for-review" && candidate.status !== "reviewing") return false;
  if (typeof candidate.localSuitability !== "number" || candidate.localSuitability < 0 || candidate.localSuitability > 1) return false;
  if (typeof candidate.sensitiveOverride !== "boolean") return false;
  return parseCloudEnvelopeDraft(candidate.envelope).ok;
}

export function readCloudQueue(storage: StorageLike = localStorage): QueuedCloudEnvelope[] {
  const raw = storage.getItem(CLOUD_QUEUE_KEY);
  const browserStorage = typeof localStorage !== "undefined" && storage === localStorage;
  if (browserStorage && raw === cachedQueueRaw) return cachedQueue;
  if (!raw) {
    if (browserStorage) {
      cachedQueueRaw = raw;
      cachedQueue = EMPTY_CLOUD_QUEUE;
    }
    return EMPTY_CLOUD_QUEUE;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    const queue = Array.isArray(parsed)
      ? parsed.filter(isQueuedCloudEnvelope).map((item) => item.status === "reviewing"
        ? { ...item, status: "ready-for-review" as const }
        : item)
      : [];
    if (browserStorage) {
      cachedQueueRaw = raw;
      cachedQueue = queue;
    }
    return queue;
  } catch {
    if (browserStorage) {
      cachedQueueRaw = raw;
      cachedQueue = EMPTY_CLOUD_QUEUE;
    }
    return EMPTY_CLOUD_QUEUE;
  }
}

export function writeCloudQueue(queue: QueuedCloudEnvelope[], storage: StorageLike = localStorage): void {
  const raw = JSON.stringify(queue);
  storage.setItem(CLOUD_QUEUE_KEY, raw);
  if (typeof localStorage !== "undefined" && storage === localStorage) {
    cachedQueueRaw = raw;
    cachedQueue = queue;
    window.dispatchEvent(new Event(CLOUD_QUEUE_EVENT));
  }
}

export function subscribeCloudQueue(onStoreChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === CLOUD_QUEUE_KEY) onStoreChange();
  };
  window.addEventListener(CLOUD_QUEUE_EVENT, onStoreChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(CLOUD_QUEUE_EVENT, onStoreChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export function emptyCloudQueueSnapshot(): QueuedCloudEnvelope[] {
  return EMPTY_CLOUD_QUEUE;
}

export function enqueueCloudEnvelope(
  queue: QueuedCloudEnvelope[],
  envelope: CloudEnvelopeDraft,
  id: string,
  createdAt: string,
  localSuitability: number,
  sensitiveOverride: boolean,
): QueuedCloudEnvelope[] {
  const entry: QueuedCloudEnvelope = {
    id,
    createdAt,
    status: "pending-connectivity",
    envelope,
    localSuitability,
    sensitiveOverride,
  };
  return [entry, ...queue].slice(0, 10);
}

export function markCloudQueueReady(queue: QueuedCloudEnvelope[]): QueuedCloudEnvelope[] {
  return queue.map((item) => item.status === "pending-connectivity"
    ? { ...item, status: "ready-for-review" as const }
    : item);
}

export function removeCloudQueueItem(queue: QueuedCloudEnvelope[], id: string): QueuedCloudEnvelope[] {
  return queue.filter((item) => item.id !== id);
}

export function markCloudQueueReviewing(queue: QueuedCloudEnvelope[], id: string): QueuedCloudEnvelope[] {
  return queue.map((item) => {
    if (item.id === id && item.status === "ready-for-review") {
      return { ...item, status: "reviewing" as const };
    }
    if (item.id !== id && item.status === "reviewing") {
      return { ...item, status: "ready-for-review" as const };
    }
    return item;
  });
}

export function markCloudQueueReadyForReview(queue: QueuedCloudEnvelope[], id: string): QueuedCloudEnvelope[] {
  return queue.map((item) => item.id === id
    ? { ...item, status: "ready-for-review" as const }
    : item);
}