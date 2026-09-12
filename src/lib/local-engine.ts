import type { TaskClass } from "./router";

export type LocalEngineStatus =
  | "checking"
  | "unavailable"
  | "ready"
  | "running"
  | "error";

export class LocalModelUnavailableError extends Error {
  constructor(message = "The on-device language model is not ready.") {
    super(message);
    this.name = "LocalModelUnavailableError";
  }
}

export async function getLocalEngineStatus(
  fetcher: typeof fetch = fetch,
): Promise<LocalEngineStatus> {
  try {
    const response = await fetcher("/api/local", {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return "unavailable";
    const body = (await response.json()) as { ready?: boolean };
    return body.ready ? "ready" : "unavailable";
  } catch {
    return "unavailable";
  }
}

export async function prepareLocalModel(
  options: {
    fetcher?: typeof fetch;
  } = {},
): Promise<LocalEngineStatus> {
  return getLocalEngineStatus(options.fetcher ?? fetch);
}

export async function runLocalModel(
  taskClass: TaskClass,
  prompt: string,
  context: string,
  options: {
    fetcher?: typeof fetch;
    signal?: AbortSignal;
    onText?: (text: string) => void;
    onStatus?: (status: LocalEngineStatus) => void;
  } = {},
): Promise<{ answer: string; engine: "foundry-local"; model: string; firstTokenMs: number }> {
  const fetcher = options.fetcher ?? fetch;
  const started = performance.now();

  try {
    options.onStatus?.("running");
    const response = await fetcher("/api/local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskClass, prompt, context }),
      signal: options.signal ?? AbortSignal.timeout(22_000),
    });
    const body = (await response.json()) as { answer?: string; model?: string; error?: string };
    if (!response.ok || !body.answer?.trim()) {
      throw new LocalModelUnavailableError(body.error ?? "Foundry Local returned no answer.");
    }
    const elapsed = Math.round(performance.now() - started);
    options.onText?.(body.answer);
    return {
      answer: body.answer,
      engine: "foundry-local",
      model: body.model ?? "qwen2.5-0.5b",
      firstTokenMs: elapsed,
    };
  } finally {
    options.onStatus?.("ready");
  }
}