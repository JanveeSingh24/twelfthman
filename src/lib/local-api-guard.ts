import { randomBytes, timingSafeEqual } from "node:crypto";

const SESSION_COOKIE = "twelfthman_session";
const sessionToken = randomBytes(32).toString("base64url");

export type LocalJsonParseResult =
  | { ok: true; value: unknown }
  | { ok: false; status: number; error: string };

function isLoopback(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}

function loopbackAuthority(protocol: string, host: string | null): URL | undefined {
  if (!host) return undefined;
  try {
    const authority = new URL(`${protocol}//${host}`);
    if (!isLoopback(authority.hostname) || authority.pathname !== "/" || authority.search || authority.hash) {
      return undefined;
    }
    return authority;
  } catch {
    return undefined;
  }
}

function cookieValue(cookieHeader: string | null, name: string): string | undefined {
  return cookieHeader
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([key]) => key === name)
    ?.slice(1)
    .join("=");
}

function matchesSessionToken(value: string | undefined): boolean {
  if (!value) return false;
  const supplied = Buffer.from(value);
  const expected = Buffer.from(sessionToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function localSessionCookie(): string {
  return `${SESSION_COOKIE}=${sessionToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800`;
}

export async function parseLocalJsonRequest(
  request: Request,
  maxBytes: number,
): Promise<LocalJsonParseResult> {
  const url = new URL(request.url);
  const authority = loopbackAuthority(url.protocol, request.headers.get("host"));
  if (!isLoopback(url.hostname) || !authority || authority.port !== url.port) {
    return { ok: false, status: 403, error: "Local API is available only on loopback." };
  }

  const origin = request.headers.get("origin");
  if (!origin || origin !== authority.origin) {
    return { ok: false, status: 403, error: "Same-origin request required." };
  }
  if (!matchesSessionToken(cookieValue(request.headers.get("cookie"), SESSION_COOKIE))) {
    return { ok: false, status: 403, error: "Local session capability is missing or invalid." };
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return { ok: false, status: 415, error: "Content-Type must be application/json." };
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { ok: false, status: 413, error: "Request body exceeds the local API limit." };
  }

  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    return { ok: false, status: 413, error: "Request body exceeds the local API limit." };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, status: 400, error: "Request body must contain valid JSON." };
  }
}