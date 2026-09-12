import { callAzureResponses, CloudClientError } from "@/lib/cloud-client";
import { parseCloudEnvelope, validateCloudEnvelopeConsent } from "@/lib/cloud-envelope";
import { containsStructuredSensitiveData } from "@/lib/redaction";
import { parseLocalJsonRequest } from "@/lib/local-api-guard";
import { completeCloudRequest, markCloudRequestUnknown, releaseCloudRequest, reserveCloudRequest } from "@/lib/cloud-request-dedupe";

export async function POST(request: Request) {
  const body = await parseLocalJsonRequest(request, 8_192);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status });
  const parsed = parseCloudEnvelope(body.value);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const envelope = parsed.value;
  const consent = await validateCloudEnvelopeConsent(envelope);
  if (!consent.ok) return Response.json({ error: consent.error }, { status: 400 });
  if (containsStructuredSensitiveData(`${envelope.instruction}\n${envelope.evidence}`)) {
    return Response.json(
      { error: "Sanitized cloud envelope still contains a structured identifier." },
      { status: 400 },
    );
  }
  if (!reserveCloudRequest(envelope.requestId)) {
    return Response.json({ error: "Duplicate cloud request rejected." }, { status: 409 });
  }

  try {
    const response = await callAzureResponses(envelope);
    completeCloudRequest(envelope.requestId);
    return Response.json(response);
  } catch (error) {
    if (error instanceof CloudClientError && error.kind !== "timeout" && error.kind !== "provider") {
      releaseCloudRequest(envelope.requestId);
    } else {
      markCloudRequestUnknown(envelope.requestId);
    }
    if (error instanceof CloudClientError) {
      return Response.json(
        { error: error.message, errorKind: error.kind },
        { status: error.publicStatus },
      );
    }
    return Response.json({ error: "Unexpected cloud error." }, { status: 500 });
  }
}