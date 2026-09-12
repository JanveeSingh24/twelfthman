import { DefaultAzureCredential } from "@azure/identity";
import type { TokenCredential } from "@azure/core-auth";

import type { CloudEnvelope } from "./cloud-envelope.ts";

const AZURE_AI_SCOPE = "https://ai.azure.com/.default";
const credentials = new Map<string, TokenCredential>();

export type CloudErrorKind =
  | "not-configured"
  | "content-filter"
  | "authentication"
  | "capacity"
  | "timeout"
  | "provider";

export class CloudClientError extends Error {
  readonly kind: CloudErrorKind;
  readonly publicStatus: number;

  constructor(
    kind: CloudErrorKind,
    publicStatus: number,
    message: string,
  ) {
    super(message);
    this.name = "CloudClientError";
    this.kind = kind;
    this.publicStatus = publicStatus;
  }
}

export type CloudResponse = {
  answer: string;
  mode: "azure-openai-responses";
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

type AzureResponsesConfig = {
  endpoint: string;
  apiKey?: string;
  deployment: string;
  tenantId?: string;
};

type AzureErrorBody = {
  error?: { code?: string; message?: string };
};

type AzureResponseBody = {
  output_text?: string;
  model?: string;
  content_filters?: Array<{ blocked?: boolean }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
};

export function hasAzureResponsesConfig(
  environment: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(
    environment.AZURE_OPENAI_ENDPOINT
    && environment.AZURE_OPENAI_DEPLOYMENT,
  );
}

function readConfig(): AzureResponsesConfig {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const tenantId = process.env.AZURE_TENANT_ID;

  if (!hasAzureResponsesConfig() || !endpoint || !deployment) {
    throw new CloudClientError(
      "not-configured",
      503,
      "Cloud endpoint and deployment are not configured on this device.",
    );
  }

  return { endpoint, apiKey: apiKey || undefined, deployment, tenantId };
}

function responsesUrl(endpoint: string): string {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new CloudClientError("not-configured", 503, "Azure endpoint is not a valid URL.");
  }
  const hostname = url.hostname.toLowerCase();
  const allowedHost = hostname.endsWith(".openai.azure.com") || hostname.endsWith(".services.ai.azure.com");
  if (url.protocol !== "https:" || !allowedHost || url.username || url.password || url.search || url.hash) {
    throw new CloudClientError("not-configured", 503, "Azure endpoint must be an approved HTTPS Azure AI host without credentials or query parameters.");
  }

  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith("/responses")
    ? path
    : path.endsWith("/openai/v1")
      ? `${path}/responses`
      : `${path}/openai/v1/responses`;
  return url.toString();
}

async function authenticationHeaders(
  config: AzureResponsesConfig,
  credential?: TokenCredential,
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  if (config.apiKey) return { "api-key": config.apiKey };

  try {
    const credentialKey = config.tenantId ?? "default";
    let tokenCredential = credential ?? credentials.get(credentialKey);
    if (!tokenCredential) {
      tokenCredential = new DefaultAzureCredential({ tenantId: config.tenantId, processTimeoutInMs: 10_000 });
      credentials.set(credentialKey, tokenCredential);
    }
    const accessToken = await tokenCredential.getToken(AZURE_AI_SCOPE, { abortSignal: signal });
    if (!accessToken) throw new Error("No access token returned.");
    return { Authorization: `Bearer ${accessToken.token}` };
  } catch {
    if (signal?.aborted) throw new CloudClientError("timeout", 504, "Cloud request timed out before completion.");
    throw new CloudClientError(
      "authentication",
      502,
      "Microsoft Entra authentication failed. Sign in to the deployment tenant and verify your Foundry role.",
    );
  }
}

async function errorFromResponse(response: Response, authMode: "api-key" | "entra"): Promise<CloudClientError> {
  let code = "";
  try {
    const body = (await response.json()) as AzureErrorBody;
    code = body.error?.code ?? "";
  } catch {
    // The public error stays generic when the provider body is not JSON.
  }

  if (response.status === 400 && code === "content_filter") {
    return new CloudClientError("content-filter", 400, "Azure guardrails blocked the sanitized request.");
  }
  if (response.status === 401 || response.status === 403) {
    return new CloudClientError(
      "authentication",
      502,
      authMode === "entra"
        ? "Cloud access was denied. Assign the signed-in principal the Foundry User role at the project or account scope."
        : "Cloud API-key authentication was denied. Verify the key belongs to the configured Azure AI resource.",
    );
  }
  if (response.status === 429) {
    return new CloudClientError("capacity", 429, "Cloud capacity is busy. The sanitized request was not completed.");
  }

  return new CloudClientError("provider", 502, "The configured cloud specialist was unavailable.");
}

export async function callAzureResponses(
  envelope: CloudEnvelope,
  options: {
    fetcher?: typeof fetch;
    config?: AzureResponsesConfig;
    credential?: TokenCredential;
    timeoutMs?: number;
  } = {},
): Promise<CloudResponse> {
  const config = options.config ?? readConfig();
  const fetcher = options.fetcher ?? fetch;
  const url = responsesUrl(config.endpoint);
  const authMode = config.apiKey ? "api-key" : "entra";
  const signal = AbortSignal.timeout(options.timeoutMs ?? 15_000);
  const authHeaders = await authenticationHeaders(config, options.credential, signal);

  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({
        model: config.deployment,
        store: false,
        max_output_tokens: 450,
        instructions: "Answer only from the sanitized evidence. Do not infer redacted identities. State uncertainty explicitly.",
        input: `Instruction: ${envelope.instruction}\n\nSanitized evidence:\n${envelope.evidence}`,
      }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new CloudClientError("timeout", 504, "Cloud request timed out before completion.");
    }
    throw new CloudClientError("provider", 503, "Cloud lane is unreachable. Nothing was completed.");
  }

  if (!response.ok) throw await errorFromResponse(response, authMode);

  const body = (await response.json()) as AzureResponseBody;
  if (body.content_filters?.some((result) => result.blocked === true)) {
    throw new CloudClientError("content-filter", 400, "Azure guardrails blocked the sanitized request or response.");
  }
  if (!body.output_text?.trim()) {
    throw new CloudClientError("provider", 502, "Cloud specialist returned no answer.");
  }
  const inputTokens = body.usage?.input_tokens;
  const outputTokens = body.usage?.output_tokens;
  const totalTokens = body.usage?.total_tokens;
  if (typeof inputTokens !== "number" || !Number.isInteger(inputTokens)
    || typeof outputTokens !== "number" || !Number.isInteger(outputTokens)
    || typeof totalTokens !== "number" || !Number.isInteger(totalTokens)) {
    throw new CloudClientError("provider", 502, "Cloud specialist returned no usage accounting.");
  }

  return {
    answer: body.output_text,
    mode: "azure-openai-responses",
    model: body.model ?? config.deployment,
    usage: {
      inputTokens,
      outputTokens,
      totalTokens,
    },
  };
}