const DEFAULT_CONNECTIVITY_URL = "https://www.msftconnecttest.com/connecttest.txt";

export async function hasCloudConnectivity(fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetcher(
      process.env.CLOUD_CONNECTIVITY_CHECK_URL ?? DEFAULT_CONNECTIVITY_URL,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      },
    );
    if (response.ok) return true;
  } catch {
    // Use the configured provider host as a service-specific reachability check.
  }

  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  if (!azureEndpoint) return false;

  try {
    const response = await fetcher(azureEndpoint, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    return response.status > 0;
  } catch {
    return false;
  }
}