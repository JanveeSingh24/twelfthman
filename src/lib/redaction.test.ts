import assert from "node:assert/strict";
import test from "node:test";

import { containsStructuredSensitiveData, redactTexts } from "./redaction.ts";

test("redacts declared structured identifiers locally", () => {
  const source = [
    "Email owner@example.com or call (425) 555-0199.",
    "SSN 123-45-6789 belongs to customer ID CUST-1042.",
    "Case number CASE-88 and account # ACCT-77 are at 123 Main Street.",
  ].join(" ");
  const result = redactTexts([source]);

  assert.deepEqual(
    new Set(result.categories),
    new Set(["email", "phone", "ssn", "customer-id", "case-id", "account-id", "address"]),
  );
  assert.equal(result.matchCount, 7);
  assert.doesNotMatch(result.texts[0], /owner@example\.com|425|123-45-6789|CUST-1042|CASE-88|ACCT-77|123 Main Street/i);
});

test("uses stable placeholders across instruction and evidence", () => {
  const result = redactTexts([
    "Summarize the issue for Contoso Research.",
    "Contoso Research owns the incident. Contact lead@example.com. Contoso Research will respond.",
  ], ["Contoso Research"]);

  assert.equal(result.texts[0], "Summarize the issue for [PROTECTED_TERM_1].");
  assert.equal(result.texts[1].match(/\[PROTECTED_TERM_1\]/g)?.length, 2);
  assert.deepEqual(new Set(result.categories), new Set(["protected-term", "email"]));
});

test("prefers a protected term over a structured match at the same span", () => {
  const result = redactTexts(["Send to owner@example.com."], ["owner@example.com"]);

  assert.equal(result.texts[0], "Send to [PROTECTED_TERM_1].");
  assert.equal(result.matchCount, 1);
});

test("uses a leftmost-longest sweep for nested and transitive overlaps", () => {
  const result = redactTexts(
    ["Send to owner@example.com."],
    ["owner", "owner@example.com", "example.com"],
  );

  assert.equal(result.texts[0], "Send to [PROTECTED_TERM_1].");
  assert.equal(result.matchCount, 1);
  assert.doesNotMatch(result.texts[0], /@example\.com/);
});

test("unions staggered overlap chains before redacting", () => {
  const result = redactTexts(
    ["Project Phoenix Delta is restricted."],
    ["Project Phoenix", "Phoenix Delta"],
  );

  assert.equal(result.texts[0], "[PROTECTED_TERM_1] is restricted.");
  assert.equal(result.matchCount, 1);
});

test("preserves original offsets when Unicode case folding changes length", () => {
  const result = redactTexts(
    ["İstanbul project belongs to owner@example.com."],
    ["İstanbul project"],
  );

  assert.equal(result.texts[0], "[PROTECTED_TERM_1] belongs to [EMAIL_1].");
  assert.doesNotMatch(result.texts[0], /İstanbul|owner@example\.com/);
});

test("detects residual structured sensitive data", () => {
  assert.equal(containsStructuredSensitiveData("Contact owner@example.com"), true);
  assert.equal(containsStructuredSensitiveData("Call 4255550199"), true);
  assert.equal(containsStructuredSensitiveData("Only [EMAIL_1] remains"), false);
});