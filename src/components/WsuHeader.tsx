"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function WsuHeader() {
  const pathname = usePathname() || "";
  const onAdmin = pathname.startsWith("/admin");
  const onLogin = pathname.startsWith("/admin/login");

  return (
    <header className="border-b border-wsu-crimson-dark/20 bg-wsu-crimson text-white shadow-md">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-white hover:text-white/90"
          >
            GradCAS and EngineeringCAS Applications
          </Link>
          <p className="text-xs font-medium uppercase tracking-widest text-white/70">
            Washington State University
          </p>
        </div>
        {!onLogin ? (
          <Link
            href="/admin"
            className="shrink-0 self-start rounded-md border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-white/20 sm:self-center"
          >
            {onAdmin ? "Admin home" : "Sign in"}
          </Link>
        ) : null}
      </div>
    </header>
  );
}
