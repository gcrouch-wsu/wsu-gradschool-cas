"use client";

import { upload } from "@vercel/blob/client";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PROGRAM_NAME_STRIP_COMMA_AND_REST,
  PROGRAM_NAME_STRIP_COMMA_AND_REST_ALIAS,
  PROGRAM_NAME_STRIP_SPACED_DASH_AND_REST,
} from "@/lib/program-display";
import type { TermFieldSetting } from "@/lib/types";

type ConfigResponse = {
  slug: string;
  title: string;
  visibleColumnKeys: string[];
  defaultGroupKey: string;
  showOrgOnPublic: boolean;
  summaryColumnOptions: string[];
  questionColumnOptions: string[];
  answerColumnOptions: string[];
  documentColumnOptions: string[];
  visibleQuestionColumns: string[];
  visibleAnswerColumns: string[];
  visibleDocumentColumns: string[];
  termFieldSettings: TermFieldSetting[];
  showProgramIdOnPublic: boolean;
  publicHeaderTitle: string;
  publicHeaderSubtitle: string;
  publicHeaderLogoUrl: string;
  publicHeaderTitleHref: string;
  publicHeroEyebrow: string;
  publicHeroBody: string;
  programDisplayNameStripSuffixes: string[];
  groupKeys: { key: string; label: string }[];
  sourceFileName: string;
};

function parseProgramStripLines(s: string): string[] {
  return s
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 100);
}

function programStripListsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function sortedKeysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function termPayloadEqual(a: TermFieldSetting[], b: TermFieldSetting[]): boolean {
  const norm = (x: TermFieldSetting[]) =>
    [...x]
      .sort((p, q) => p.key.localeCompare(q.key))
      .map((t) => ({
        key: t.key,
        label: t.label,
        visible: t.visible,
        show_in_heading: t.show_in_heading === true,
      }));
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

export default function AdminPublicationPage() {
  const params = useParams();
  const router = useRouter();
  const slug = typeof params.slug === "string" ? params.slug : "";
  const [saved, setSaved] = useState<ConfigResponse | null>(null);
  const [draftColumns, setDraftColumns] = useState<string[]>([]);
  const [draftDefault, setDraftDefault] = useState("");
  const [draftShowOrg, setDraftShowOrg] = useState(true);
  const [draftQuestionCols, setDraftQuestionCols] = useState<string[]>([]);
  const [draftAnswerCols, setDraftAnswerCols] = useState<string[]>([]);
  const [draftDocumentCols, setDraftDocumentCols] = useState<string[]>([]);
  const [draftTermSettings, setDraftTermSettings] = useState<TermFieldSetting[]>([]);
  const [draftShowProgramId, setDraftShowProgramId] = useState(false);
  const [draftPublicHeaderTitle, setDraftPublicHeaderTitle] = useState("");
  const [draftPublicHeaderSubtitle, setDraftPublicHeaderSubtitle] = useState("");
  const [draftPublicHeaderLogoUrl, setDraftPublicHeaderLogoUrl] = useState("");
  const [draftPublicHeaderTitleHref, setDraftPublicHeaderTitleHref] = useState("");
  const [draftPublicHeroEyebrow, setDraftPublicHeroEyebrow] = useState("");
  const [draftPublicHeroBody, setDraftPublicHeroBody] = useState("");
  const [draftProgramStripText, setDraftProgramStripText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mergeFile, setMergeFile] = useState<File | null>(null);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergeMessage, setMergeMessage] = useState<string | null>(null);
  const [settingsImportBusy, setSettingsImportBusy] = useState(false);
  const [settingsImportMessage, setSettingsImportMessage] = useState<string | null>(null);

  const applyConfig = useCallback((c: ConfigResponse) => {
    setSaved(c);
    setDraftColumns([...c.visibleColumnKeys]);
    setDraftDefault(c.defaultGroupKey);
    setDraftShowOrg(c.showOrgOnPublic);
    setDraftQuestionCols([...c.visibleQuestionColumns]);
    setDraftAnswerCols([...c.visibleAnswerColumns]);
    setDraftDocumentCols([...c.visibleDocumentColumns]);
    setDraftTermSettings(c.termFieldSettings.map((t) => ({ ...t })));
    setDraftShowProgramId(c.showProgramIdOnPublic);
    setDraftPublicHeaderTitle(c.publicHeaderTitle);
    setDraftPublicHeaderSubtitle(c.publicHeaderSubtitle);
    setDraftPublicHeaderLogoUrl(c.publicHeaderLogoUrl);
    setDraftPublicHeaderTitleHref(c.publicHeaderTitleHref);
    setDraftPublicHeroEyebrow(c.publicHeroEyebrow);
    setDraftPublicHeroBody(c.publicHeroBody);
    setDraftProgramStripText(c.programDisplayNameStripSuffixes.join("\n"));
  }, []);

  const loadConfig = useCallback(async () => {
    if (!slug) return;
    setError(null);
    setSaveMessage(null);
    const res = await fetch(`/api/admin/publications/${slug}`, { credentials: "include" });
    if (res.status === 401) {
      router.push(`/admin/login?next=${encodeURIComponent(`/admin/${slug}`)}`);
      return;
    }
    const raw = await res.text();
    let body: Record<string, unknown> = {};
    try {
      if (raw.trim()) body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      setError(`Failed to load settings (HTTP ${res.status}). ${raw.slice(0, 300)}`);
      setSaved(null);
      setLoading(false);
      return;
    }
    if (!res.ok) {
      setError(typeof body.error === "string" ? body.error : "Failed to load");
      setSaved(null);
      setLoading(false);
      return;
    }
    applyConfig(body as unknown as ConfigResponse);
    setLoading(false);
  }, [slug, router, applyConfig]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const dirty = useMemo(() => {
    if (!saved) return false;
    return (
      !sortedKeysEqual(draftColumns, saved.visibleColumnKeys) ||
      draftDefault !== saved.defaultGroupKey ||
      draftShowOrg !== saved.showOrgOnPublic ||
      !sortedKeysEqual(draftQuestionCols, saved.visibleQuestionColumns) ||
      !sortedKeysEqual(draftAnswerCols, saved.visibleAnswerColumns) ||
      !sortedKeysEqual(draftDocumentCols, saved.visibleDocumentColumns) ||
      !termPayloadEqual(draftTermSettings, saved.termFieldSettings) ||
      draftShowProgramId !== saved.showProgramIdOnPublic ||
      draftPublicHeaderTitle !== saved.publicHeaderTitle ||
      draftPublicHeaderSubtitle !== saved.publicHeaderSubtitle ||
      draftPublicHeaderLogoUrl !== saved.publicHeaderLogoUrl ||
      draftPublicHeaderTitleHref !== saved.publicHeaderTitleHref ||
      draftPublicHeroEyebrow !== saved.publicHeroEyebrow ||
      draftPublicHeroBody !== saved.publicHeroBody ||
      !programStripListsEqual(
        parseProgramStripLines(draftProgramStripText),
        saved.programDisplayNameStripSuffixes
      )
    );
  }, [
    saved,
    draftColumns,
    draftDefault,
    draftShowOrg,
    draftQuestionCols,
    draftAnswerCols,
    draftDocumentCols,
    draftTermSettings,
    draftShowProgramId,
    draftPublicHeaderTitle,
    draftPublicHeaderSubtitle,
    draftPublicHeaderLogoUrl,
    draftPublicHeaderTitleHref,
    draftPublicHeroEyebrow,
    draftPublicHeroBody,
    draftProgramStripText,
  ]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    router.push("/admin/login");
    router.refresh();
  }

  async function saveAll() {
    if (!saved) return;
    setSaving(true);
    setError(null);
    setSaveMessage(null);
    try {
      const res = await fetch(`/api/admin/publications/${slug}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visibleColumnKeys: draftColumns,
          defaultGroupKey: draftDefault,
          showOrgOnPublic: draftShowOrg,
          showProgramIdOnPublic: draftShowProgramId,
          visibleQuestionColumns: draftQuestionCols,
          visibleAnswerColumns: draftAnswerCols,
          visibleDocumentColumns: draftDocumentCols,
          termFieldSettings: draftTermSettings,
          publicHeaderTitle: draftPublicHeaderTitle,
          publicHeaderSubtitle: draftPublicHeaderSubtitle,
          publicHeaderLogoUrl: draftPublicHeaderLogoUrl,
          publicHeaderTitleHref: draftPublicHeaderTitleHref,
          publicHeroEyebrow: draftPublicHeroEyebrow,
          publicHeroBody: draftPublicHeroBody,
          programDisplayNameStripSuffixes: parseProgramStripLines(draftProgramStripText),
        }),
      });
      if (res.status === 401) {
        router.push(`/admin/login?next=${encodeURIComponent(`/admin/${slug}`)}`);
        return;
      }
      const rawSave = await res.text();
      let body: Partial<ConfigResponse> & { error?: string } = {};
      try {
        if (rawSave.trim()) body = JSON.parse(rawSave) as typeof body;
      } catch {
        setError(`Save failed (HTTP ${res.status}). ${rawSave.slice(0, 300)}`);
        return;
      }
      if (!res.ok) {
        setError(body.error ?? "Save failed");
        return;
      }
      applyConfig({
        ...saved,
        visibleColumnKeys: body.visibleColumnKeys ?? saved.visibleColumnKeys,
        defaultGroupKey: body.defaultGroupKey ?? saved.defaultGroupKey,
        showOrgOnPublic:
          body.showOrgOnPublic !== undefined ? Boolean(body.showOrgOnPublic) : saved.showOrgOnPublic,
        visibleQuestionColumns: body.visibleQuestionColumns ?? saved.visibleQuestionColumns,
        visibleAnswerColumns: body.visibleAnswerColumns ?? saved.visibleAnswerColumns,
        visibleDocumentColumns: body.visibleDocumentColumns ?? saved.visibleDocumentColumns,
        termFieldSettings: body.termFieldSettings ?? saved.termFieldSettings,
        showProgramIdOnPublic:
          body.showProgramIdOnPublic !== undefined
            ? Boolean(body.showProgramIdOnPublic)
            : saved.showProgramIdOnPublic,
        publicHeaderTitle: body.publicHeaderTitle ?? saved.publicHeaderTitle,
        publicHeaderSubtitle: body.publicHeaderSubtitle ?? saved.publicHeaderSubtitle,
        publicHeaderLogoUrl: body.publicHeaderLogoUrl ?? saved.publicHeaderLogoUrl,
        publicHeaderTitleHref: body.publicHeaderTitleHref ?? saved.publicHeaderTitleHref,
        publicHeroEyebrow: body.publicHeroEyebrow ?? saved.publicHeroEyebrow,
        publicHeroBody: body.publicHeroBody ?? saved.publicHeroBody,
        programDisplayNameStripSuffixes:
          body.programDisplayNameStripSuffixes ?? saved.programDisplayNameStripSuffixes,
      });
      setSaveMessage("Saved. Public page now uses these settings.");
      window.setTimeout(() => setSaveMessage(null), 5000);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function mergeUpload() {
    if (!mergeFile) {
      setMergeMessage("Choose a workbook to merge.");
      return;
    }
    setMergeBusy(true);
    setMergeMessage(null);
    setError(null);
    try {
      const pathname = `cas-merge-staging/${slug}/${crypto.randomUUID()}.xlsx`;
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      let blobResult;
      try {
        blobResult = await upload(pathname, mergeFile, {
          access: "private",
          handleUploadUrl: `${origin}/api/admin/merge-workbook-token`,
          clientPayload: JSON.stringify({ slug }),
          multipart: mergeFile.size > 4 * 1024 * 1024,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Direct upload failed";
        setError(
          `${msg} Large workbooks are sent straight to Blob storage (not through the small server upload limit). Try again, or sign out and back in.`
        );
        return;
      }

      const res = await fetch(`/api/admin/publications/${slug}/merge`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pathname: blobResult.pathname,
          sourceFileName: mergeFile.name,
        }),
      });
      const rawMerge = await res.text();
      let body: { error?: string; sourceFileName?: string } = {};
      try {
        if (rawMerge.trim()) body = JSON.parse(rawMerge) as typeof body;
      } catch {
        setError(`Merge failed (HTTP ${res.status}). ${rawMerge.slice(0, 400)}`);
        return;
      }
      if (res.status === 401) {
        router.push(`/admin/login?next=${encodeURIComponent(`/admin/${slug}`)}`);
        return;
      }
      if (!res.ok) {
        setError(body.error ?? "Merge failed");
        return;
      }
      setMergeFile(null);
      setMergeMessage(
        body.sourceFileName
          ? `Merged. Combined source label: ${body.sourceFileName}`
          : "Merged successfully."
      );
      await loadConfig();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error during merge");
    } finally {
      setMergeBusy(false);
    }
  }

  async function downloadSettingsExport() {
    if (!slug) return;
    setError(null);
    setSettingsImportMessage(null);
    const res = await fetch(`/api/admin/publications/${slug}/settings-export`, {
      credentials: "include",
    });
    if (res.status === 401) {
      router.push(`/admin/login?next=${encodeURIComponent(`/admin/${slug}`)}`);
      return;
    }
    if (!res.ok) {
      const t = await res.text();
      setError(t.slice(0, 400));
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cas-publication-settings-${slug}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setSaveMessage("Downloaded settings JSON.");
    window.setTimeout(() => setSaveMessage(null), 5000);
  }

  async function onSettingsImportChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !slug) return;
    setSettingsImportBusy(true);
    setError(null);
    setSettingsImportMessage(null);
    try {
      const text = await file.text();
      let json: unknown;
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        setError("That file is not valid JSON.");
        return;
      }
      const res = await fetch(`/api/admin/publications/${slug}/settings-import`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      if (res.status === 401) {
        router.push(`/admin/login?next=${encodeURIComponent(`/admin/${slug}`)}`);
        return;
      }
      const raw = await res.text();
      let parsed: { error?: string; details?: unknown; droppedDefaultGroupKey?: boolean } = {};
      try {
        if (raw.trim()) parsed = JSON.parse(raw) as typeof parsed;
      } catch {
        setError(`Import failed (HTTP ${res.status}). ${raw.slice(0, 400)}`);
        return;
      }
      if (!res.ok) {
        setError(parsed.error ?? "Import failed");
        return;
      }
      await loadConfig();
      setSettingsImportMessage(
        parsed.droppedDefaultGroupKey
          ? "Imported settings. The previous default program was not in this workbook, so the default program was left as-is."
          : "Imported settings from JSON."
      );
    } catch {
      setError("Could not read that file.");
    } finally {
      setSettingsImportBusy(false);
    }
  }

  function discard() {
    if (!saved) return;
    setDraftColumns([...saved.visibleColumnKeys]);
    setDraftDefault(saved.defaultGroupKey);
    setDraftShowOrg(saved.showOrgOnPublic);
    setDraftQuestionCols([...saved.visibleQuestionColumns]);
    setDraftAnswerCols([...saved.visibleAnswerColumns]);
    setDraftDocumentCols([...saved.visibleDocumentColumns]);
    setDraftTermSettings(saved.termFieldSettings.map((t) => ({ ...t })));
    setDraftShowProgramId(saved.showProgramIdOnPublic);
    setDraftPublicHeaderTitle(saved.publicHeaderTitle);
    setDraftPublicHeaderSubtitle(saved.publicHeaderSubtitle);
    setDraftPublicHeaderLogoUrl(saved.publicHeaderLogoUrl);
    setDraftPublicHeaderTitleHref(saved.publicHeaderTitleHref);
    setDraftPublicHeroEyebrow(saved.publicHeroEyebrow);
    setDraftPublicHeroBody(saved.publicHeroBody);
    setDraftProgramStripText(saved.programDisplayNameStripSuffixes.join("\n"));
    setSaveMessage(null);
  }

  function toggleColumn(key: string) {
    setDraftColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return [...next];
    });
  }

  function toggleDetailColumn(setter: React.Dispatch<React.SetStateAction<string[]>>, key: string) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return [...next];
    });
  }

  function setTermLabel(key: string, label: string) {
    setDraftTermSettings((prev) =>
      prev.map((t) => (t.key === key ? { ...t, label } : t))
    );
  }

  function setTermVisible(key: string, visible: boolean) {
    setDraftTermSettings((prev) =>
      prev.map((t) => (t.key === key ? { ...t, visible } : t))
    );
  }

  function setTermHeading(key: string, show_in_heading: boolean) {
    setDraftTermSettings((prev) =>
      prev.map((t) => (t.key === key ? { ...t, show_in_heading } : t))
    );
  }

  const publicPath = "/view";
  const snapshotPath = `/s/${slug}`;

  if (!slug) {
    return <p className="p-6 text-sm text-wsu-gray">Invalid publication.</p>;
  }

  if (loading && !saved) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-wsu-gray">
        Loading publication…
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-3xl px-4 pb-28 pt-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-wsu-gray/15 pb-6">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="rounded-md px-2 py-1 text-wsu-gray hover:bg-wsu-crimson/5 hover:text-wsu-crimson"
          >
            ← New upload
          </button>
          <span className="text-wsu-gray/40">|</span>
          <a
            href={publicPath}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md px-2 py-1 font-medium text-wsu-crimson hover:bg-wsu-crimson/5"
          >
            Open live public page ↗
          </a>
          <a
            href={snapshotPath}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md px-2 py-1 font-medium text-wsu-gray hover:bg-wsu-crimson/5 hover:text-wsu-crimson"
          >
            Open snapshot ↗
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void saveAll()}
            disabled={!dirty || saving || !saved}
            className="rounded-lg bg-wsu-crimson px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-wsu-crimson-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="text-sm text-wsu-gray underline decoration-wsu-gray/30 hover:text-wsu-crimson"
          >
            Sign out
          </button>
        </div>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight text-wsu-gray-dark">
        Publication settings
      </h1>
      <p className="mt-1 font-mono text-xs text-wsu-gray">slug: {slug}</p>
      <p className="mt-2 text-sm text-wsu-gray">
        Live public URL:{" "}
        <a
          href={publicPath}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-wsu-crimson underline decoration-wsu-crimson/30"
        >
          {publicPath}
        </a>
        {" "}updates whenever you save this publication.
      </p>
      <p className="mt-1 text-xs text-wsu-gray">
        Snapshot URL:{" "}
        <a
          href={snapshotPath}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-wsu-gray-dark underline decoration-wsu-gray/30"
        >
          {snapshotPath}
        </a>
      </p>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}
      {saveMessage && (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {saveMessage}
        </p>
      )}
      {settingsImportMessage && (
        <p className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          {settingsImportMessage}
        </p>
      )}

      {saved && (
        <div className="mt-8 space-y-10">
          <section className="rounded-xl border border-wsu-gray/15 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-wsu-gray">
              Settings JSON (backup &amp; restore)
            </h2>
            <p className="mt-2 text-sm text-wsu-gray">
              Export everything below (columns, term lines, public header/hero, program-name
              suffixes, publication title) except the CAS workbook. After a{" "}
              <strong className="text-wsu-gray-dark">new upload</strong> creates a new publication,
              open its admin page and import the same JSON to reapply your layout — column keys that
              do not exist in the new file are dropped automatically.
            </p>
            <p className="mt-2 text-sm text-wsu-gray">
              <strong className="text-wsu-gray-dark">Where is the JSON?</strong> The app does not
              keep a copy on the server. Use <strong className="text-wsu-gray-dark">Download
              settings JSON</strong> first — your browser saves a file (usually{" "}
              <code className="rounded bg-wsu-cream px-1 font-mono text-xs">
                cas-publication-settings-… .json
              </code>{" "}
              in your <strong className="text-wsu-gray-dark">Downloads</strong> folder, or wherever
              you choose in the save dialog). <strong className="text-wsu-gray-dark">Import
              settings JSON</strong> then asks you to pick that file from your computer; there is
              no URL or server path to type in.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={settingsImportBusy}
                onClick={() => void downloadSettingsExport()}
                className="rounded-lg border border-wsu-gray/25 bg-white px-4 py-2.5 text-sm font-semibold text-wsu-gray-dark shadow-sm hover:bg-wsu-cream disabled:opacity-50"
              >
                Download settings JSON
              </button>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-wsu-crimson/30 bg-wsu-crimson/10 px-4 py-2.5 text-sm font-semibold text-wsu-crimson hover:bg-wsu-crimson/20 disabled:opacity-50">
                <input
                  type="file"
                  accept=".json,application/json"
                  disabled={settingsImportBusy}
                  className="sr-only"
                  onChange={(ev) => void onSettingsImportChange(ev)}
                />
                {settingsImportBusy ? "Importing…" : "Import settings JSON"}
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-wsu-gray/15 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-wsu-gray">
              Source file(s)
            </h2>
            <p className="mt-2 text-sm text-wsu-gray-dark">{saved.sourceFileName}</p>
            <p className="mt-3 text-sm text-wsu-gray">
              Add another CAS export (for example GradCAS after EngineeringCAS). The app reads your
              second file and combines it with what is already published — you keep separate
              workbooks; nothing is pre-merged in Excel. Large files upload straight to Blob storage
              so they are not limited by the small server request cap on Vercel.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="block flex-1 text-sm font-medium text-wsu-gray-dark">
                Second workbook (.xlsx)
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  disabled={mergeBusy}
                  onChange={(e) => setMergeFile(e.target.files?.[0] ?? null)}
                  className="mt-1.5 block w-full text-sm text-wsu-gray-dark file:mr-3 file:rounded-md file:border-0 file:bg-wsu-crimson/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-wsu-crimson hover:file:bg-wsu-crimson/20"
                />
              </label>
              <button
                type="button"
                disabled={mergeBusy || !mergeFile}
                onClick={() => void mergeUpload()}
                className="rounded-lg bg-wsu-gray-dark px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-wsu-gray disabled:opacity-50"
              >
                {mergeBusy ? "Uploading and merging…" : "Add workbook to publication"}
              </button>
            </div>
            {mergeMessage && (
              <p className="mt-3 text-sm text-emerald-800">{mergeMessage}</p>
            )}
          </section>

          <section className="rounded-xl border border-wsu-gray/15 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-wsu-gray">
              Public link: header &amp; intro
            </h2>
            <p className="mt-2 text-sm text-wsu-gray">
              These settings apply only to the public viewer at{" "}
              <code className="rounded bg-wsu-cream px-1 py-0.5 font-mono text-xs text-wsu-gray-dark">
                /s/{slug}
              </code>
              . Leave a field empty to use the built-in default for that line. The publication title
              above is still edited when you upload; it appears as the large heading under the intro
              eyebrow.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-wsu-gray-dark sm:col-span-2">
                Top bar title
                <input
                  type="text"
                  value={draftPublicHeaderTitle}
                  disabled={saving}
                  onChange={(e) => setDraftPublicHeaderTitle(e.target.value)}
                  placeholder="CAS program viewer"
                  className="mt-1.5 w-full rounded-lg border border-wsu-gray/25 bg-wsu-cream px-3 py-2 text-sm text-wsu-gray-dark shadow-inner focus:border-wsu-crimson focus:outline-none focus:ring-1 focus:ring-wsu-crimson"
                />
              </label>
              <label className="block text-sm font-medium text-wsu-gray-dark sm:col-span-2">
                Top bar subtitle (e.g. institution)
                <input
                  type="text"
                  value={draftPublicHeaderSubtitle}
                  disabled={saving}
                  onChange={(e) => setDraftPublicHeaderSubtitle(e.target.value)}
                  placeholder="Washington State University"
                  className="mt-1.5 w-full rounded-lg border border-wsu-gray/25 bg-wsu-cream px-3 py-2 text-sm text-wsu-gray-dark shadow-inner focus:border-wsu-crimson focus:outline-none focus:ring-1 focus:ring-wsu-crimson"
                />
              </label>
              <label className="block text-sm font-medium text-wsu-gray-dark sm:col-span-2">
                Logo image URL (optional)
                <input
                  type="url"
                  value={draftPublicHeaderLogoUrl}
                  disabled={saving}
                  onChange={(e) => setDraftPublicHeaderLogoUrl(e.target.value)}
                  placeholder="https://…"
                  className="mt-1.5 w-full rounded-lg border border-wsu-gray/25 bg-wsu-cream px-3 py-2 text-sm text-wsu-gray-dark shadow-inner focus:border-wsu-crimson focus:outline-none focus:ring-1 focus:ring-wsu-crimson"
                />
              </label>
              <label className="block text-sm font-medium text-wsu-gray-dark sm:col-span-2">
                Top bar title link (href)
                <input
                  type="text"
                  value={draftPublicHeaderTitleHref}
                  disabled={saving}
                  onChange={(e) => setDraftPublicHeaderTitleHref(e.target.value)}
                  placeholder="/"
                  className="mt-1.5 w-full rounded-lg border border-wsu-gray/25 bg-wsu-cream px-3 py-2 text-sm text-wsu-gray-dark shadow-inner focus:border-wsu-crimson focus:outline-none focus:ring-1 focus:ring-wsu-crimson"
                />
              </label>
              <label className="block text-sm font-medium text-wsu-gray-dark sm:col-span-2">
                Intro card eyebrow (small caps line above the title)
                <input
                  type="text"
                  value={draftPublicHeroEyebrow}
                  disabled={saving}
                  onChange={(e) => setDraftPublicHeroEyebrow(e.target.value)}
                  placeholder="Program view"
                  className="mt-1.5 w-full rounded-lg border border-wsu-gray/25 bg-wsu-cream px-3 py-2 text-sm text-wsu-gray-dark shadow-inner focus:border-wsu-crimson focus:outline-none focus:ring-1 focus:ring-wsu-crimson"
                />
              </label>
              <label className="block text-sm font-medium text-wsu-gray-dark sm:col-span-2">
                Intro card body (instructions; use a blank line between paragraphs;{" "}
                <code className="font-mono text-xs">https://</code>,{" "}
                <code className="font-mono text-xs">http://</code>,{" "}
                <code className="font-mono text-xs">mailto:…</code>, and plain{" "}
                <code className="font-mono text-xs">name@school.edu</code> addresses become mail links
                on the public page — use either{" "}
                <code className="font-mono text-xs">mailto:cas.support@wsu.edu</code> or just the
                address, not both in a row)
                <textarea
                  value={draftPublicHeroBody}
                  disabled={saving}
                  onChange={(e) => setDraftPublicHeroBody(e.target.value)}
                  rows={5}
                  className="mt-1.5 w-full resize-y rounded-lg border border-wsu-gray/25 bg-wsu-cream px-3 py-2 text-sm text-wsu-gray-dark shadow-inner focus:border-wsu-crimson focus:outline-none focus:ring-1 focus:ring-wsu-crimson"
                />
              </label>
              <label className="block text-sm font-medium text-wsu-gray-dark sm:col-span-2">
                Program names on the public page: strip these suffixes from the end (one per line).
                Longer lines are tried first each pass (e.g.{" "}
                <code className="font-mono text-xs">, Online (Spring)</code> before{" "}
                <code className="font-mono text-xs">, Online</code>). Use{" "}
                <code className="font-mono text-xs">{PROGRAM_NAME_STRIP_COMMA_AND_REST}</code> or{" "}
                <code className="font-mono text-xs">{PROGRAM_NAME_STRIP_COMMA_AND_REST_ALIAS}</code>{" "}
                as its own line to drop the <strong className="text-wsu-gray-dark">first comma and
                everything after it</strong>. Use{" "}
                <code className="font-mono text-xs">{PROGRAM_NAME_STRIP_SPACED_DASH_AND_REST}</code>{" "}
                to cut at the first spaced hyphen or en dash (e.g.{" "}
                <code className="font-mono text-xs"> - </code> or{" "}
                <code className="font-mono text-xs"> – </code>) when campus/modality is separated
                that way instead of with a comma.
                <textarea
                  value={draftProgramStripText}
                  disabled={saving}
                  onChange={(e) => setDraftProgramStripText(e.target.value)}
                  rows={8}
                  spellCheck={false}
                  className="mt-1.5 w-full resize-y rounded-lg border border-wsu-gray/25 bg-wsu-cream px-3 py-2 font-mono text-xs text-wsu-gray-dark shadow-inner focus:border-wsu-crimson focus:outline-none focus:ring-1 focus:ring-wsu-crimson"
                />
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-wsu-gray/15 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-wsu-gray">
              Default program
            </h2>
            <p className="mt-2 text-sm text-wsu-gray">
              Shown first when someone opens the public link (they can still switch programs).
            </p>
            <select
              value={draftDefault}
              disabled={saving}
              onChange={(e) => setDraftDefault(e.target.value)}
              className="mt-3 w-full max-w-xl rounded-lg border border-wsu-gray/25 bg-wsu-cream px-3 py-2.5 text-sm text-wsu-gray-dark shadow-inner focus:border-wsu-crimson focus:outline-none focus:ring-1 focus:ring-wsu-crimson"
            >
              {saved.groupKeys.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label}
                </option>
              ))}
            </select>
          </section>

          <section className="rounded-xl border border-wsu-gray/15 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-wsu-gray">
              Organization content on public page
            </h2>
            <p className="mt-2 text-sm text-wsu-gray">
              Org Questions and Org Answers are shared across programs. Turn off if you do
              not want them visible on the public link.
            </p>
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-wsu-gray/15 bg-wsu-cream/80 px-4 py-3">
              <input
                type="checkbox"
                checked={draftShowOrg}
                disabled={saving}
                onChange={(e) => setDraftShowOrg(e.target.checked)}
                className="mt-1 size-4 rounded border-wsu-gray text-wsu-crimson focus:ring-wsu-crimson"
              />
              <span>
                <span className="font-medium text-wsu-gray-dark">
                  Show organization questions &amp; answers
                </span>
                <span className="mt-0.5 block text-xs text-wsu-gray">
                  Uncheck to hide org-level CAS sheets from the public view only (data stays
                  in the export).
                </span>
              </span>
            </label>
          </section>

          <section className="rounded-xl border border-wsu-gray/15 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-wsu-gray">
              Summary columns (public)
            </h2>
            <p className="mt-2 text-sm text-wsu-gray">
              Checked columns appear in the public summary for each program. Application-window
              dates are controlled separately below. Use{" "}
              <strong className="text-wsu-gray-dark">Save changes</strong> to update the live
              public page.
            </p>
            <ul className="mt-4 max-h-[28rem] space-y-1 overflow-y-auto rounded-lg border border-wsu-gray/10 bg-wsu-cream/50 p-3">
              {saved.summaryColumnOptions.map((key, idx) => (
                <li
                  key={key}
                  className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-white/80"
                >
                  <input
                    id={`col-${idx}`}
                    type="checkbox"
                    checked={draftColumns.includes(key)}
                    disabled={saving}
                    onChange={() => toggleColumn(key)}
                    className="mt-0.5 size-4 rounded border-wsu-gray text-wsu-crimson focus:ring-wsu-crimson"
                  />
                  <label htmlFor={`col-${idx}`} className="cursor-pointer text-sm text-wsu-gray-dark">
                    {key}
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-wsu-gray/15 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-wsu-gray">
              Application window lines (public)
            </h2>
            <p className="mt-2 text-sm text-wsu-gray">
              Check “In title” for each CAS column that should form the friendly line at the top of
              an application window (for example Start Term, then Start Year — order follows this
              list). “In bullets” controls the detailed list under that line. You can relabel any
              row (for example “CAS import” instead of “Open Date”).
            </p>
            <p className="mt-2 text-sm text-wsu-gray">
              The first column,{" "}
              <strong className="text-wsu-gray-dark">Application window</strong>, on the public
              Program questions, Answers, and Documents tables uses{" "}
              <strong className="text-wsu-gray-dark">Start Term</strong> (and Start Year when
              present) from Program Attributes for that row’s Program ID, then your “In title” line
              if the term is blank. When <strong className="text-wsu-gray-dark">all visible columns
              except Program ID, Start Term, and Start Year</strong> match another row (ignoring
              minor whitespace differences), those rows are <strong className="text-wsu-gray-dark">
              merged into one</strong> with a combined term label and both Program IDs listed;
              if anything differs, rows stay separate so requirements are never mixed up.
            </p>
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-wsu-gray/15 bg-wsu-cream/60 px-4 py-3">
              <input
                type="checkbox"
                checked={draftShowProgramId}
                disabled={saving}
                onChange={(e) => setDraftShowProgramId(e.target.checked)}
                className="mt-1 size-4 rounded border-wsu-gray text-wsu-crimson focus:ring-wsu-crimson"
              />
              <span className="text-sm text-wsu-gray-dark">
                Show CAS Program ID on the public page (off by default; use only if readers need
                the internal ID).
              </span>
            </label>
            <ul className="mt-4 space-y-3">
              {draftTermSettings.map((t) => (
                <li
                  key={t.key}
                  className="rounded-lg border border-wsu-gray/15 bg-wsu-cream/40 p-3"
                >
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-wsu-gray-dark">
                      <input
                        type="checkbox"
                        checked={t.visible}
                        disabled={saving}
                        onChange={(e) => setTermVisible(t.key, e.target.checked)}
                        className="size-4 rounded border-wsu-gray text-wsu-crimson focus:ring-wsu-crimson"
                      />
                      In bullets
                    </label>
                    <label className="flex items-center gap-2 text-sm text-wsu-gray-dark">
                      <input
                        type="checkbox"
                        checked={t.show_in_heading === true}
                        disabled={saving}
                        onChange={(e) => setTermHeading(t.key, e.target.checked)}
                        className="size-4 rounded border-wsu-gray text-wsu-crimson focus:ring-wsu-crimson"
                      />
                      In title
                    </label>
                    <span className="text-xs font-mono text-wsu-gray">({t.key})</span>
                  </div>
                  <label className="mt-2 block text-xs font-medium text-wsu-gray">
                    Public label
                    <input
                      type="text"
                      value={t.label}
                      disabled={saving}
                      onChange={(e) => setTermLabel(t.key, e.target.value)}
                      className="mt-1 w-full rounded-md border border-wsu-gray/20 bg-white px-2 py-1.5 text-sm text-wsu-gray-dark focus:border-wsu-crimson focus:outline-none focus:ring-1 focus:ring-wsu-crimson"
                    />
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-wsu-gray/15 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-wsu-gray">
              Program questions table (public columns)
            </h2>
            <p className="mt-2 text-sm text-wsu-gray">
              Cycle, Organization, Program, and Program ID are hidden by default because they
              repeat the summary. Turn them on if you need them in this table.
            </p>
            <ul className="mt-4 max-h-[22rem] space-y-1 overflow-y-auto rounded-lg border border-wsu-gray/10 bg-wsu-cream/50 p-3">
              {saved.questionColumnOptions.map((key, idx) => (
                <li
                  key={key}
                  className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-white/80"
                >
                  <input
                    id={`qcol-${idx}`}
                    type="checkbox"
                    checked={draftQuestionCols.includes(key)}
                    disabled={saving}
                    onChange={() => toggleDetailColumn(setDraftQuestionCols, key)}
                    className="mt-0.5 size-4 rounded border-wsu-gray text-wsu-crimson focus:ring-wsu-crimson"
                  />
                  <label htmlFor={`qcol-${idx}`} className="cursor-pointer text-sm text-wsu-gray-dark">
                    {key}
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-wsu-gray/15 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-wsu-gray">
              Answers table (public columns)
            </h2>
            <ul className="mt-4 max-h-[22rem] space-y-1 overflow-y-auto rounded-lg border border-wsu-gray/10 bg-wsu-cream/50 p-3">
              {saved.answerColumnOptions.map((key, idx) => (
                <li
                  key={key}
                  className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-white/80"
                >
                  <input
                    id={`acol-${idx}`}
                    type="checkbox"
                    checked={draftAnswerCols.includes(key)}
                    disabled={saving}
                    onChange={() => toggleDetailColumn(setDraftAnswerCols, key)}
                    className="mt-0.5 size-4 rounded border-wsu-gray text-wsu-crimson focus:ring-wsu-crimson"
                  />
                  <label htmlFor={`acol-${idx}`} className="cursor-pointer text-sm text-wsu-gray-dark">
                    {key}
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-wsu-gray/15 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-wsu-gray">
              Documents table (public columns)
            </h2>
            <ul className="mt-4 max-h-[22rem] space-y-1 overflow-y-auto rounded-lg border border-wsu-gray/10 bg-wsu-cream/50 p-3">
              {saved.documentColumnOptions.map((key, idx) => (
                <li
                  key={key}
                  className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-white/80"
                >
                  <input
                    id={`dcol-${idx}`}
                    type="checkbox"
                    checked={draftDocumentCols.includes(key)}
                    disabled={saving}
                    onChange={() => toggleDetailColumn(setDraftDocumentCols, key)}
                    className="mt-0.5 size-4 rounded border-wsu-gray text-wsu-crimson focus:ring-wsu-crimson"
                  />
                  <label htmlFor={`dcol-${idx}`} className="cursor-pointer text-sm text-wsu-gray-dark">
                    {key}
                  </label>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-wsu-gray/20 bg-white/95 px-4 py-4 shadow-[0_-8px_32px_rgba(0,0,0,0.12)] backdrop-blur-sm">
          <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-wsu-gray-dark">
              You have unsaved changes. Save to update the{" "}
              <strong className="text-wsu-crimson">public</strong> view.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={discard}
                disabled={saving}
                className="rounded-lg border border-wsu-gray/30 bg-white px-4 py-2.5 text-sm font-medium text-wsu-gray-dark hover:bg-wsu-cream disabled:opacity-50"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() => void saveAll()}
                disabled={saving}
                className="rounded-lg bg-wsu-crimson px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-wsu-crimson-dark disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
