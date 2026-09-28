# Innovation Studio submission: current TwelfthMan POC

## Fields

### Title

TwelfthMan

### Tagline

Local first. Cloud on demand.

### Problem or opportunity statement

Routine AI work is sent to costly cloud models by default, adding token spend, latency, and privacy exposure even when a small local model can complete it on the device.

### Existing Microsoft product or service

Microsoft Foundry Local and Azure OpenAI. The product vision extends this routing layer into Microsoft 365 Copilot and Windows AI experiences.

### Briefly describe what you made and how you made it

We built a working laptop-hosted POC of TwelfthMan, a local-first AI router. A Next.js workbench classifies each text task and applies sensitivity policy before generation. Suitable work runs through Microsoft Foundry Local using Qwen 2.5 0.5B with the OpenVINO GPU provider; measured short completions on the demo laptop take about 0.4-1.3 seconds and use zero cloud tokens. Requests needing stronger reasoning are reduced to relevant evidence, deterministically redacted, shown in an editable preview, and sent to Azure OpenAI Responses only after explicit approval. Raw prompt and context fields are rejected by the cloud contract. Offline cloud drafts store sanitized evidence without consent and require review again after reconnecting. A local ledger records route, suitability, latency, estimated tokens avoided, and actual Azure input usage, never content. The current build passes 50 automated tests and a Next.js production build.

### Recommended keywords

- Local-first AI
- Microsoft Foundry Local
- Azure OpenAI
- Responsible AI
- Model routing
- On-device AI
- Offline AI
- Privacy by design
- Token optimization
- Zero-cost productivity

## Description

## 1. Problem

Most Copilot-style requests take the same path: send the task and its context to a cloud model. That is valuable for difficult reasoning, but wasteful for routine utility work such as summarizing a short update, rewriting a reply, extracting fields, turning text into a table, or drafting a response.

Using a cloud model by default creates four avoidable costs:

- **Cost:** routine work consumes cloud tokens even when a small local model is capable enough.
- **Latency:** a network round trip is added to high-frequency tasks that can finish locally.
- **Privacy:** more source content crosses the device boundary than the task may require.
- **Availability:** useful AI assistance disappears when connectivity is unavailable.

The opportunity is not to replace cloud AI. It is to select the right execution lane before generation, keep suitable work local, and escalate only when stronger reasoning adds value.

## 2. The TwelfthMan idea

TwelfthMan is a local-first model selector that sits between the user experience and available AI models. Like cricket's twelfth player, the cloud model does not need to play every ball; it comes in when it is genuinely needed.

The north-star product is a horizontal routing layer for Windows and Copilot experiences:

1. Classify a request locally using task, complexity, size, sensitivity, and device capability.
2. Apply organizational policy before any model runs.
3. Execute suitable work with an on-device model.
4. Ground local work with a user-scoped encrypted index and retrieval.
5. Evaluate whether the local result is sufficient for its task class.
6. For eligible escalation, construct a minimal, de-identified evidence pack.
7. Let the user inspect exactly what would leave the device.
8. Invoke Microsoft 365 Copilot or Azure AI only by exception and under a token budget.
9. Record routing and usage metadata locally so savings and behavior are measurable.

This is the **product vision**. NPU execution through Windows AI LanguageModel APIs, Purview/MIP policy integration, OCR and ingestion, encrypted indexing, hybrid retrieval, calibrated answer confidence, Microsoft 365 Copilot integration, and native Windows packaging are roadmap capabilities, not claims about the current POC.

## 3. What we built in this POC

The hackathon POC proves the central routing and trust-boundary workflow end to end with real local and cloud inference.

### Request and policy

The browser workbench accepts a prompt, context, sensitivity, and optional protected terms. A deterministic TypeScript router classifies six task classes: summarize, rewrite, extract, table, draft, and reason. It calculates a pre-generation `localSuitability` score from task class, request size, complexity, local-model readiness, and sensitivity policy.

`localSuitability` is a capability score, not a claim that the generated answer is correct. This distinction is deliberate: reliable answer-confidence calibration remains a roadmap problem.

### Real local lane

Suitable requests run through a loopback-only Next.js endpoint into Microsoft Foundry Local. The current demo machine uses:

- Foundry Local `0.10.3`
- `qwen2.5-0.5b-instruct-openvino-gpu:2`
- Intel Iris Xe through the OpenVINO GPU execution provider
- Loopback HTTP only; configuration cannot redirect raw local content to a remote host

Measured short-prompt completion time on this machine is approximately **0.4-1.3 seconds**. If Foundry Local is unavailable, TwelfthMan shows an unavailable state rather than inventing or simulating an answer.

### Reviewed cloud lane

Complex work can enter `CLOUD REVIEW`. Before anything is sent:

1. The POC ranks sentences from the user-provided context and retains the most relevant evidence.
2. It deterministically redacts email, US phone number, US SSN, customer ID, case ID, account ID, common street address, and user-configured protected terms.
3. It builds a versioned `CloudEnvelope` containing a sanitized instruction, sanitized evidence, token estimates, redaction metadata, request ID, and consent.
4. The user sees an editable outbound preview and must explicitly approve it.
5. Consent is bound to the exact reviewed content with SHA-256 and expires after ten minutes.

The local `/api/cloud` guard rejects unknown fields, raw `prompt` or `context`, missing or stale consent, modified post-approval content, oversized evidence, residual structured identifiers, duplicate requests, and ambiguous replays.

Only the approved envelope reaches Azure OpenAI Responses v1. The server uses Microsoft Entra authentication by default, sends `store: false`, limits output to 450 tokens, requires answers to stay grounded in sanitized evidence, and records actual provider token usage. Authentication, guardrail, capacity, timeout, and provider failures remain visible; failed calls do not masquerade as completed answers.

### Sensitive work

Routine non-public work stays local by default. A complex non-public request is not described as "never cloud" in this POC: it can escalate only after local evidence reduction and redaction, an explicit sensitive-data override, review of the exact outbound content, and fresh approval.

### Offline behavior

Local inference continues when internet connectivity is unavailable. A cloud-review request can be stored as a sanitized local draft, but the queue deliberately removes send consent. Reconnection changes the item to `ready-for-review`; it never auto-sends. The user must reopen it, review it again, and approve a new content-bound envelope.

### Ledger and scorecard

Completed executions write non-content metadata to browser-local storage:

- task class
- route
- engine
- local suitability
- estimated input tokens
- actual cloud input tokens
- latency
- whether a sensitive override was used

The scorecard calculates request count, local share, estimated source tokens avoided, actual Azure input tokens, and estimated compression. It does not store prompts, context, evidence, redacted values, or model answers.

## 4. Implemented architecture

```text
User input
  -> deterministic local router and sensitivity policy
     -> LOCAL
        -> loopback /api/local
        -> Microsoft Foundry Local / Qwen 2.5 0.5B / OpenVINO GPU
        -> answer + route badge
     -> CLOUD REVIEW
        -> local evidence ranking
        -> deterministic redaction
        -> editable outbound preview
        -> explicit, content-bound approval
           -> online: guarded Next.js /api/cloud -> Azure OpenAI Responses
           -> offline: sanitized draft queue -> reconnect -> review again
  -> local metadata ledger -> scorecard
```

The original prompt and context stay in the browser/local lane. Azure receives only the approved sanitized instruction and evidence.

## 5. Verified evidence

The current POC has reproducible engineering evidence, not production-adoption claims:

- **50/50 automated tests passing**, zero failures or skips.
- **9/9 routing checks** for local, cloud-review, policy, and evidence behavior.
- **7 structured redaction classes** covered by tests.
- **2/2 raw cloud fields blocked:** both `prompt` and `context` are rejected.
- **5/5 offline queue lifecycle safeguards** passing.
- **3/3 cloud replay controls** passing.
- **450-token cloud output cap** asserted in tests.
- **10-minute content-bound consent lifetime** asserted in tests.
- **0.4-1.3 second local completion range** measured on the demo laptop for short prompts.
- Next.js `16.3.4` production build compiles and type-checks successfully.

These metrics validate the current code and privacy contract. They do not yet prove tenant-wide local-routing rates or realized financial savings.

## 6. Business impact hypothesis

If representative-user pilots show that a meaningful share of routine tasks can be served locally at acceptable quality, TwelfthMan can reduce cloud input usage, improve response time for common work, limit data movement, and preserve useful assistance while offline.

The POC already makes those effects measurable per execution. The next step is a controlled pilot that compares local and cloud answer quality by task class, establishes honest routing thresholds, measures the achievable local share, and converts actual token deltas into a defensible cost model.

## 7. Responsible AI and honest limitations

- The current router is deterministic; it is not a trained classifier.
- `localSuitability` is assessed before generation and is not answer confidence.
- Evidence ranking uses only the text supplied in the current request; there is no vector database or enterprise retrieval index yet.
- Redaction is deterministic and pattern-based. It is not compliance certification and does not automatically detect every person, organization, or location.
- Human review is part of the outbound security control.
- The current local model runs on Intel GPU, not NPU.
- The cloud lane is Azure OpenAI Responses, not Microsoft 365 Copilot.
- The ledger is browser-local POC storage, not an enterprise append-only audit service.
- Local completion measurements are from one demo laptop and short prompts, not a fleet benchmark.

## 8. Roadmap from POC to product

1. Evaluate answer quality on representative task-class datasets and calibrate routing thresholds.
2. Add Windows AI LanguageModel/NPU execution and graceful GPU/CPU fallback.
3. Add Purview/MIP sensitivity labels and administrator policy.
4. Add user-scoped encrypted ingestion, embeddings, and hybrid retrieval.
5. Add stronger local entity detection while preserving editable human review.
6. Integrate the specialist lane with Microsoft 365 Copilot extensibility.
7. Add managed identity, enterprise observability, policy administration, and pilot reporting.
8. Package the experience for native Windows and inline Microsoft 365 surfaces.

This POC establishes the core operating model for TwelfthMan: decide locally, keep routine work on-device, escalate only reviewed evidence, and measure every outcome. The roadmap extends that model across Windows and Copilot experiences with enterprise policy, richer local context, and calibrated quality evaluation.

## Media changes

1. Replace the current 1:59 video with the final 49-second product demo, or place the 49-second cut first.
2. Upload `demo-output/final/twelfthman-architecture-16x9.png` as the architecture image and label it **Current POC architecture**.
3. If retaining the original NPU/retrieval/M365 diagram, label it **North-star product architecture** rather than current architecture.
4. Add the verified metrics visual only with the caption **Engineering validation for the current POC; not production impact**.