export type RedactionCategory =
  | "email"
  | "phone"
  | "ssn"
  | "customer-id"
  | "case-id"
  | "account-id"
  | "address"
  | "protected-term";

export type RedactionMatch = {
  category: RedactionCategory;
  sourceIndex: number;
  start: number;
  end: number;
  placeholder: string;
};

export type RedactionReport = {
  texts: string[];
  matches: RedactionMatch[];
  categories: RedactionCategory[];
  matchCount: number;
};

type Candidate = Omit<RedactionMatch, "placeholder"> & { value: string };

const PATTERNS: Array<{ category: RedactionCategory; pattern: RegExp }> = [
  { category: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { category: "ssn", pattern: /\b(?!000|666|9\d\d)\d{3}[- ](?!00)\d{2}[- ](?!0000)\d{4}\b/g },
  { category: "phone", pattern: /(?<!\d)(?:\+?1[ .-]?)?(?:(?:\(\d{3}\)|\d{3})[ .-]\d{3}[ .-]\d{4}|\d{10})(?!\d)/g },
  { category: "customer-id", pattern: /\bcustomer\s*(?:id|number|no\.?|#)\s*[:#-]?\s*[A-Z0-9][A-Z0-9-]{2,}\b/gi },
  { category: "case-id", pattern: /\bcase\s*(?:id|number|no\.?|#)\s*[:#-]?\s*[A-Z0-9][A-Z0-9-]{2,}\b/gi },
  { category: "account-id", pattern: /\baccount\s*(?:id|number|no\.?|#)\s*[:#-]?\s*[A-Z0-9][A-Z0-9-]{2,}\b/gi },
  {
    category: "address",
    pattern: /(?<![\w-])\d{1,6}\s+(?:[A-Z0-9.'-]+\s+){0,5}?(?:street|st\.?|road|rd\.?|avenue|ave\.?|boulevard|blvd\.?|lane|ln\.?|drive|dr\.?|court|ct\.?|way|parkway|pkwy\.?)\b/gi,
  },
];

function normalizeValue(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function placeholderLabel(category: RedactionCategory): string {
  return category.replaceAll("-", "_").toUpperCase();
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findProtectedTerms(text: string, sourceIndex: number, protectedTerms: string[]): Candidate[] {
  const matches: Candidate[] = [];

  for (const rawTerm of protectedTerms) {
    const term = rawTerm.trim();
    if (!term) continue;

    const pattern = new RegExp(escapeRegularExpression(term), "giu");
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) continue;
      matches.push({
        category: "protected-term",
        sourceIndex,
        start: match.index,
        end: match.index + match[0].length,
        value: match[0],
      });
    }
  }

  return matches;
}

function findCandidates(text: string, sourceIndex: number, protectedTerms: string[]): Candidate[] {
  const candidates = findProtectedTerms(text, sourceIndex, protectedTerms);

  for (const { category, pattern } of PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) continue;
      candidates.push({
        category,
        sourceIndex,
        start: match.index,
        end: match.index + match[0].length,
        value: match[0],
      });
    }
  }

  const sorted = candidates.sort((left, right) =>
    left.start - right.start
    || right.end - left.end
    || (left.category === "protected-term" ? -1 : 1));
  const accepted: Candidate[] = [];

  for (const candidate of sorted) {
    const previous = accepted.at(-1);
    if (!previous || candidate.start >= previous.end) {
      accepted.push(candidate);
      continue;
    }

    if (candidate.end > previous.end) {
      previous.end = candidate.end;
      previous.value = text.slice(previous.start, previous.end);
    }
  }

  return accepted;
}

export function redactTexts(texts: string[], protectedTerms: string[] = []): RedactionReport {
  const placeholderByValue = new Map<string, string>();
  const categoryCounts = new Map<RedactionCategory, number>();
  const allMatches: RedactionMatch[] = [];

  const redactedTexts = texts.map((text, sourceIndex) => {
    const candidates = findCandidates(text, sourceIndex, protectedTerms);
    let cursor = 0;
    let redacted = "";

    for (const candidate of candidates) {
      const valueKey = `${candidate.category}:${normalizeValue(candidate.value)}`;
      let placeholder = placeholderByValue.get(valueKey);
      if (!placeholder) {
        const count = (categoryCounts.get(candidate.category) ?? 0) + 1;
        categoryCounts.set(candidate.category, count);
        placeholder = `[${placeholderLabel(candidate.category)}_${count}]`;
        placeholderByValue.set(valueKey, placeholder);
      }

      redacted += text.slice(cursor, candidate.start) + placeholder;
      cursor = candidate.end;
      allMatches.push({
        category: candidate.category,
        sourceIndex,
        start: candidate.start,
        end: candidate.end,
        placeholder,
      });
    }

    return redacted + text.slice(cursor);
  });

  return {
    texts: redactedTexts,
    matches: allMatches,
    categories: [...new Set(allMatches.map(({ category }) => category))],
    matchCount: allMatches.length,
  };
}

export function containsStructuredSensitiveData(text: string): boolean {
  return PATTERNS.some(({ pattern }) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}