"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AdminSignOutButton } from "@/components/AdminSignOutButton";

/** Vercel Hobby / many hosts reject multipart bodies above ~4.5MB. */
const LARGE_COMBINED_BYTES = 4.45 * 1024 * 1024;

export default function AdminNewPublicationPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [settingsFile, setSettingsFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const combinedBytes = useMemo(
    () => files.reduce((n, f) => n + (f.size || 0), 0),
    [files]
  );
  const largeCombined = combinedBytes > LARGE_COMBINED_BYTES;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (files.length === 0) {
      setError("Choose at least one Excel file.");
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      files.forEach((f, i) => {
        fd.append(`cas_${i}`, f, f.name);
      });
      if (title.trim()) fd.set("title", title.trim());
      if (settingsFile) fd.append("publication_settings", settingsFile, settingsFile.name);
      const res = await fetch("/api/admin/publications", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const raw = await res.text();
      let body: {
        error?: string;
        slug?: string;
        settingsImportError?: string;
        droppedDefaultGroupKey?: boolean;
      } = {};
      try {
        if (raw.trim()) body = JSON.parse(raw) as typeof body;
      } catch {
        setError(
          `Upload failed (HTTP ${res.status}). The server did not return JSON — often the combined files are too large for one request (many hosts limit near 4.5MB) or the request timed out.` +
            (raw.trim() ? ` Raw response: ${raw.slice(0, 400)}` : "")
        );
        return;
      }
      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      if (!res.ok) {
        setError(
          body.error ??
            `Upload failed (${res.status}). If both workbooks are large, try one file now, then use “Merge workbook” on the next screen.`
        );
        return;
      }
      if (body.slug) {
        if (body.settingsImportError) {
          try {
            sessionStorage.setItem(`adminSettingsImportError:${body.slug}`, body.settingsImportError);
          } catch {
            /* ignore */
          }
        }
        if (body.droppedDefaultGroupKey) {
          try {
            sessionStorage.setItem(`adminSettingsImportDroppedDefault:${body.slug}`, "1");
          } catch {
            /* ignore */
          }
        }
        router.push(`/admin/${body.slug}`);
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not reach the server. Check your connection, or try a smaller upload first."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-wsu-gray">
            <Link
              href="/admin"
              className="font-medium text-wsu-crimson underline decoration-wsu-crimson/30 hover:decoration-wsu-crimson"
            >
              ← Admin home
            </Link>
          </p>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-wsu-gray-dark">
            Publish new CAS export
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-wsu-gray">
            Pick one workbook, or select two separate exports (for example EngineeringCAS and
            GradCAS) in one go. The server reads each file and combines them into one
            publication — you do not need to merge the spreadsheets yourself.
          </p>
        </div>
        <AdminSignOutButton />
      </div>

      <form
        onSubmit={onSubmit}
        className="rounded-2xl border border-wsu-gray/10 bg-white p-6 shadow-sm"
      >
        <div>
          <span className="text-sm font-semibold text-wsu-gray-dark">
            CAS Excel workbooks (.xlsx)
          </span>
          <p className="mt-1 text-xs leading-relaxed text-wsu-gray">
            In the file dialog, select multiple files at once: hold{" "}
            <kbd className="rounded border border-wsu-gray/25 bg-wsu-cream px-1 font-mono text-[10px] text-wsu-gray-dark">
              Ctrl
            </kbd>{" "}
            (Windows) or{" "}
            <kbd className="rounded border border-wsu-gray/25 bg-wsu-cream px-1 font-mono text-[10px] text-wsu-gray-dark">
              Cmd
            </kbd>{" "}
            (Mac) while clicking each workbook. The first file you click is merged first when the
            two exports disagree on a detail.
          </p>
          <label className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-wsu-gray/25 bg-wsu-cream/50 px-4 py-12 transition hover:border-wsu-crimson/40 hover:bg-wsu-crimson/[0.04]">
            <span className="text-center text-sm text-wsu-gray">
              {files.length > 0 ? (
                <span className="block max-w-full">
                  <span className="font-medium text-wsu-gray-dark">
                    {files.length} file{files.length === 1 ? "" : "s"} selected
                  </span>
                  <ul className="mt-2 max-h-32 list-inside list-disc overflow-y-auto text-left text-xs text-wsu-gray-dark">
                    {files.map((f) => (
                      <li key={`${f.name}-${f.size}-${f.lastModified}`} className="truncate">
                        {f.name}
                      </li>
                    ))}
                  </ul>
                </span>
              ) : (
                <>
                  <span className="font-medium text-wsu-gray-dark">Click to choose file(s)</span>
                  <span className="mt-1 block text-xs text-wsu-gray">
                    One file, or multiple .xlsx (e.g. EngineeringCAS + GradCAS)
                  </span>
                </>
              )}
            </span>
            <input
              type="file"
              multiple
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className="sr-only"
            />
          </label>
          {files.length > 0 && (
            <button
              type="button"
              className="mt-2 text-xs font-medium text-wsu-crimson underline decoration-wsu-crimson/30 hover:decoration-wsu-crimson"
              onClick={() => setFiles([])}
            >
              Clear selection
            </button>
          )}
          {largeCombined && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950">
              Combined size is about {(combinedBytes / (1024 * 1024)).toFixed(1)}MB. One request
              may be rejected (many hosts cap near 4.5MB). If upload fails, publish one workbook
              first, then on the next screen use Merge workbook for the second file.
            </p>
          )}
        </div>

        <div className="mt-6">
          <span className="text-sm font-semibold text-wsu-gray-dark">
            Settings JSON (optional)
          </span>
          <p className="mt-1 text-xs leading-relaxed text-wsu-gray">
            Use a{" "}
            <span className="font-mono text-wsu-gray-dark">cas-publication-settings-….json</span>{" "}
            export to copy columns, headers, and layout from a previous publication. Applied after
            the workbooks are parsed; invalid keys for this data are dropped.
          </p>
          <label className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-wsu-gray/20 bg-wsu-cream/30 px-4 py-6 transition hover:border-wsu-crimson/30">
            <span className="text-center text-sm text-wsu-gray">
              {settingsFile ? (
                <span className="font-mono text-xs text-wsu-gray-dark">{settingsFile.name}</span>
              ) : (
                <>
                  <span className="font-medium text-wsu-gray-dark">Click to choose .json</span>
                  <span className="mt-1 block text-xs text-wsu-gray">Optional</span>
                </>
              )}
            </span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => setSettingsFile(e.target.files?.[0] ?? null)}
              className="sr-only"
            />
          </label>
          {settingsFile && (
            <button
              type="button"
              className="mt-2 text-xs font-medium text-wsu-crimson underline decoration-wsu-crimson/30 hover:decoration-wsu-crimson"
              onClick={() => setSettingsFile(null)}
            >
              Remove settings file
            </button>
          )}
        </div>

        <label className="mt-6 block text-sm font-medium text-wsu-gray-dark">
          Title (optional)
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Engineering & Graduate CAS — 2026"
            className="mt-1.5 w-full rounded-lg border border-wsu-gray/20 px-3 py-2.5 text-wsu-gray-dark shadow-inner placeholder:text-wsu-gray/50 focus:border-wsu-crimson focus:outline-none focus:ring-2 focus:ring-wsu-crimson/20"
          />
        </label>

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || files.length === 0}
          className="mt-8 w-full rounded-xl bg-wsu-crimson px-6 py-4 text-lg font-semibold text-white shadow-lg shadow-wsu-crimson/25 ring-2 ring-wsu-crimson/20 transition hover:bg-wsu-crimson-dark hover:ring-wsu-crimson/30 disabled:pointer-events-none disabled:opacity-40"
        >
          {loading
            ? files.length > 1
              ? "Uploading and combining…"
              : "Uploading…"
            : files.length > 1
              ? "Upload and combine workbooks"
              : "Upload & continue"}
        </button>
        {files.length === 0 && (
          <p className="mt-3 text-center text-xs text-wsu-gray">Select at least one file to enable upload.</p>
        )}
      </form>
    </div>
  );
}
