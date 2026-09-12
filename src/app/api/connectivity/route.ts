import { hasCloudConnectivity } from "@/lib/cloud-connectivity";
import { hasAzureResponsesConfig } from "@/lib/cloud-client";
import { localSessionCookie } from "@/lib/local-api-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const online = await hasCloudConnectivity();

  return Response.json(
    { online, configured: hasAzureResponsesConfig() },
    { headers: { "Cache-Control": "no-store, max-age=0", "Set-Cookie": localSessionCookie() } },
  );
}