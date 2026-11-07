const TOKEN_RE = /^ub[A-Za-z0-9]{14,}$/;

/** Accept old scan URLs, new in-app QR payloads and manually entered tokens. */
export function extractUnibyteToken(value: string): string | null {
  const text = value.trim();
  if (text.startsWith("UNIBYTE:")) {
    const token = text.slice("UNIBYTE:".length);
    return TOKEN_RE.test(token) ? token : null;
  }
  try {
    const url = new URL(text);
    const token = url.searchParams.get("token") ?? "";
    return TOKEN_RE.test(token) ? token : null;
  } catch {
    return TOKEN_RE.test(text) ? text : null;
  }
}

/**
 * Build a normal HTTPS URL so the QR works from the phone camera as well as
 * from the in-app scanner. The scanner still accepts the legacy UNIBYTE:
 * payload above, so already printed codes keep working.
 */
export function buildPublicQrUrl(token: string, baseUrl?: string): string {
  const browserOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "";
  const origin = (baseUrl || browserOrigin || configuredOrigin).replace(/\/$/, "");
  const path = `/scan?token=${encodeURIComponent(token)}`;
  return origin ? `${origin}${path}` : path;
}

/** @deprecated Use buildPublicQrUrl for all newly generated QR codes. */
export const buildInAppQrPayload = buildPublicQrUrl;
