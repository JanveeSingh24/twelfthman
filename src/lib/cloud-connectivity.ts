const DEFAULT_CONNECTIVITY_URL = "http://www.msftconnecttest.com/connecttest.txt";

export async function hasCloudConnectivity(fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetcher(
      process.env.CLOUD_CONNECTIVITY_CHECK_URL ?? DEFAULT_CONNECTIVITY_URL,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}