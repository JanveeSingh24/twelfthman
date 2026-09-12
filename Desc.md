# TwelfthMan
### Local first. Cloud on demand.

#Hackathon2026 #OnDeviceAI #SLM #NPU #ModelRouting #TokenOptimization #LocalFirstAI #OfflineAI #ZeroCostProductivity

---

## Problem Statement

Today, nearly every Copilot-style request follows the same path: to the cloud, to a frontier model, and at frontier-model costs.

However, much of the work performed by information workers is routine utility work:

- Summarize this conversation
- Rewrite this email
- Extract fields from this document
- Convert these notes into a table

Routing every request to the cloud introduces four major challenges:

### 1. Cost
Organizations pay premium inference costs for tasks that small, local models can already perform effectively. As AI adoption increases, costs scale with usage.

### 2. Latency
Simple requests often incur a 4–8 second round trip to the cloud when they could be completed locally in under two seconds.

### 3. Privacy and Compliance
Sensitive customer conversations, internal documentation, case notes, and regulated data leave the device for processing, creating concerns for highly regulated environments.

### 4. Availability
AI assistance becomes unavailable when users are offline, travelling, operating in secure environments, or working in air-gapped locations.

At the same time, modern Windows devices already include NPU-optimized Small Language Models capable of handling many of these tasks locally, yet that capability remains largely unused.

---

# Idea Summary

**TwelfthMan** is a **local-first model selector** that determines, for every request, whether the task should be handled locally or escalated to the cloud.

Just as a cricket team's twelfth player steps in only when truly needed, TwelfthMan ensures cloud intelligence is used only when it adds meaningful value.

### How TwelfthMan Works

#### 1. Classify Locally
A lightweight classifier evaluates:

- Task type
- Complexity
- Input size
- Sensitivity labels

#### 2. Play the Local Model First
Tasks such as:

- Summarization
- Rewriting
- OCR extraction
- Text-to-table conversion
- Draft generation
- Retrieval-grounded Q&A

run entirely on-device using Windows AI LanguageModel APIs.

**Benefits:**

- Zero cloud tokens
- ~1–2 second responses
- Fully functional offline

#### 3. Confidence Scoring
The local answer is evaluated against calibrated confidence thresholds.

- High confidence → answer ships immediately
- Sensitive content → remains local regardless of confidence

#### 4. Escalate Thin, Not Fat
When advanced reasoning is required:

- Relevant context is retrieved locally
- PII is redacted
- Context is compressed into an evidence pack

Result:

**10–50× less data is sent to the cloud.**

#### 5. Keep Score
Every routing decision is recorded in a local ledger.

Metrics include:

- Requests served
- Local execution percentage
- Compression achieved
- Latency savings
- Tokens avoided

Savings are measured, not estimated.

---

# Architecture

## Request Flow

### Stage 1 – Classify
Determine:

- Task type
- Complexity
- Input length
- Sensitivity

**Location:** Device

### Stage 2 – Policy Gate
Apply governance policies.

Examples:

- Confidential content always stays local
- Admin rules override escalation

**Location:** Device

### Stage 3 – Local Lane
Hybrid retrieval grounds the request against local context.

Examples:

- Emails
- Chats
- Documents
- Meeting transcripts
- Case notes

The local SLM generates the response.

**Location:** Device

### Stage 4 – Confidence Self-Score
Assess whether the response meets quality thresholds.

If confidence is sufficient:

✅ Return answer immediately

**Location:** Device

### Stage 5 – Compression
For low-confidence requests:

- Gather only relevant evidence
- Remove sensitive identifiers
- Build a compact evidence pack

**Location:** Device

### Stage 6 – Escalation
Send the evidence pack—not the entire dataset—to:

- Microsoft 365 Copilot
- Azure AI

under a defined token budget.

**Location:** Cloud

### Stage 7 – Accounting
Record:

- Route chosen
- Confidence score
- Latency
- Tokens saved
- Cost impact

**Location:** Device

---

# Offline Capability

When connectivity is unavailable:

- Classification continues
- Retrieval continues
- Summarization continues
- Rewriting continues
- Extraction continues

Only cloud-bound requests are queued until reconnection.

TwelfthMan remains productive even without internet connectivity.

---

# Technology Stack

| Layer | Component | Purpose |
|---------|-----------|-----------|
| Capture | Local Index | Build encrypted knowledge base |
| Decide | Classifier | Determine complexity and sensitivity |
| Decide | Policy Engine | Apply governance rules |
| Execute | Hybrid Retrieval | Ground answers in local knowledge |
| Execute | Local SLM | Generate responses on-device |
| Judge | Confidence Scorer | Determine if escalation is required |
| Escalate | Context Compressor | Build minimal evidence pack |
| Escalate | Cloud Reasoner | Advanced reasoning only when needed |
| Account | Local Ledger | Track savings and execution history |

---

# Hardware Acceleration

### Best Experience – NPU
- Copilot+ PCs
- Windows AI APIs
- Sub-2 second response times

### Good Experience – GPU
- DirectML + ONNX Runtime
- Full feature set

### Baseline – CPU
- Reduced local scope
- More requests escalate
- Governance and privacy remain intact

TwelfthMan degrades gracefully rather than failing.

---

# AI and Copilot Integration

## On-Device AI

Powered by:

- Windows AI LanguageModel APIs
- Phi Silica / future Aion models
- Windows ML
- ONNX Runtime GenAI

Capabilities:

- Summarization
- Rewriting
- Extraction
- Draft generation
- Text-to-table conversion

## Cloud AI

Used only when:

- Multi-hop reasoning is required
- Context exceeds local capabilities
- Confidence is below threshold

Integrations include:

- Microsoft 365 Copilot
- Azure AI
- Purview Sensitivity Labels
- Outlook
- Teams
- Excel
- Loop

## Transparency

Every response shows:

- Where it ran
- How long it took
- Whether cloud resources were used
- What tokens were consumed

Users can preview exactly what would leave the device before escalation occurs.

---

# Business Impact

### Reduce AI Costs
A significant portion of routine prompts can be completed locally.

Result:

- Zero inference cost for local requests
- Reduced cloud token consumption
- Better scalability

### Increase Productivity
Routine tasks complete in ~1–2 seconds instead of waiting for cloud round trips.

### Improve Privacy
Sensitive data remains on-device and under organizational control.

### Enable Regulated Adoption
Supports industries such as:

- Healthcare
- Finance
- Government
- Defense
- Customer Support

### Improve Resilience
Core functionality continues even when offline.

### Make Value Measurable
The ledger produces actionable metrics:

- Local execution rate
- Compression ratio
- Latency improvements
- Spend avoided

---

# The Vision

The future is not one model handling every request.

The future is selecting the right model for the right task at the right time.

**TwelfthMan ensures that:**

✅ Local where we can
✅ Cloud where it counts
✅ Privacy by design
✅ Zero-cost productivity for routine work
✅ Measurable AI efficiency

**TwelfthMan: Local first. Cloud on demand.**