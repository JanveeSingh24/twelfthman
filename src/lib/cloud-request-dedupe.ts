const COMPLETED_TTL_MS = 10 * 60 * 1000;
const MAX_TRACKED_REQUESTS = 1_000;
const requests = new Map<string, { state: "in-flight" | "completed" | "unknown"; updatedAt: number }>();

function removeExpired(now: number): void {
  for (const [id, request] of requests) {
    if (request.state !== "in-flight" && now - request.updatedAt > COMPLETED_TTL_MS) requests.delete(id);
  }
  while (requests.size >= MAX_TRACKED_REQUESTS) {
    const oldest = requests.keys().next().value as string | undefined;
    if (!oldest) break;
    requests.delete(oldest);
  }
}

export function reserveCloudRequest(requestId: string, now = Date.now()): boolean {
  removeExpired(now);
  if (requests.has(requestId)) return false;
  requests.set(requestId, { state: "in-flight", updatedAt: now });
  return true;
}

export function completeCloudRequest(requestId: string, now = Date.now()): void {
  requests.set(requestId, { state: "completed", updatedAt: now });
}

export function markCloudRequestUnknown(requestId: string, now = Date.now()): void {
  requests.set(requestId, { state: "unknown", updatedAt: now });
}

export function releaseCloudRequest(requestId: string): void {
  if (requests.get(requestId)?.state === "in-flight") requests.delete(requestId);
}

export function clearCloudRequestDedupeForTests(): void {
  requests.clear();
}