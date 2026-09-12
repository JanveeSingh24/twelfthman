import type { TaskClass } from "./router.ts";

export const DEFAULT_FOUNDRY_LOCAL_ENDPOINT = "http://127.0.0.1:61111";
export const DEFAULT_FOUNDRY_LOCAL_MODEL = "qwen2.5-0.5b-instruct-openvino-gpu";

export class FoundryLocalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FoundryLocalError";
  }
}

export type FoundryLocalCompletion = {
  answer: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

type FoundryLocalConfig = {
  endpoint: string;
  model: string;
};

function localConfig(): FoundryLocalConfig {
  const endpoint = process.env.FOUNDRY_LOCAL_ENDPOINT ?? DEFAULT_FOUNDRY_LOCAL_ENDPOINT;
  const model = process.env.FOUNDRY_LOCAL_MODEL ?? DEFAULT_FOUNDRY_LOCAL_MODEL;
  const url = new URL(endpoint);
  if (url.protocol !== "http:" || (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")) {
    throw new FoundryLocalError("Foundry Local endpoint must use loopback HTTP.");
  }
  return { endpoint: endpoint.replace(/\/+$/, ""), model };
}

function taskInstruction(taskClass: TaskClass): string {
  const instructions: Record<TaskClass, string> = {
    summarize: "Summarize the context. Follow the requested output format; if none is specified, use at most five concise bullets followed by next actions.",
    rewrite: "Return only the rewritten text. Preserve meaning and do not add facts.",
    extract: "Return only facts present in the context as a concise list.",
    table: "Return a compact Markdown table using only facts in the context.",
    draft: "Return only a concise draft grounded in the context.",
    reason: "Give a concise assessment grounded only in the context and state uncertainty.",
  };
  return instructions[taskClass];
}

export async function getFoundryLocalStatus(
  fetcher: typeof fetch = fetch,
  config: FoundryLocalConfig = localConfig(),
): Promise<{ ready: boolean; model: string }> {
  try {
    const response = await fetcher(`${config.endpoint}/v1/models`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2_500),
    });
    if (!response.ok) return { ready: false, model: config.model };
    const body = (await response.json()) as { data?: Array<{ id?: string }> };
    const loadedModel = body.data?.find((item) =>
      item.id === config.model || item.id?.startsWith(`${config.model}:`))?.id;
    return { ready: Boolean(loadedModel), model: loadedModel ?? config.model };
  } catch {
    return { ready: false, model: config.model };
  }
}

export async function callFoundryLocal(
  taskClass: TaskClass,
  prompt: string,
  context: string,
  options: { fetcher?: typeof fetch; config?: FoundryLocalConfig; timeoutMs?: number } = {},
): Promise<FoundryLocalCompletion> {
  const fetcher = options.fetcher ?? fetch;
  const config = options.config ?? localConfig();
  let response: Response;

  try {
    response = await fetcher(`${config.endpoint}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 350,
        temperature: 0.2,
        messages: [
          { role: "system", content: "You are TwelfthMan's private on-device assistant. Use only supplied context and never invent facts." },
          { role: "user", content: `${taskInstruction(taskClass)}\n\nRequest: ${prompt}\n\nContext:\n${context}` },
        ],
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
    });
  } catch {
    throw new FoundryLocalError("Foundry Local is not reachable on this device.");
  }

  if (!response.ok) throw new FoundryLocalError("Foundry Local could not complete the request.");
  const body = (await response.json()) as {
    model?: string;
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const answer = body.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new FoundryLocalError("Foundry Local returned no answer.");

  return {
    answer,
    model: body.model ?? config.model,
    usage: {
      promptTokens: body.usage?.prompt_tokens ?? 0,
      completionTokens: body.usage?.completion_tokens ?? 0,
      totalTokens: body.usage?.total_tokens ?? 0,
    },
  };
}