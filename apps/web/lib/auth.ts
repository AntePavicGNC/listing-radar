// Einfacher Passwortschutz für die rein private App (Single-User).
// Im Cookie liegt NICHT das Klartext-Passwort, sondern ein SHA-256-Hash davon.
// Proxy (proxy.ts) und Login (api/login) vergleichen jeweils gegen denselben Hash.
// Web-Crypto (crypto.subtle) ist sowohl im Node- als auch im Proxy-Kontext verfügbar.

export const AUTH_COOKIE = "lr_auth";
const SALT = "listing-radar:v1";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Erwarteter Cookie-Wert, abgeleitet aus APP_PASSWORD. null, wenn kein Passwort gesetzt ist. */
export async function expectedAuthToken(): Promise<string | null> {
  const password = process.env.APP_PASSWORD;
  if (!password) return null;
  return sha256Hex(`${SALT}:${password}`);
}

/** Vergleicht den Cookie-Wert (annähernd konstante Zeit) gegen den erwarteten Token. */
export async function isValidAuthCookie(
  value: string | undefined | null,
): Promise<boolean> {
  if (!value) return false;
  const expected = await expectedAuthToken();
  if (!expected || value.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < value.length; i++) {
    mismatch |= value.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}
