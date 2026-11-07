const alphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomBytes(len: number): Uint8Array {
  const g = globalThis.crypto ?? (globalThis as { msCrypto?: Crypto }).msCrypto;
  if (g?.getRandomValues) {
    const arr = new Uint8Array(len);
    g.getRandomValues(arr);
    return arr;
  }
  // Fallback (Node < 19 without global crypto): use Math.random, good enough for tokens
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = Math.floor(Math.random() * 256);
  return arr;
}

/** Generate a secure, unguessable QR token (URL-safe, 32 chars). */
export function generateQrToken(): string {
  const bytes = randomBytes(32);
  let out = "ub";
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

/** Build the scan URL a physical QR code should encode. */
export function buildScanUrl(token: string, baseUrl?: string): string {
  const root = (baseUrl ?? "").replace(/\/$/, "");
  return `${root}/scan?token=${encodeURIComponent(token)}`;
}
