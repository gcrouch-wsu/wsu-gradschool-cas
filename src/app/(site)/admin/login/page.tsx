"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { sanitizeNextPath } from "@/lib/safe-url";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = sanitizeNextPath(searchParams.get("next"), "/admin");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Login failed");
        return;
      }
      router.push(nextPath);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-0 flex-1 max-w-md flex-col justify-center px-4 py-12">
      <div className="rounded-2xl border border-wsu-gray/10 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-wsu-gray-dark">Admin sign in</h1>
        <p className="mt-2 text-sm text-wsu-gray">
          Use the username and password configured for this deployment.
        </p>
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block text-sm font-medium text-wsu-gray-dark">
            Username
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-wsu-gray/20 px-3 py-2.5 text-wsu-gray-dark shadow-inner focus:border-wsu-crimson focus:outline-none focus:ring-2 focus:ring-wsu-crimson/20"
            />
          </label>
          <label className="block text-sm font-medium text-wsu-gray-dark">
            Password
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-wsu-gray/20 px-3 py-2.5 text-wsu-gray-dark shadow-inner focus:border-wsu-crimson focus:outline-none focus:ring-2 focus:ring-wsu-crimson/20"
            />
          </label>
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-wsu-crimson py-3 text-sm font-semibold text-white shadow-md transition hover:bg-wsu-crimson-dark disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-wsu-gray">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
