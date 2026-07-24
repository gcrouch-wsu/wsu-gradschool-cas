/**
 * Allow only http(s) absolute URLs or same-origin relative paths for publisher links.
 * Rejects javascript:, data:, and protocol-relative //host URLs.
 */
export function sanitizePublicHref(raw: string, fallback = "#"): string {
  const s = raw.trim();
  if (!s) return fallback;
  if (s.startsWith("//")) return fallback;
  const lower = s.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:")) {
    return fallback;
  }
  if (s.startsWith("/")) {
    if (s.startsWith("//")) return fallback;
    return s.slice(0, 2000);
  }
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return fallback;
    return u.toString().slice(0, 2000);
  } catch {
    return fallback;
  }
}

/** Image/logo src: http(s) only (no relative protocol-relative). */
export function sanitizePublicImageSrc(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (s.startsWith("//")) return null;
  const lower = s.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:")) {
    return null;
  }
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString().slice(0, 2000);
  } catch {
    return null;
  }
}

/** Post-login redirect: same-origin path only (not //evil). */
export function sanitizeNextPath(raw: string | null | undefined, fallback = "/admin"): string {
  if (!raw) return fallback;
  const s = raw.trim();
  if (!s.startsWith("/") || s.startsWith("//") || s.includes("\\")) return fallback;
  if (s.includes("://")) return fallback;
  return s.slice(0, 500);
}
