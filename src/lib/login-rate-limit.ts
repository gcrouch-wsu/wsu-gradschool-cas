/** Simple in-memory rate limit for admin login (per serverless isolate). */

type Bucket = { fails: number; windowStart: number };

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 20;

function keyFromRequest(request: Request): string {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function loginRateLimitExceeded(request: Request): boolean {
  const key = keyFromRequest(request);
  const now = Date.now();
  const b = buckets.get(key);
  if (!b) return false;
  if (now - b.windowStart > WINDOW_MS) {
    buckets.delete(key);
    return false;
  }
  return b.fails >= MAX_FAILS;
}

export function recordLoginFailure(request: Request): void {
  const key = keyFromRequest(request);
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.windowStart > WINDOW_MS) {
    buckets.set(key, { fails: 1, windowStart: now });
    return;
  }
  b.fails += 1;
}

export function clearLoginFailures(request: Request): void {
  buckets.delete(keyFromRequest(request));
}
