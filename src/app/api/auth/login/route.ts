import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ADMIN_SESSION_COOKIE,
  adminCredentialsOk,
  authEnvConfigured,
  signAdminSession,
} from "@/lib/admin-session";
import {
  clearLoginFailures,
  loginRateLimitExceeded,
  recordLoginFailure,
} from "@/lib/login-rate-limit";

export const runtime = "nodejs";

const bodySchema = z.object({
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(500),
});

export async function POST(request: Request) {
  if (!authEnvConfigured()) {
    return NextResponse.json(
      {
        error:
          "Server is not configured. Set AUTH_SECRET (16+ chars), ADMIN_USERNAME, and ADMIN_PASSWORD.",
      },
      { status: 500 }
    );
  }

  if (loginRateLimitExceeded(request)) {
    return NextResponse.json(
      { error: "Too many failed sign-in attempts. Try again later." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { username, password } = parsed.data;
  if (!adminCredentialsOk(username, password)) {
    recordLoginFailure(request);
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  clearLoginFailures(request);

  const jwt = await signAdminSession();
  if (!jwt) {
    return NextResponse.json(
      { error: "Could not create session. Check AUTH_SECRET." },
      { status: 500 }
    );
  }

  const res = NextResponse.json({ ok: true });
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set(ADMIN_SESSION_COOKIE, jwt, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
