import { SignJWT, jwtVerify } from "jose";

export const ADMIN_SESSION_COOKIE = "cas_admin";

const MIN_SECRET_LEN = 16;

function encoderSecret(): Uint8Array | null {
  const s = process.env.AUTH_SECRET?.trim();
  if (!s || s.length < MIN_SECRET_LEN) return null;
  return new TextEncoder().encode(s);
}

export async function signAdminSession(): Promise<string | null> {
  const key = encoderSecret();
  if (!key) return null;
  return new SignJWT({ role: "admin" as const })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key);
}

export async function verifyAdminSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const key = encoderSecret();
  if (!key) return false;
  try {
    const { payload } = await jwtVerify(token, key);
    return (payload as { role?: unknown }).role === "admin";
  } catch {
    return false;
  }
}

/** Constant-time compare that does not leak length via early return. */
function timingSafeEqualStr(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length, 1);
  let out = a.length === b.length ? 0 : 1;
  for (let i = 0; i < max; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    out |= ca ^ cb;
  }
  return out === 0;
}

export function adminCredentialsOk(username: string, password: string): boolean {
  const u = process.env.ADMIN_USERNAME?.trim();
  const p = process.env.ADMIN_PASSWORD?.trim();
  if (!u || !p) return false;
  return timingSafeEqualStr(username.trim(), u) && timingSafeEqualStr(password, p);
}

export function authEnvConfigured(): boolean {
  return Boolean(
    process.env.AUTH_SECRET?.trim() &&
      process.env.AUTH_SECRET.trim().length >= MIN_SECRET_LEN &&
      process.env.ADMIN_USERNAME?.trim() &&
      process.env.ADMIN_PASSWORD?.trim()
  );
}
