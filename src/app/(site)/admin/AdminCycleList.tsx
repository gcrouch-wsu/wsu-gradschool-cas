"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { PublicationSummary } from "@/lib/cas-store";

type Props = {
  currentSlug: string | null;
  publications: PublicationSummary[];
};

function formatPublicationDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

async function deleteCycle(slug: string): Promise<string | null> {
  const res = await fetch(`/api/admin/publications/${slug}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (res.status === 401) {
    return "Sign in again before deleting cycles.";
  }
  if (!res.ok) {
    const raw = await res.text();
    try {
      const parsed = JSON.parse(raw) as { error?: string };
      return parsed.error || `Delete failed for ${slug}.`;
    } catch {
      return raw.slice(0, 300) || `Delete failed for ${slug}.`;
    }
  }
  return null;
}

export function AdminCycleList({ currentSlug, publications }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visiblePublications = useMemo(
    () => publications.filter((p) => !deleted.includes(p.slug)),
    [deleted, publications]
  );
  const deletableSlugs = useMemo(
    () => visiblePublications.filter((p) => p.slug !== currentSlug).map((p) => p.slug),
    [currentSlug, visiblePublications]
  );
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const allDeletableSelected =
    deletableSlugs.length > 0 && deletableSlugs.every((slug) => selectedSet.has(slug));
  const canDelete = selected.length > 0 && confirmText === "DELETE";

  function toggle(slug: string) {
    setSelected((prev) =>
      prev.includes(slug) ? prev.filter((value) => value !== slug) : [...prev, slug]
    );
    setConfirmText("");
  }

  function toggleAll() {
    setSelected(allDeletableSelected ? [] : deletableSlugs);
    setConfirmText("");
  }

  async function bulkDelete() {
    const targets = selected.filter((slug) => slug !== currentSlug);
    if (targets.length === 0 || confirmText !== "DELETE") return;

    setBusy(true);
    setError(null);
    setMessage(null);
    const failures: string[] = [];
    const successes: string[] = [];
    for (const slug of targets) {
      const failure = await deleteCycle(slug);
      if (failure) failures.push(`${slug}: ${failure}`);
      else successes.push(slug);
    }
    setBusy(false);

    if (successes.length > 0) {
      setDeleted((prev) => [...new Set([...prev, ...successes])]);
      setSelected((prev) => prev.filter((slug) => !successes.includes(slug)));
      setMessage(`Deleted ${successes.length} cycle${successes.length === 1 ? "" : "s"}.`);
    }
    setConfirmText("");

    if (failures.length > 0) {
      setError(failures.join(" "));
      return;
    }
    router.refresh();
  }

  return (
    <section className="rounded-2xl border border-wsu-gray/10 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-wsu-gray">
            Cycles
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-wsu-gray">
            Select old cycles and use DELETE. The live home cycle is locked until another cycle is
            set as live.
          </p>
        </div>
        <div className="flex flex-col gap-2 md:items-end">
          <input
            type="text"
            value={confirmText}
            disabled={busy || selected.length === 0}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type DELETE"
            className="w-full rounded-lg border border-wsu-gray/25 px-3 py-2 text-sm text-wsu-gray-dark shadow-inner placeholder:text-wsu-gray/50 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:opacity-50 md:w-36"
          />
          <button
            type="button"
            disabled={busy || !canDelete}
            onClick={() => void bulkDelete()}
            className="inline-flex min-w-28 items-center justify-center rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-800 shadow-sm hover:bg-red-50 disabled:pointer-events-none disabled:opacity-50"
          >
            {busy ? "Deleting..." : "DELETE"}
          </button>
        </div>
      </div>

      {message ? <p className="mt-3 text-sm text-emerald-800">{message}</p> : null}
      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="mt-5 overflow-hidden rounded-xl border border-wsu-gray/10">
        <div className="hidden grid-cols-[2.75rem_minmax(16rem,1fr)_8rem_8rem_12rem] items-center gap-3 border-b border-wsu-gray/10 bg-wsu-cream/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-wsu-gray md:grid">
          <label className="flex justify-center">
            <input
              type="checkbox"
              checked={allDeletableSelected}
              disabled={busy || deletableSlugs.length === 0}
              onChange={toggleAll}
              aria-label="Select all deletable cycles"
              className="size-4 rounded border-wsu-gray text-wsu-crimson focus:ring-wsu-crimson"
            />
          </label>
          <span>Cycle</span>
          <span>Updated</span>
          <span className="text-right">Programs</span>
          <span className="text-right">Actions</span>
        </div>

        <div className="divide-y divide-wsu-gray/10">
          {visiblePublications.map((publication) => {
            const isLive = currentSlug === publication.slug;
            const checked = selectedSet.has(publication.slug);
            return (
              <div
                key={publication.slug}
                className="grid gap-3 px-3 py-4 md:grid-cols-[2.75rem_minmax(16rem,1fr)_8rem_8rem_12rem] md:items-center"
              >
                <label className="flex items-center gap-3 md:justify-center">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={busy || isLive}
                    onChange={() => toggle(publication.slug)}
                    aria-label={`Select ${publication.title}`}
                    className="size-4 rounded border-wsu-gray text-wsu-crimson focus:ring-wsu-crimson disabled:opacity-40"
                  />
                  <span className="text-xs font-semibold uppercase tracking-wide text-wsu-gray md:hidden">
                    Select
                  </span>
                </label>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 break-words text-sm font-semibold text-wsu-gray-dark">
                      {publication.title}
                    </p>
                    {isLive ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900">
                        Live
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 font-mono text-xs text-wsu-gray">slug: {publication.slug}</p>
                </div>

                <p className="text-sm text-wsu-gray md:text-xs">
                  <span className="font-semibold text-wsu-gray-dark md:hidden">Updated: </span>
                  {formatPublicationDate(publication.updated_at)}
                </p>

                <p className="text-sm text-wsu-gray md:text-right md:text-xs">
                  <span className="font-semibold text-wsu-gray-dark md:hidden">Programs: </span>
                  {publication.groupCount}
                  <span className="text-wsu-gray/70"> / {publication.offeringCount}</span>
                </p>

                <div className="flex flex-wrap gap-2 md:justify-end">
                  <Link
                    href={`/admin/${publication.slug}`}
                    className="inline-flex min-w-24 items-center justify-center rounded-lg bg-wsu-gray-dark px-3 py-2 text-xs font-semibold text-white hover:bg-wsu-gray"
                  >
                    Settings
                  </Link>
                  <Link
                    href={`/s/${publication.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-w-24 items-center justify-center rounded-lg border border-wsu-gray/20 bg-white px-3 py-2 text-xs font-medium text-wsu-gray-dark hover:bg-wsu-cream"
                  >
                    Snapshot
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
