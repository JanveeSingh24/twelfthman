import type { TaskClass } from "./router";

export const CLOUD_ENVELOPE_VERSION = 2 as const;
export const MAX_CLOUD_INSTRUCTION_LENGTH = 500;
export const MAX_CLOUD_EVIDENCE_LENGTH = 1200;

const TASK_CLASSES: TaskClass[] = ["summarize", "rewrite", "extract", "table", "draft", "reason"];
const ENVELOPE_KEYS = new Set([
  "version",
  "requestId",
  "taskClass",
  "instruction",
  "evidence",
  "sourceTokensEstimate",
  "evidenceTokensEstimate",
  "redaction",
  "consent",
]);

export type CloudEnvelope = {
  version: typeof CLOUD_ENVELOPE_VERSION;
  requestId: string;
  taskClass: TaskClass;
  instruction: string;
  evidence: string;
  sourceTokensEstimate: number;
  evidenceTokensEstimate: number;
  redaction: {
    categories: string[];
    matchCount: number;
  };
  consent: {
    approved: true;
    approvedAt: string;
    contentHash: string;
  };
};

export type CloudEnvelopeDraft = Omit<CloudEnvelope, "consent">;

export type CloudEnvelopeParseResult =
  | { ok: true; value: CloudEnvelope }
  | { ok: false; error: string };

export type CloudEnvelopeDraftParseResult =
  | { ok: true; value: CloudEnvelopeDraft }
  | { ok: false; error: string };

const TASK_INSTRUCTIONS: Record<TaskClass, string> = {
  summarize: "Summarize the supplied evidence into concise key points and next actions.",
  rewrite: "Rewrite the supplied evidence clearly and concisely without adding facts.",
  extract: "Extract the requested facts from the supplied evidence without adding facts.",
  table: "Convert the supplied evidence into a compact table without adding facts.",
  draft: "Draft a concise response grounded only in the supplied evidence.",
  reason: "Analyze the supplied evidence, compare trade-offs, and state uncertainty explicitly.",
};

export function createCloudEnvelopeDraft({
  requestId = crypto.randomUUID(),
  taskClass,
  instruction,
  evidence,
  sourceTokensEstimate,
  evidenceTokensEstimate,
  categories,
  matchCount,
}: {
  requestId?: string;
  taskClass: TaskClass;
  instruction?: string;
  evidence: string;
  sourceTokensEstimate: number;
  evidenceTokensEstimate: number;
  categories: string[];
  matchCount: number;
}): CloudEnvelopeDraft {
  return {
    version: CLOUD_ENVELOPE_VERSION,
    requestId,
    taskClass,
    instruction: instruction?.trim() || TASK_INSTRUCTIONS[taskClass],
    evidence,
    sourceTokensEstimate,
    evidenceTokensEstimate,
    redaction: { categories, matchCount },
  };
}

export async function hashCloudEnvelopeDraft(draft: CloudEnvelopeDraft): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(draft));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function approveCloudEnvelope(draft: CloudEnvelopeDraft, approvedAt: string): Promise<CloudEnvelope> {
  return {
    ...draft,
    consent: {
      approved: true,
      approvedAt,
      contentHash: await hashCloudEnvelopeDraft(draft),
    },
  };
}

export async function createCloudEnvelope({
  approvedAt,
  ...draftInput
}: Parameters<typeof createCloudEnvelopeDraft>[0] & { approvedAt: string }): Promise<CloudEnvelope> {
  return approveCloudEnvelope(createCloudEnvelopeDraft(draftInput), approvedAt);
}

export function parseCloudEnvelopeDraft(input: unknown): CloudEnvelopeDraftParseResult {
  if (!isRecord(input)) return { ok: false, error: "Cloud envelope draft must be an object." };
  if ("consent" in input) return { ok: false, error: "Queued cloud envelope must not contain send consent." };
  const parsed = parseCloudEnvelope({
    ...input,
    consent: { approved: true, approvedAt: "2000-01-01T00:00:00.000Z", contentHash: "0".repeat(64) },
  });
  if (!parsed.ok) return parsed;
  return { ok: true, value: draftFromEnvelope(parsed.value) };
}

function draftFromEnvelope(envelope: CloudEnvelope): CloudEnvelopeDraft {
  return {
    version: envelope.version,
    requestId: envelope.requestId,
    taskClass: envelope.taskClass,
    instruction: envelope.instruction,
    evidence: envelope.evidence,
    sourceTokensEstimate: envelope.sourceTokensEstimate,
    evidenceTokensEstimate: envelope.evidenceTokensEstimate,
    redaction: envelope.redaction,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

export function parseCloudEnvelope(input: unknown): CloudEnvelopeParseResult {
  if (!isRecord(input)) return { ok: false, error: "Cloud envelope must be an object." };

  const unknownKey = Object.keys(input).find((key) => !ENVELOPE_KEYS.has(key));
  if (unknownKey) return { ok: false, error: `Unexpected cloud envelope field: ${unknownKey}.` };
  if (input.version !== CLOUD_ENVELOPE_VERSION) return { ok: false, error: "Unsupported cloud envelope version." };
  if (typeof input.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) {
    return { ok: false, error: "Cloud request ID must be a UUID." };
  }
  if (!TASK_CLASSES.includes(input.taskClass as TaskClass)) return { ok: false, error: "Invalid task class." };
  if (typeof input.instruction !== "string" || !input.instruction.trim() || input.instruction.length > MAX_CLOUD_INSTRUCTION_LENGTH) {
    return { ok: false, error: "Sanitized instruction is required and exceeds no more than 500 characters." };
  }
  if (typeof input.evidence !== "string" || !input.evidence.trim() || input.evidence.length > MAX_CLOUD_EVIDENCE_LENGTH) {
    return { ok: false, error: "Sanitized evidence is required and exceeds no more than 1200 characters." };
  }
  if (!isNonNegativeInteger(input.sourceTokensEstimate) || !isNonNegativeInteger(input.evidenceTokensEstimate)) {
    return { ok: false, error: "Token estimates must be non-negative integers." };
  }
  if (!isRecord(input.redaction) || !Array.isArray(input.redaction.categories) || !input.redaction.categories.every((value) => typeof value === "string")) {
    return { ok: false, error: "Redaction categories must be a string array." };
  }
  if (!isNonNegativeInteger(input.redaction.matchCount)) return { ok: false, error: "Redaction match count must be a non-negative integer." };
  if (!isRecord(input.consent) || input.consent.approved !== true || typeof input.consent.approvedAt !== "string") {
    return { ok: false, error: "Explicit cloud consent is required." };
  }
  if (Number.isNaN(Date.parse(input.consent.approvedAt))) return { ok: false, error: "Cloud consent timestamp is invalid." };
  if (typeof input.consent.contentHash !== "string" || !/^[a-f0-9]{64}$/.test(input.consent.contentHash)) {
    return { ok: false, error: "Cloud consent content hash is invalid." };
  }

  return { ok: true, value: input as CloudEnvelope };
}

export async function validateCloudEnvelopeConsent(
  envelope: CloudEnvelope,
  now = Date.now(),
  maxAgeMs = 10 * 60 * 1000,
): Promise<CloudEnvelopeParseResult> {
  const approvedAt = Date.parse(envelope.consent.approvedAt);
  if (approvedAt > now + 30_000 || now - approvedAt > maxAgeMs) {
    return { ok: false, error: "Cloud consent has expired or is dated in the future." };
  }
  const draft = draftFromEnvelope(envelope);
  if (await hashCloudEnvelopeDraft(draft) !== envelope.consent.contentHash) {
    return { ok: false, error: "Cloud envelope changed after approval." };
  }
  return { ok: true, value: envelope };
}