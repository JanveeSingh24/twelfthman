# TwelfthMan

Local first. Cloud on demand.

TwelfthMan is a laptop-hosted proof of concept that decides whether a text task fits an on-device model or needs cloud review. It keeps the original prompt and context in the browser, builds a reduced and redacted evidence envelope locally, and sends that envelope to Azure only after explicit approval.

## What Is Real

- Deterministic task classification and a pre-generation **local suitability** score.
- Separate sensitivity policy for public, internal, and confidential content.
- Real on-device generation through Microsoft Foundry Local using the OpenVINO GPU execution provider.
- No generated fallback masquerading as local AI. An unavailable model produces a visible unavailable state.
- Local evidence ranking and deterministic redaction for email, US phone numbers, US SSNs, common customer/case/account IDs, common street addresses, and user-configured protected terms.
- Editable outbound evidence and explicit approval before a cloud call.
- A versioned offline queue containing sanitized evidence only. Reconnection never auto-sends; approval must be renewed.
- Direct Azure OpenAI Responses v1 integration with `store: false`, a bounded output, provider usage accounting, and differentiated guardrail/authentication/capacity/timeout errors.
- A local ledger that distinguishes estimated source-token avoidance from actual Azure input-token usage.

## Privacy Contract

The original prompt and context are never submitted to `/api/cloud` or persisted in the cloud queue. Configured structured identifiers and protected terms are deterministically redacted. The user must inspect the exact outbound evidence before approval.

Person, organization, and general location detection is not yet automatic. Those values must currently be entered as protected terms or removed manually in the editable preview. This POC is not a compliance-certified redaction system.

## Local Model Setup

Foundry Local `0.10.3` and `qwen2.5-0.5b-instruct-openvino-gpu:2` are installed on the current demo machine. Measured local completion time is approximately 0.4-1.3 seconds on Intel Iris Xe for a short prompt.

Prepare the runtime before starting the app:

```powershell
foundry model download qwen2.5-0.5b
foundry model load qwen2.5-0.5b
foundry server status
```

The expected local endpoint is `http://127.0.0.1:61111`. Model files remain cached on the laptop, and inference continues without internet access. The application reports the runtime as unavailable instead of simulating output when Foundry Local is stopped.

## Run Locally

```powershell
npm install
npm run dev
```

Open `http://localhost:3000` in a modern browser.

For a stable event demo:

```powershell
npm run build
npm run start -- --hostname 127.0.0.1
```

## Demo Flow

1. Enter confidential meeting notes and a summarization request.
2. Show the local-suitability decision, run the real local model, and point out zero cloud input.
3. Disable Wi-Fi and repeat a suitable local task.
4. Enter a complex request containing synthetic identifiers and protected terms.
5. Show selected evidence, placeholders, estimated compression, and the sensitive override notice.
6. Edit the evidence if necessary and approve the real Azure call.
7. While offline, queue a cloud-review request; reconnect and show that it still requires another review click.

Use synthetic or audience-entered data only. Clear the ledger before the judged run.

## Azure OpenAI Lane

Copy `.env.example` to `.env.local` and set these server-only values:

```text
AZURE_OPENAI_ENDPOINT=https://your-resource.services.ai.azure.com/openai/v1/responses
AZURE_OPENAI_DEPLOYMENT=your-deployment-name
AZURE_TENANT_ID=your-tenant-id
```

No API key is required. The Next.js server uses `DefaultAzureCredential` to obtain a token for `https://ai.azure.com/.default`. During local development it can use your VS Code, Azure CLI, or Azure PowerShell session; on an Azure host the same code can use managed identity. The signed-in principal needs inference access such as **Foundry User** at project or account scope. `AZURE_OPENAI_API_KEY` remains an optional fallback and is never bundled into the browser.

If the portal shows a blank key and inference returns `PermissionDenied`, open the Foundry account or project in Azure Portal, select **Access control (IAM)**, and assign **Foundry User** to the identity running TwelfthMan. Role changes can take several minutes to propagate. Creating a deployment does not necessarily grant its creator data-plane inference permission.

## Validation

```powershell
npm test
npm run build
```

Tests cover routing policy, local-model readiness and streaming, deterministic redaction, raw-field rejection, sanitized queue persistence, stateless Azure request shape, provider usage parsing, and cloud error normalization.

## Deferred

- Browser NER for automatic person, organization, and location detection
- Edge Prompt API/Aion adapter, which was rejected by the device preflight
- Purview sensitivity labels
- Microsoft 365 Copilot and Work IQ integration
- OCR and document ingestion
- Retrieval and vector indexing
- Public hosting and managed identity
- Native WinUI packaging
