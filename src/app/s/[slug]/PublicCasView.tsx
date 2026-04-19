"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  APPLICATION_WINDOW_COLUMN,
  applicationWindowCardTitle,
  augmentDetailRowsWithApplicationWindow,
  collapseAugmentedDetailRowsByMatchingContent,
  detailTableApplicationWindowLabel,
  prependApplicationWindowColumn,
} from "@/lib/application-window-label";
import { linkifyHeroSegment } from "@/lib/hero-linkify";
import {
  filterKeysByVisibleData,
  getRecordValueCi,
  unionRowKeysWithData,
} from "@/lib/record-key";
import { sanitizeBrandingHtml } from "@/lib/sanitize-branding-html";
import type {
  CasOffering,
  ProgramBranding,
  PublicProgramGroup,
  PublicPublicationPayload,
  TermFieldSetting,
} from "@/lib/types";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Higher score = better match for search ordering and auto-selection. */
function rankGroupForQuery(g: PublicProgramGroup, ql: string): number {
  const name = g.displayName.toLowerCase();
  const gk = g.groupKey.toLowerCase();
  let best = -1e9;
  if (name.includes(ql)) {
    let score = 2000 - name.indexOf(ql);
    if (name.startsWith(ql)) score += 400;
    try {
      if (new RegExp(`(^|[^a-z0-9])${escapeRe(ql)}`, "i").test(g.displayName)) score += 120;
    } catch {
      /* ignore */
    }
    if (!/\b(cert|certificate)\b/i.test(ql) && /\b(certificate|cert\.)\b/i.test(name)) score -= 160;
    if (/\b(master|masters|mba|ph\.?d\.|edd|doctoral|graduate)\b/i.test(name)) score += 100;
    best = Math.max(best, score);
  }
  if (gk.includes(ql)) best = Math.max(best, 600 - gk.indexOf(ql));
  return best;
}

function sortGroupsForSearch(groups: PublicProgramGroup[], rawQuery: string): PublicProgramGroup[] {
  const ql = rawQuery.trim().toLowerCase();
  if (!ql) {
    return [...groups].sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" })
    );
  }
  return [...groups]
    .filter(
      (g) => g.displayName.toLowerCase().includes(ql) || g.groupKey.toLowerCase().includes(ql)
    )
    .sort((a, b) => {
      const ra = rankGroupForQuery(a, ql);
      const rb = rankGroupForQuery(b, ql);
      if (rb !== ra) return rb - ra;
      return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
    });
}

function pickGroup(
  groups: PublicProgramGroup[],
  key: string
): PublicProgramGroup | undefined {
  return groups.find((g) => g.groupKey === key) ?? groups[0];
}

function HeroRichText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-3 text-sm leading-relaxed text-wsu-gray">
      {blocks.map((block, bi) => (
        <p key={bi} className="max-w-2xl">
          {block.split("\n").map((line, li) => (
            <Fragment key={li}>
              {li > 0 ? <br /> : null}
              {linkifyHeroSegment(line)}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}

export default function PublicCasView({
  initial,
}: {
  initial: PublicPublicationPayload;
}) {
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState(
    initial.defaultGroupKey && initial.groups.some((g) => g.groupKey === initial.defaultGroupKey)
      ? initial.defaultGroupKey
      : initial.groups[0]?.groupKey ?? ""
  );

  const filtered = useMemo(
    () => sortGroupsForSearch(initial.groups, query),
    [initial.groups, query]
  );

  useEffect(() => {
    const ql = query.trim().toLowerCase();
    if (!ql) {
      setSelectedKey((prev) =>
        initial.groups.some((g) => g.groupKey === prev)
          ? prev
          : initial.groups[0]?.groupKey ?? ""
      );
      return;
    }
    setSelectedKey(filtered[0]?.groupKey ?? "");
  }, [query, filtered, initial.groups]);

  const selected = useMemo(
    () => pickGroup(initial.groups, selectedKey),
    [initial.groups, selectedKey]
  );

  const stepProgram = (delta: number) => {
    if (filtered.length === 0) return;
    const idx = filtered.findIndex((g) => g.groupKey === selectedKey);
    const base = idx < 0 ? 0 : idx;
    const next = (base + delta + filtered.length) % filtered.length;
    setSelectedKey(filtered[next].groupKey);
  };

  const showOrg =
    initial.showOrgContent &&
    (initial.orgQuestions.length > 0 || initial.orgAnswers.length > 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 lg:max-w-[88rem] lg:px-6">
      <header className="mb-10 rounded-xl border border-wsu-gray/10 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-wsu-crimson">
          {initial.heroEyebrow}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-wsu-gray-dark">
          {initial.title}
        </h1>
        <div className="mt-3">
          <HeroRichText text={initial.heroBody} />
        </div>
      </header>

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 text-sm font-medium text-wsu-gray-dark">
          Search
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Program name…"
            className="mt-1.5 w-full rounded-lg border border-wsu-gray/20 bg-white px-3 py-2.5 text-base text-wsu-gray-dark shadow-sm placeholder:text-wsu-gray/60 focus:border-wsu-crimson focus:outline-none focus:ring-2 focus:ring-wsu-crimson/25"
          />
        </label>
        <label className="min-w-[min(100%,280px)] flex-1 text-sm font-medium text-wsu-gray-dark">
          Program
          <div className="mt-1.5 flex gap-2">
            <select
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-wsu-gray/20 bg-white px-3 py-2.5 text-base text-wsu-gray-dark shadow-sm focus:border-wsu-crimson focus:outline-none focus:ring-2 focus:ring-wsu-crimson/25"
            >
              {filtered.map((g) => (
                <option key={g.groupKey} value={g.groupKey}>
                  {g.displayName}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label="Previous program"
              disabled={filtered.length <= 1}
              onClick={() => stepProgram(-1)}
              className="shrink-0 rounded-lg border border-wsu-gray/20 bg-white px-3 py-2.5 text-base font-semibold leading-none text-wsu-gray-dark shadow-sm hover:bg-wsu-cream/50 disabled:pointer-events-none disabled:opacity-40 focus:border-wsu-crimson focus:outline-none focus:ring-2 focus:ring-wsu-crimson/25"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next program"
              disabled={filtered.length <= 1}
              onClick={() => stepProgram(1)}
              className="shrink-0 rounded-lg border border-wsu-gray/20 bg-white px-3 py-2.5 text-base font-semibold leading-none text-wsu-gray-dark shadow-sm hover:bg-wsu-cream/50 disabled:pointer-events-none disabled:opacity-40 focus:border-wsu-crimson focus:outline-none focus:ring-2 focus:ring-wsu-crimson/25"
            >
              ›
            </button>
          </div>
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-wsu-gray/15 bg-white px-4 py-6 text-wsu-gray">
          No programs match that search.
        </p>
      ) : selected ? (
        <ProgramDetail
          group={selected}
          termFieldSettings={initial.termFieldSettings}
          showProgramIdOnPublic={initial.showProgramIdOnPublic}
          questionColumns={initial.visibleQuestionColumnKeys}
          answerColumns={initial.visibleAnswerColumnKeys}
          documentColumns={initial.visibleDocumentColumnKeys}
        />
      ) : null}

      {showOrg && (
        <section className="mt-14 rounded-xl border border-wsu-gray/10 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-wsu-gray-dark">Organization (shared)</h2>
          <p className="mt-2 text-sm leading-relaxed text-wsu-gray">
            These rows come from the Org Questions / Org Answers sheets and apply by cycle
            and organization, not by individual program.
          </p>
          {initial.orgQuestions.length > 0 && (
            <details className="mt-5 rounded-lg border border-wsu-gray/10 bg-wsu-cream/60 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-wsu-gray-dark">
                Org questions ({initial.orgQuestions.length})
              </summary>
              <TableFromRecords rows={initial.orgQuestions} />
            </details>
          )}
          {initial.orgAnswers.length > 0 && (
            <details className="mt-4 rounded-lg border border-wsu-gray/10 bg-wsu-cream/60 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-wsu-gray-dark">
                Org answers ({initial.orgAnswers.length})
              </summary>
              <TableFromRecords rows={initial.orgAnswers} />
            </details>
          )}
        </section>
      )}
    </div>
  );
}

function sectionTitle(text: string) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-widest text-wsu-crimson">
      {text}
    </h3>
  );
}

function termSettingMap(settings: TermFieldSetting[]): Map<string, TermFieldSetting> {
  return new Map(settings.map((s) => [s.key, s]));
}

function visibleTermBullets(o: CasOffering, settings: TermFieldSetting[]) {
  const map = termSettingMap(settings);
  return o.termParts
    .map((p) => {
      const s = map.get(p.key);
      const visible = s ? s.visible : true;
      if (!visible) return null;
      if (s?.show_in_heading) return null;
      const label = (s?.label ?? p.key).trim() || p.key;
      return { label, value: p.value };
    })
    .filter((x): x is { label: string; value: string } => x !== null);
}

function normalizeForComparison(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function brandingFingerprint(branding: ProgramBranding | null | undefined): string {
  if (!branding) return "missing";
  return JSON.stringify({
    status: branding.status,
    title: normalizeForComparison(branding.studentFacingTitle),
    deadline: normalizeForComparison(branding.deadlineText),
    image: normalizeForComparison(branding.headerImageUrl),
    html: normalizeForComparison(branding.instructionsHtml || branding.instructionsText),
    links: branding.links.map((link) => ({
      text: normalizeForComparison(link.text),
      href: normalizeForComparison(link.href),
    })),
  });
}

function brandingDifferenceMap(offerings: CasOffering[]): Map<string, boolean> {
  const branded = offerings.filter((offering) => offering.branding);
  const fingerprints = branded.map((offering) => brandingFingerprint(offering.branding));
  const unique = new Set(fingerprints);
  const differs = new Map<string, boolean>();
  if (unique.size <= 1) return differs;
  const counts = new Map<string, number>();
  for (const fingerprint of fingerprints) {
    counts.set(fingerprint, (counts.get(fingerprint) ?? 0) + 1);
  }
  const baseline = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  for (const offering of branded) {
    differs.set(offering.programId, brandingFingerprint(offering.branding) !== baseline);
  }
  return differs;
}

function ProgramDetail({
  group,
  termFieldSettings,
  showProgramIdOnPublic,
  questionColumns,
  answerColumns,
  documentColumns,
}: {
  group: PublicProgramGroup;
  termFieldSettings: TermFieldSetting[];
  showProgramIdOnPublic: boolean;
  questionColumns: string[];
  answerColumns: string[];
  documentColumns: string[];
}) {
  const questionsWithWindow = useMemo(() => {
    const aug = augmentDetailRowsWithApplicationWindow(
      group.questions,
      group.offerings,
      termFieldSettings
    );
    return collapseAugmentedDetailRowsByMatchingContent(aug, group.offerings, termFieldSettings);
  }, [group.questions, group.offerings, termFieldSettings]);
  const answersWithWindow = useMemo(() => {
    const aug = augmentDetailRowsWithApplicationWindow(
      group.answers,
      group.offerings,
      termFieldSettings
    );
    return collapseAugmentedDetailRowsByMatchingContent(aug, group.offerings, termFieldSettings);
  }, [group.answers, group.offerings, termFieldSettings]);
  const documentsWithWindow = useMemo(() => {
    const aug = augmentDetailRowsWithApplicationWindow(
      group.documents,
      group.offerings,
      termFieldSettings
    );
    return collapseAugmentedDetailRowsByMatchingContent(aug, group.offerings, termFieldSettings);
  }, [group.documents, group.offerings, termFieldSettings]);
  const questionColumnsWithWindow = useMemo(
    () => prependApplicationWindowColumn(questionColumns),
    [questionColumns]
  );
  const answerColumnsWithWindow = useMemo(
    () => prependApplicationWindowColumn(answerColumns),
    [answerColumns]
  );
  const documentColumnsWithWindow = useMemo(
    () => prependApplicationWindowColumn(documentColumns),
    [documentColumns]
  );
  const brandingDiffersByProgramId = useMemo(
    () => brandingDifferenceMap(group.offerings),
    [group.offerings]
  );
  const hasBrandingDifferences = [...brandingDiffersByProgramId.values()].some(Boolean);

  return (
    <article className="space-y-10 rounded-xl border border-wsu-gray/10 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-2xl font-semibold text-wsu-gray-dark">{group.displayName}</h2>
        <p className="mt-1 font-mono text-xs text-wsu-gray">Group: {group.groupKey}</p>
      </div>

      {Object.keys(group.visibleShared).length > 0 && (
        <section className="space-y-3">
          {sectionTitle("Summary")}
          <dl className="grid gap-3 sm:grid-cols-2">
            {Object.entries(group.visibleShared).map(([k, v]) => (
              <div
                key={k}
                className="rounded-lg border border-wsu-gray/10 bg-wsu-cream/40 px-3 py-3"
              >
                <dt className="text-xs font-medium text-wsu-gray">{k}</dt>
                <dd className="mt-1 text-sm text-wsu-gray-dark">{v || "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {group.offerings.length > 0 && (
        <section className="space-y-3">
          {sectionTitle("Application windows")}
          <ul className="space-y-3 text-sm text-wsu-gray-dark">
            {group.offerings.map((o) => {
              const bullets = visibleTermBullets(o, termFieldSettings);
              const titleLine = applicationWindowCardTitle(o, termFieldSettings);
              return (
                <li
                  key={o.programId}
                  className="rounded-lg border border-wsu-gray/10 bg-wsu-cream/30 px-3 py-3"
                >
                  <p className="text-base font-semibold text-wsu-gray-dark">{titleLine}</p>
                  {showProgramIdOnPublic && (
                    <p className="mt-1 text-xs text-wsu-gray">Program ID: {o.programId}</p>
                  )}
                  {bullets.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {bullets.map((b, i) => (
                        <li key={`${o.programId}-${i}`}>
                          <span className="font-medium text-wsu-gray-dark">{b.label}: </span>
                          <span className="text-wsu-gray-dark">{b.value || "—"}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {group.offerings.some((o) => o.branding) && (
        <section className="space-y-3">
          {sectionTitle("Student-facing branding")}
          <p className="text-sm text-wsu-gray">
            Branding is linked by CAS Program ID so coordinators can review the same header image
            and HTML instructions applicants see.
          </p>
          {hasBrandingDifferences ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950">
              Branding differs between application windows. Changed cards are highlighted below.
            </p>
          ) : null}
          <div className="space-y-4">
            {group.offerings.map((o) => (
              <BrandingPreviewCard
                key={`branding-${o.programId}`}
                offering={o}
                termFieldSettings={termFieldSettings}
                showProgramIdOnPublic={showProgramIdOnPublic}
                brandingDiffers={brandingDiffersByProgramId.get(o.programId) === true}
              />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        {sectionTitle("Recommendations")}
        {group.recommendationNote && (
          <p className="rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            {group.recommendationNote}
          </p>
        )}
        {group.recommendationRows && group.recommendationRows.length > 0 ? (
          <div className="space-y-4">
            {group.recommendationRows.map((row) => {
              const o = group.offerings.find(
                (x) => x.programId.trim() === row.programId.trim()
              );
              const heading = o
                ? detailTableApplicationWindowLabel(o, termFieldSettings)
                : row.windowLabel;
              return (
                <div
                  key={row.programId}
                  className="rounded-lg border border-wsu-gray/10 bg-wsu-cream/25 px-3 py-3"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-wsu-crimson">
                    Application window
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-wsu-gray-dark">{heading}</p>
                  {showProgramIdOnPublic ? (
                    <p className="mt-1 text-xs text-wsu-gray">Program ID: {row.programId}</p>
                  ) : null}
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                    {Object.entries(row.values).map(([k, v]) => (
                      <div
                        key={k}
                        className="rounded-md border border-wsu-gray/10 bg-white px-3 py-2"
                      >
                        <dt className="text-xs font-medium text-wsu-gray">{k}</dt>
                        <dd className="mt-1 text-sm text-wsu-gray-dark">{v || "—"}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })}
          </div>
        ) : group.recommendations && Object.keys(group.recommendations).length > 0 ? (
          <dl className="grid gap-3 sm:grid-cols-2">
            {Object.entries(group.recommendations).map(([k, v]) => (
              <div key={k} className="rounded-lg border border-wsu-gray/10 px-3 py-2">
                <dt className="text-xs font-medium text-wsu-gray">{k}</dt>
                <dd className="mt-1 text-sm text-wsu-gray-dark">{v || "—"}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-wsu-gray">None in export for these programs.</p>
        )}
      </section>

      <section className="space-y-3">
        {sectionTitle("Program questions")}
        {group.questions.length ? (
          <TableFromRecords
            rows={questionsWithWindow}
            columns={questionColumnsWithWindow}
            layout="stacked"
            stackedGroupByApplicationWindow
          />
        ) : (
          <p className="text-sm text-wsu-gray">None in export.</p>
        )}
      </section>

      <section className="space-y-3">
        {sectionTitle("Answers")}
        {group.answers.length ? (
          <TableFromRecords rows={answersWithWindow} columns={answerColumnsWithWindow} />
        ) : (
          <p className="text-sm text-wsu-gray">None in export.</p>
        )}
      </section>

      <section className="space-y-3">
        {sectionTitle("Documents")}
        {group.documents.length ? (
          <TableFromRecords rows={documentsWithWindow} columns={documentColumnsWithWindow} />
        ) : (
          <p className="text-sm text-wsu-gray">None in export.</p>
        )}
      </section>
    </article>
  );
}

function BrandingPreviewCard({
  offering,
  termFieldSettings,
  showProgramIdOnPublic,
  brandingDiffers,
}: {
  offering: CasOffering;
  termFieldSettings: TermFieldSetting[];
  showProgramIdOnPublic: boolean;
  brandingDiffers: boolean;
}) {
  const branding = offering.branding;
  const titleLine = applicationWindowCardTitle(offering, termFieldSettings);
  if (!branding) {
    return (
      <div className="rounded-lg border border-dashed border-wsu-gray/20 bg-wsu-cream/20 px-4 py-4">
        <p className="text-sm font-semibold text-wsu-gray-dark">{titleLine}</p>
        {showProgramIdOnPublic ? (
          <p className="mt-1 text-xs text-wsu-gray">Program ID: {offering.programId}</p>
        ) : null}
        <p className="mt-2 text-sm text-wsu-gray">No branding snapshot found for this Program ID.</p>
      </div>
    );
  }

  const safeHtml = sanitizeBrandingHtml(branding.instructionsHtml);
  const emptyShell = branding.status === "empty_shell";
  const hasHtml = safeHtml.trim().length > 0;

  return (
    <div
      className={`overflow-hidden rounded-lg border bg-white shadow-sm ${
        brandingDiffers ? "border-amber-300 ring-2 ring-amber-200" : "border-wsu-gray/10"
      }`}
    >
      <div
        className={`border-b px-4 py-3 ${
          brandingDiffers
            ? "border-amber-200 bg-amber-50"
            : "border-wsu-gray/10 bg-wsu-cream/40"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-base font-semibold text-wsu-gray-dark">{titleLine}</p>
          {brandingDiffers ? (
            <span className="rounded-full bg-amber-200 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-amber-950">
              Different branding
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-wsu-gray">
          {showProgramIdOnPublic ? <span>Program ID: {offering.programId}</span> : null}
          <span>Profile: {branding.sourceProfile}</span>
          <span>Captured: {new Date(branding.capturedAt).toLocaleString()}</span>
          <span
            className={`rounded-full px-2 py-0.5 font-semibold ${
              branding.status === "ok"
                ? "bg-emerald-100 text-emerald-800"
                : branding.status === "empty_shell"
                  ? "bg-amber-100 text-amber-900"
                  : "bg-red-100 text-red-800"
            }`}
          >
            {branding.status}
          </span>
        </div>
      </div>
      {branding.headerImageUrl ? (
        <div className="border-b border-wsu-gray/10 bg-wsu-gray-dark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={branding.headerImageUrl}
            alt=""
            className="max-h-64 w-full object-cover"
          />
        </div>
      ) : null}
      <div className="space-y-4 px-4 py-4">
        {branding.studentFacingTitle || branding.deadlineText ? (
          <div className="space-y-1">
            {branding.studentFacingTitle ? (
              <p className="text-lg font-semibold text-wsu-gray-dark">{branding.studentFacingTitle}</p>
            ) : null}
            {branding.deadlineText ? (
              <p className="text-sm font-medium text-wsu-crimson">{branding.deadlineText}</p>
            ) : null}
          </div>
        ) : null}
        {hasHtml ? (
          <div
            className="max-w-none whitespace-normal text-sm leading-relaxed text-wsu-gray-dark [&_a]:text-wsu-crimson [&_a]:underline [&_a]:decoration-wsu-crimson/30 [&_li]:ml-5 [&_li]:list-disc [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:mb-3 [&_ul]:mb-3"
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        ) : emptyShell ? (
          <p className="text-sm text-amber-900">
            This Program ID resolved to an empty branding shell during capture.
          </p>
        ) : (
          <p className="text-sm text-wsu-gray">
            No branding HTML was captured for this Program ID.
          </p>
        )}
        {branding.links.length > 0 && !hasHtml ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-wsu-gray-dark">
            {branding.links.map((link, index) => (
              <li key={`${link.href}-${index}`}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-wsu-crimson underline decoration-wsu-crimson/30"
                >
                  {link.text || link.href}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

/** Puts the most important question fields first in stacked (card) layout. */
function orderKeysForStacked(keys: string[]): string[] {
  const want = ["Application window", "Question", "Question Block", "Question Type", "Required"];
  const picked: string[] = [];
  for (const w of want) {
    const hit = keys.find((k) => k.trim().toLowerCase() === w.toLowerCase());
    if (hit && !picked.includes(hit)) picked.push(hit);
  }
  for (const k of keys) {
    if (!picked.includes(k)) picked.push(k);
  }
  return picked;
}

/** Preserve overall row order; each label’s group collects rows in first-seen label order. */
function groupRowsByApplicationWindowColumn(
  rows: Record<string, string>[],
  windowKey: string
): { label: string; rows: Record<string, string>[] }[] {
  const groups: { label: string; rows: Record<string, string>[] }[] = [];
  const indexByLabel = new Map<string, number>();
  for (const r of rows) {
    const raw = getRecordValueCi(r, windowKey) ?? "";
    const label = raw.trim() === "" ? "—" : raw.trim();
    let i = indexByLabel.get(label);
    if (i === undefined) {
      i = groups.length;
      indexByLabel.set(label, i);
      groups.push({ label, rows: [] });
    }
    groups[i].rows.push(r);
  }
  return groups;
}

function TableFromRecords({
  rows,
  columns,
  layout = "table",
  stackedGroupByApplicationWindow = false,
}: {
  rows: Record<string, string>[];
  columns?: string[];
  /** `stacked`: each CAS row is a card (label above value) — easier for long question text. */
  layout?: "table" | "stacked";
  /** When `stacked`, show one Application window header per distinct window instead of per row. */
  stackedGroupByApplicationWindow?: boolean;
}) {
  const keys = useMemo(() => {
    if (columns && columns.length > 0) {
      return filterKeysByVisibleData(rows, columns);
    }
    return unionRowKeysWithData(rows);
  }, [rows, columns]);

  const stackedKeys = useMemo(
    () => (layout === "stacked" ? orderKeysForStacked(keys) : keys),
    [layout, keys]
  );

  if (rows.length === 0) return null;
  if (keys.length === 0) {
    return (
      <p className="mt-2 text-sm text-wsu-gray">
        {columns && columns.length > 0
          ? "None of the selected columns contain values for these rows."
          : "No non-empty columns in these rows."}
      </p>
    );
  }

  if (layout === "stacked") {
    const windowColKey = stackedKeys.find(
      (k) => k.trim().toLowerCase() === APPLICATION_WINDOW_COLUMN.toLowerCase()
    );
    const innerKeys = windowColKey
      ? stackedKeys.filter(
          (k) => k.trim().toLowerCase() !== APPLICATION_WINDOW_COLUMN.toLowerCase()
        )
      : stackedKeys;
    const useWindowGroups =
      stackedGroupByApplicationWindow && Boolean(windowColKey) && rows.length > 0;
    const windowGroups = useWindowGroups
      ? groupRowsByApplicationWindowColumn(rows, windowColKey!)
      : null;

    const stackedRowBlock = (r: Record<string, string>) => (
      <dl className="space-y-3">
        {innerKeys.map((k) => {
          const raw = getRecordValueCi(r, k) ?? "";
          const isQuestion = k.trim().toLowerCase() === "question";
          return (
            <div key={k}>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-wsu-crimson">
                {k}
              </dt>
              <dd
                className={`mt-1 whitespace-pre-wrap text-wsu-gray-dark ${
                  isQuestion
                    ? "text-base font-medium leading-relaxed text-wsu-gray-dark"
                    : "text-sm leading-relaxed"
                }`}
              >
                {raw || "—"}
              </dd>
            </div>
          );
        })}
      </dl>
    );

    if (windowGroups) {
      return (
        <div className="mt-3 space-y-5">
          {windowGroups.map((g, gi) => (
            <div
              key={`${g.label}-${gi}`}
              className="overflow-hidden rounded-lg border border-wsu-gray/15 bg-white shadow-sm ring-1 ring-wsu-gray/5"
            >
              <div className="border-b border-wsu-gray/10 bg-wsu-cream/50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-wsu-crimson">
                  {APPLICATION_WINDOW_COLUMN}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-wsu-gray-dark">{g.label}</p>
              </div>
              <div className="divide-y divide-wsu-gray/10">
                {g.rows.map((r, ri) => (
                  <div key={ri} className="px-3 py-3">
                    {stackedRowBlock(r)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="mt-3 space-y-4">
        {rows.map((r, i) => (
          <div
            key={i}
            className="rounded-xl border border-wsu-gray/15 bg-white p-5 shadow-sm ring-1 ring-wsu-gray/5"
          >
            <dl className="space-y-4">
              {stackedKeys.map((k) => {
                const raw = getRecordValueCi(r, k) ?? "";
                const isQuestion = k.trim().toLowerCase() === "question";
                return (
                  <div key={k}>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-wsu-crimson">
                      {k}
                    </dt>
                    <dd
                      className={`mt-1.5 whitespace-pre-wrap text-wsu-gray-dark ${
                        isQuestion
                          ? "text-base font-medium leading-relaxed text-wsu-gray-dark"
                          : "text-sm leading-relaxed"
                      }`}
                    >
                      {raw || "—"}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-wsu-gray/15">
      <table className="min-w-full divide-y divide-wsu-gray/10 text-left text-sm">
        <thead className="bg-wsu-crimson/10 text-xs font-semibold uppercase tracking-wide text-wsu-gray-dark">
          <tr>
            {keys.map((k) => (
              <th key={k} className="whitespace-nowrap px-3 py-2.5 align-bottom">
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-wsu-gray/10 bg-white">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-wsu-cream/40">
              {keys.map((k) => (
                <td
                  key={k}
                  className="min-w-[10rem] max-w-[min(48rem,70vw)] align-top whitespace-pre-wrap px-3 py-3 text-wsu-gray-dark"
                >
                  {getRecordValueCi(r, k) ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
