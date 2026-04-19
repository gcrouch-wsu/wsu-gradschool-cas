"use client";

import { useRouter } from "next/navigation";

export function AdminSignOutButton() {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void logout()}
      className="shrink-0 text-sm text-wsu-gray underline decoration-wsu-gray/30 hover:text-wsu-crimson"
    >
      Sign out
    </button>
  );
}
