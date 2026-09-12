import { redactTexts, type RedactionCategory } from "./redaction.ts";

export type Sensitivity = "public" | "internal" | "confidential";
export type TaskClass = "summarize" | "rewrite" | "extract" | "table" | "draft" | "reason";
export type Route = "local" | "cloud";
export type RouteRecommendation = "local" | "cloud-review";

export type RouteDecision = {
  route: RouteRecommendation;
  taskClass: TaskClass;
  sensitivity: Sensitivity;
  localSuitability: number;
  requiresSensitiveOverride: boolean;
  reason: string;
  estimatedInputTokens: number;
  evidencePack: string;
  cloudInstruction: string;
  evidenceTokens: number;
  redactionCategories: RedactionCategory[];
  redactionMatchCount: number;
};

const ROUTINE_PATTERNS: Array<[TaskClass, RegExp]> = [
  ["summarize", /\b(summarize|summary|recap|tldr|tl;dr)\b/i],
  ["rewrite", /\b(rewrite|rephrase|polish|tone|shorten)\b/i],
  ["extract", /\b(extract|find|identify|list)\b/i],
  ["table", /\b(table|columns?|rows?|csv)\b/i],
  ["draft", /\b(draft|reply|email|response)\b/i],
];

const COMPLEX_PATTERNS = /\b(analyze|architecture|compare|design|prove|strategy|trade-?offs?|root cause|multi-step)\b/i;
const SENSITIVE_PATTERNS = /\b(confidential|secret|restricted|pii|ssn|passport|patient|customer id|do not share)\b/i;
const TASK_SUITABILITY: Record<TaskClass, number> = {
  summarize: 0.94,
  rewrite: 0.92,
  extract: 0.86,
  table: 0.82,
  draft: 0.78,
  reason: 0.55,
};

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

export function classifyTask(prompt: string): TaskClass {
  return ROUTINE_PATTERNS.find(([, pattern]) => pattern.test(prompt))?.[0] ?? "reason";
}

export function detectSensitivity(prompt: string, selected: Sensitivity): Sensitivity {
  return selected === "public" && SENSITIVE_PATTERNS.test(prompt) ? "confidential" : selected;
}

export function buildEvidencePackDetails(
  prompt: string,
  context: string,
  protectedTerms: string[] = [],
): { evidence: string; instruction: string; categories: RedactionCategory[]; matchCount: number } {
  const sentences = context
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const terms = new Set(
    prompt
      .toLowerCase()
      .match(/[a-z0-9]{4,}/g)
      ?.filter((term) => !["this", "that", "with", "from", "have", "what", "would"].includes(term)) ?? [],
  );
  const ranked = sentences
    .map((sentence, index) => ({
      sentence,
      index,
      score: [...terms].filter((term) => sentence.toLowerCase().includes(term)).length,
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, 3)
    .sort((left, right) => left.index - right.index)
    .map(({ sentence }) => sentence);
  const redaction = redactTexts([prompt, ...ranked], protectedTerms);
  const sanitizedFocus = safelyLimitSanitizedEvidence(redaction.texts[0], 320);
  const sanitizedEvidence = redaction.texts.slice(1).join(" ");
  const evidence = safelyLimitSanitizedEvidence(sanitizedEvidence, 900);

  return {
    evidence,
    instruction: `Requested focus: ${sanitizedFocus}`,
    categories: redaction.categories,
    matchCount: redaction.matchCount,
  };
}

function safelyLimitSanitizedEvidence(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const boundary = text.lastIndexOf(" ", maxLength);
  return boundary > 0
    ? text.slice(0, boundary)
    : "[EVIDENCE OMITTED: first token exceeds outbound limit]";
}

export function buildEvidencePack(prompt: string, context: string): string {
  return buildEvidencePackDetails(prompt, context).evidence;
}

export function routeRequest(
  prompt: string,
  context: string,
  selectedSensitivity: Sensitivity,
  capabilities: { localModelReady?: boolean; maxLocalTokens?: number; protectedTerms?: string[] } = {},
): RouteDecision {
  const sensitivity = detectSensitivity(`${prompt}\n${context}`, selectedSensitivity);
  const taskClass = classifyTask(prompt);
  const estimatedInputTokens = estimateTokens(`${prompt}\n${context}`);
  const localModelReady = capabilities.localModelReady ?? true;
  const maxLocalTokens = capabilities.maxLocalTokens ?? 900;
  const complex = taskClass === "reason" || COMPLEX_PATTERNS.test(prompt);
  const sizePenalty = Math.max(0, estimatedInputTokens - 350) / Math.max(1, maxLocalTokens * 4);
  const localSuitability = localModelReady
    ? Math.max(0, Math.min(0.99, TASK_SUITABILITY[taskClass] - (complex ? 0.12 : 0) - sizePenalty))
    : 0;
  const route: RouteRecommendation = complex || estimatedInputTokens > maxLocalTokens || localSuitability < 0.75
    ? "cloud-review"
    : "local";
  const requiresSensitiveOverride = route === "cloud-review" && sensitivity !== "public";
  const evidence = route === "cloud-review"
    ? buildEvidencePackDetails(prompt, context, capabilities.protectedTerms)
    : { evidence: "", instruction: "", categories: [], matchCount: 0 };

  return {
    route,
    taskClass,
    sensitivity,
    localSuitability,
    requiresSensitiveOverride,
    reason: route === "local"
      ? sensitivity === "public"
        ? "Task fits the measured local capability"
        : "Sensitive routine task stays on device by default"
      : requiresSensitiveOverride
        ? "Cloud review requires redaction and explicit override"
        : "Complex request benefits from specialist reasoning",
    estimatedInputTokens,
    evidencePack: evidence.evidence,
    cloudInstruction: evidence.instruction,
    evidenceTokens: evidence.evidence ? estimateTokens(evidence.evidence) : 0,
    redactionCategories: evidence.categories,
    redactionMatchCount: evidence.matchCount,
  };
}