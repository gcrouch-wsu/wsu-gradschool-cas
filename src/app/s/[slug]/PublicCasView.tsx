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

function valueLooksLikeHtml(s: string): boolean {
  const t = s.trim();
  return /<[a-z][\s\S]*?>/i.test(t) && t.includes("<");
}

/** Heuristic: Word/Teams/editor paste noise, not just “has a tag”. */
function messyPasteHtmlLikely(s: string): boolean {
  const low = s.toLowerCase();
  if (low.includes("startfragment") || low.includes("endfragment")) return true;
  if (low.includes("ui-provider")) return true;
  if (low.includes("mso-") || low.includes("xmlns:o")) return true;
  if (/class\s*=\s*"[^"]{160,}"/.test(s)) return true;
  if (low.includes("fui-link") || /\b___[a-z0-9]{6,}\b/i.test(s)) return true;
  return false;
}

/** Single shared recommendation row: Evaluation type → Max → Min → Minimum required (then any extras). */
function orderedRecommendationEntries(rec: Record<string, string>): {
  key: string;
  value: string;
  label: string;
}[] {
  const entries = Object.entries(rec);
  const used = new Set<string>();
  const out: { key: string; value: string; label: string }[] = [];

  const take = (pred: (k: string) => boolean, label: string) => {
    const hit = entries.find(([k]) => !used.has(k) && pred(k));
    if (hit) {
      used.add(hit[0]);
      out.push({ key: hit[0], value: hit[1], label });
    }
  };

  take((k) => k.trim().toLowerCase() === "evaluation type", "Evaluation type");
  take((k) => k.trim().toLowerCase() === "max", "Max");
  take((k) => k.trim().toLowerCase() === "min", "Min");
  take((k) => /minimum\s+required/i.test(k), "Min. required for submission");

  for (const [k, v] of entries) {
    if (!used.has(k)) out.push({ key: k, value: v, label: k });
  }
  return out;
}

function StackedFieldRow({
  fieldKey,
  raw,
  labelClassName,
}: {
  fieldKey: string;
  raw: string;
  labelClassName: string;
}) {
  const isQuestion = fieldKey.trim().toLowerCase() === "question";
  const asHtml = valueLooksLikeHtml(raw);
  const messy = asHtml && messyPasteHtmlLikely(raw);
  const safeHtml = asHtml ? sanitizeBrandingHtml(raw) : "";

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <dt className={labelClassName}>{fieldKey}</dt>
        {isQuestion && messy ? (
          <span
            className="max-w-[min(100%,22rem)] shrink-0 rounded-md border border-amber-400 bg-amber-50 px-2 py-1.5 text-left text-xs font-semibold leading-snug text-amber-950"
            title="Heavy formatting from paste or the editor"
          >
            Pasted/complex formatting — clean up the source in the CAS Configuration Portal
          </span>
        ) : null}
      </div>
      <dd
        className={`mt-1.5 text-wsu-gray-dark ${
          isQuestion
            ? "text-base font-medium leading-relaxed"
            : "text-sm leading-relaxed"
        } ${asHtml ? "" : "whitespace-pre-wrap"}`}
      >
        {asHtml ? (
          <div
            className="max-w-none whitespace-normal [&_a]:text-wsu-crimson [&_a]:underline [&_li]:ml-5 [&_li]:list-disc [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:mb-2 [&_strong]:text-wsu-gray-dark [&_ul]:mb-2"
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        ) : (
          raw || "—"
        )}
      </dd>
    </div>
  );
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

const OTHER_DEPT_LABEL = "Other";

/** Stable label for optgroup / sorting; uses CAS Department Name when present. */
function departmentGroupLabel(g: PublicProgramGroup): string {
  const d = g.departmentName?.trim();
  return d || OTHER_DEPT_LABEL;
}

function filterAndSortGroupsByQuery(
  groups: PublicProgramGroup[],
  rawQuery: string
): PublicProgramGroup[] {
  const ql = rawQuery.trim().toLowerCase();
  if (!ql) {
    return [...groups].sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" })
    );
  }
  return groups
    .filter((g) => {
      if (g.displayName.toLowerCase().includes(ql)) return true;
      if (g.groupKey.toLowerCase().includes(ql)) return true;
      if (g.departmentName?.trim().toLowerCase().includes(ql)) return true;
      return g.offerings.some((o) => o.programId.toLowerCase().includes(ql));
    })
    .sort((a, b) => {
      const ra = rankGroupForQuery(a, ql);
      const rb = rankGroupForQuery(b, ql);
      if (rb !== ra) return rb - ra;
      return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
    });
}

/** Programs in one department; optional query narrows within that department only (no query in normal mode). */
function programsInDepartmentFiltered(
  groups: PublicProgramGroup[],
  departmentLabel: string,
  rawQuery: string
): PublicProgramGroup[] {
  const inDept = groups.filter((g) => departmentGroupLabel(g) === departmentLabel);
  return filterAndSortGroupsByQuery(inDept, rawQuery);
}

/** All programs matching the query (any department). Empty query returns every program, A–Z. */
function programsMatchingGlobalQuery(
  groups: PublicProgramGroup[],
  rawQuery: string
): PublicProgramGroup[] {
  return filterAndSortGroupsByQuery(groups, rawQuery);
}

/** Ordered optgroups: department A–Z, "Other" last; programs alpha within each. */
function programsByDepartmentForSelect(groups: PublicProgramGroup[]) {
  const map = new Map<string, PublicProgramGroup[]>();
  for (const g of groups) {
    const label = departmentGroupLabel(g);
    const list = map.get(label) ?? [];
    list.push(g);
    map.set(label, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" })
    );
  }
  const labels = [...map.keys()].sort((a, b) => {
    if (a === OTHER_DEPT_LABEL) return 1;
    if (b === OTHER_DEPT_LABEL) return -1;
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });
  return labels.map((label) => ({
    label,
    groups: map.get(label) ?? [],
  }));
}

function pickGroup(
  groups: PublicProgramGroup[],
  key: string
): PublicProgramGroup | undefined {
  return groups.find((g) => g.groupKey === key) ?? groups[0];
}

function initialDeptFromGroups(groups: PublicProgramGroup[], defaultGroupKey: string): string {
  if (groups.length === 0) return OTHER_DEPT_LABEL;
  const sections = programsByDepartmentForSelect(groups);
  const labels = sections.map((s) => s.label);
  if (labels.length === 0) return OTHER_DEPT_LABEL;
  const defaultKey =
    defaultGroupKey && groups.some((g) => g.groupKey === defaultGroupKey)
      ? defaultGroupKey
      : groups[0]?.groupKey ?? "";
  const g = groups.find((x) => x.groupKey === defaultKey);
  const label = g ? departmentGroupLabel(g) : labels[0];
  return labels.includes(label) ? label : labels[0];
}

function initialProgramKeyForDept(
  groups: PublicProgramGroup[],
  defaultGroupKey: string,
  dept: string
): string {
  const list = programsInDepartmentFiltered(groups, dept, "");
  const want =
    defaultGroupKey && groups.some((g) => g.groupKey === defaultGroupKey)
      ? defaultGroupKey
      : list[0]?.groupKey ?? "";
  if (list.some((g) => g.groupKey === want)) return want;
  return list[0]?.groupKey ?? "";
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
  const defaultGk = initial.defaultGroupKey || "";
  const [selectedDept, setSelectedDept] = useState(() =>
    initialDeptFromGroups(initial.groups, defaultGk)
  );
  const [selectedKey, setSelectedKey] = useState(() =>
    initialProgramKeyForDept(initial.groups, defaultGk, initialDeptFromGroups(initial.groups, defaultGk))
  );
  const [query, setQuery] = useState("");

  const searchActive = query.trim().length > 0;

  const departmentSections = useMemo(
    () => programsByDepartmentForSelect(initial.groups),
    [initial.groups]
  );

  const visiblePrograms = useMemo(() => {
    if (searchActive) {
      return programsMatchingGlobalQuery(initial.groups, query);
    }
    return programsInDepartmentFiltered(initial.groups, selectedDept, "");
  }, [initial.groups, searchActive, selectedDept, query]);

  useEffect(() => {
    setSelectedKey((prev) =>
      visiblePrograms.some((g) => g.groupKey === prev) ? prev : visiblePrograms[0]?.groupKey ?? ""
    );
  }, [selectedDept, query, visiblePrograms]);

  useEffect(() => {
    if (!searchActive) return;
    const g =
      visiblePrograms.find((x) => x.groupKey === selectedKey) ??
      visiblePrograms[0];
    if (!g) return;
    const dept = departmentGroupLabel(g);
    setSelectedDept((d) => (d === dept ? d : dept));
  }, [searchActive, visiblePrograms, selectedKey]);

  const selected = useMemo(
    () => pickGroup(initial.groups, selectedKey),
    [initial.groups, selectedKey]
  );

  const stepProgram = (delta: number) => {
    if (visiblePrograms.length === 0) return;
    const idx = visiblePrograms.findIndex((g) => g.groupKey === selectedKey);
    const base = idx < 0 ? 0 : idx;
    const next = (base + delta + visiblePrograms.length) % visiblePrograms.length;
    setSelectedKey(visiblePrograms[next].groupKey);
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
        {initial.refreshedAt ? (
          <p className="mt-2 text-sm text-wsu-gray">
            Refreshed on{" "}
            {new Date(initial.refreshedAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        ) : null}
        <div className="mt-3">
          <HeroRichText text={initial.heroBody} />
        </div>
      </header>

      <div className="mb-8 flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
          <label className="min-w-[min(100%,260px)] flex-1 text-sm font-medium text-wsu-gray-dark">
            Department
            <select
              value={selectedDept}
              disabled={searchActive}
              title={
                searchActive
                  ? "Clear the search box to choose a department"
                  : undefined
              }
              onChange={(e) => setSelectedDept(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-wsu-gray/20 bg-white px-3 py-2.5 text-base text-wsu-gray-dark shadow-sm focus:border-wsu-crimson focus:outline-none focus:ring-2 focus:ring-wsu-crimson/25 disabled:cursor-not-allowed disabled:bg-wsu-cream/40 disabled:opacity-90"
            >
              {departmentSections.map((section) => (
                <option key={section.label} value={section.label}>
                  {section.label}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[min(100%,320px)] flex-[2] text-sm font-medium text-wsu-gray-dark">
            Program
            <div className="mt-1.5 flex gap-2">
              <select
                value={selectedKey}
                onChange={(e) => setSelectedKey(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-wsu-gray/20 bg-white px-3 py-2.5 text-base text-wsu-gray-dark shadow-sm focus:border-wsu-crimson focus:outline-none focus:ring-2 focus:ring-wsu-crimson/25"
              >
                {visiblePrograms.map((g) => (
                  <option key={g.groupKey} value={g.groupKey}>
                    {searchActive
                      ? `${g.displayName} (${departmentGroupLabel(g)})`
                      : g.displayName}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label="Previous program"
                disabled={visiblePrograms.length <= 1}
                onClick={() => stepProgram(-1)}
                className="shrink-0 rounded-lg border border-wsu-gray/20 bg-white px-3 py-2.5 text-base font-semibold leading-none text-wsu-gray-dark shadow-sm hover:bg-wsu-cream/50 disabled:pointer-events-none disabled:opacity-40 focus:border-wsu-crimson focus:outline-none focus:ring-2 focus:ring-wsu-crimson/25"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Next program"
                disabled={visiblePrograms.length <= 1}
                onClick={() => stepProgram(1)}
                className="shrink-0 rounded-lg border border-wsu-gray/20 bg-white px-3 py-2.5 text-base font-semibold leading-none text-wsu-gray-dark shadow-sm hover:bg-wsu-cream/50 disabled:pointer-events-none disabled:opacity-40 focus:border-wsu-crimson focus:outline-none focus:ring-2 focus:ring-wsu-crimson/25"
              >
                ›
              </button>
            </div>
          </label>
          <label className="min-w-0 flex-1 text-sm font-medium text-wsu-gray-dark lg:max-w-md">
            Search
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by program name, group code, or Program ID (all departments)…"
              className="mt-1.5 w-full rounded-lg border border-wsu-gray/20 bg-white px-3 py-2.5 text-base text-wsu-gray-dark shadow-sm placeholder:text-wsu-gray/60 focus:border-wsu-crimson focus:outline-none focus:ring-2 focus:ring-wsu-crimson/25"
            />
          </label>
        </div>
        {searchActive ? (
          <p className="text-xs text-wsu-gray">
            Department is set from the program you select. Clear search to pick a department first.
          </p>
        ) : null}
      </div>

      {visiblePrograms.length === 0 ? (
        <p className="rounded-lg border border-wsu-gray/15 bg-white px-4 py-6 text-wsu-gray">
          {searchActive
            ? "No programs match your search."
            : "No programs in this department."}
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

type BrandingDifferenceInfo = {
  deadlineDiffers: boolean;
  linkDiffers: boolean;
  differingInstructionLines: Set<string>;
};

const BRANDING_BLOCK_RE =
  /<(p|li|h[1-6]|blockquote|div)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
const BRANDING_LINE_BREAK_RE = /<br\s*\/?>/gi;
/** Whole block gets a left accent — avoids stacked inline yellow boxes. */
const BRANDING_DIFF_BLOCK_CLASS =
  "border-l-4 border-amber-400 bg-amber-50 pl-3 py-2 rounded-r my-1.5";

function mergeHtmlClass(attrs: string, cls: string): string {
  const a = attrs.trim();
  const m = a.match(/class\s*=\s*"([^"]*)"/i);
  if (m) {
    return a.replace(/class\s*=\s*"[^"]*"/i, `class="${m[1]} ${cls}"`);
  }
  return `${a ? `${a} ` : ""}class="${cls}"`;
}

function blockHasDifferingLine(inner: string, differingLines: Set<string>): boolean {
  for (const part of String(inner).split(BRANDING_LINE_BREAK_RE)) {
    const t = normalizeForComparison(part);
    if (t && differingLines.has(t)) return true;
  }
  return false;
}

function linksFingerprint(branding: ProgramBranding): string {
  return JSON.stringify(
    branding.links.map((link) => ({
      text: normalizeForComparison(link.text),
      href: normalizeForComparison(link.href),
    }))
  );
}

function instructionLineTextsFromHtml(html: string): string[] {
  const lines: string[] = [];
  html.replace(BRANDING_BLOCK_RE, (full, _tag, _attrs, inner) => {
    const parts = String(inner).split(BRANDING_LINE_BREAK_RE);
    for (const part of parts.length > 0 ? parts : [full]) {
      const text = normalizeForComparison(part);
      if (text) lines.push(text);
    }
    return full;
  });
  return lines;
}

function instructionLineTexts(branding: ProgramBranding): string[] {
  const safeHtml = sanitizeBrandingHtml(branding.instructionsHtml);
  const lines = instructionLineTextsFromHtml(safeHtml);
  if (lines.length > 0) return lines;
  const fallback = normalizeForComparison(branding.instructionsText || safeHtml);
  return fallback ? [fallback] : [];
}

function highlightInstructionBlocks(html: string, differingLines: Set<string>): string {
  if (differingLines.size === 0) return html;
  let applied = false;
  const next = html.replace(BRANDING_BLOCK_RE, (full, tag, attrs = "", inner) => {
    if (!blockHasDifferingLine(inner, differingLines)) return full;
    applied = true;
    const merged = mergeHtmlClass(attrs, BRANDING_DIFF_BLOCK_CLASS);
    return `<${tag}${merged}>${inner}</${tag}>`;
  });
  if (applied) return next;
  return `<div class="${BRANDING_DIFF_BLOCK_CLASS}">${html}</div>`;
}

function brandingDifferenceMap(offerings: CasOffering[]): Map<string, BrandingDifferenceInfo> {
  const branded = offerings.filter((offering) => offering.branding);
  const differs = new Map<string, BrandingDifferenceInfo>();
  if (branded.length <= 1) return differs;
  const deadlineDiffers =
    new Set(
      branded.map((offering) => normalizeForComparison(offering.branding?.deadlineText))
    ).size > 1;
  const linkDiffers =
    new Set(
      branded.map((offering) => (offering.branding ? linksFingerprint(offering.branding) : ""))
    ).size > 1;
  const countByLine = new Map<string, number>();
  for (const offering of branded) {
    if (!offering.branding) continue;
    const seenLines = new Set(instructionLineTexts(offering.branding));
    for (const line of seenLines) {
      countByLine.set(line, (countByLine.get(line) ?? 0) + 1);
    }
  }
  const mostCommonLineCount = Math.max(0, ...countByLine.values());
  const differingInstructionLines = new Set<string>();
  for (const [line, count] of countByLine.entries()) {
    if (count < mostCommonLineCount) {
      differingInstructionLines.add(line);
    }
  }
  for (const offering of branded) {
    differs.set(offering.programId, {
      deadlineDiffers,
      linkDiffers,
      differingInstructionLines,
    });
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
  const hasBrandingDifferences = [...brandingDiffersByProgramId.values()].some(
    (info) =>
      info.deadlineDiffers || info.linkDiffers || info.differingInstructionLines.size > 0
  );
  const brandingCardCount = group.offerings.filter((o) => o.branding).length;
  /** Side-by-side only when offerings list length matches branded count (no extra unbranded rows). */
  const brandingTwoColumn = brandingCardCount === 2 && group.offerings.length === 2;
  /** First row: two terms; second row: one term, same width as a single column. */
  const brandingThreeTile =
    brandingCardCount === 3 && group.offerings.length === 3;
  const brandingGrid =
    brandingTwoColumn || brandingThreeTile
      ? "grid gap-4 lg:grid-cols-2 lg:items-stretch"
      : "space-y-4";

  return (
    <article className="space-y-10 rounded-xl border border-wsu-gray/10 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-2xl font-semibold text-wsu-gray-dark">{group.displayName}</h2>
        <p className="mt-2 text-sm text-wsu-gray">
          <span className="font-medium text-wsu-gray-dark">Group code </span>
          <span className="font-mono text-xs text-wsu-gray-dark">{group.groupKey}</span>
        </p>
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
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {brandingTwoColumn ? (
                <>
                  Branding differs between these two application windows. Compare the columns
                  side by side. Paragraphs with a{" "}
                  <span className="font-semibold">gold left bar</span> differ from the other
                  window.
                </>
              ) : brandingThreeTile ? (
                <>
                  Branding differs between these application windows. Compare the grid below.
                  Paragraphs with a <span className="font-semibold">gold left bar</span> differ
                  from other windows.
                </>
              ) : (
                <>
                  Branding differs between application windows. Paragraphs with a{" "}
                  <span className="font-semibold">gold left bar</span> mark text that does not
                  match across windows.
                </>
              )}
            </p>
          ) : null}
          <div className={brandingGrid}>
            {group.offerings.map((o, index) => {
              const card = (
                <BrandingPreviewCard
                  key={`branding-${o.programId}`}
                  offering={o}
                  termFieldSettings={termFieldSettings}
                  showProgramIdOnPublic={showProgramIdOnPublic}
                  brandingDifference={brandingDiffersByProgramId.get(o.programId)}
                  fillGridCell={brandingTwoColumn || brandingThreeTile}
                />
              );
              if (brandingThreeTile && index === 2) {
                return (
                  <div
                    key={`branding-wrap-${o.programId}`}
                    className="flex justify-center lg:col-span-2"
                  >
                    <div className="w-full lg:max-w-[calc(50%-0.5rem)] lg:justify-self-center">
                      {card}
                    </div>
                  </div>
                );
              }
              return card;
            })}
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
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {orderedRecommendationEntries(group.recommendations).map(({ key, value, label }) => (
              <div
                key={key}
                className="min-w-0 rounded-lg border border-wsu-gray/10 bg-wsu-cream/25 px-3 py-2"
              >
                <dt className="text-xs font-medium text-wsu-gray" title={key !== label ? key : undefined}>
                  {label}
                </dt>
                <dd className="mt-1 break-words text-sm text-wsu-gray-dark">{value || "—"}</dd>
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
  brandingDifference,
  fillGridCell,
}: {
  offering: CasOffering;
  termFieldSettings: TermFieldSetting[];
  showProgramIdOnPublic: boolean;
  brandingDifference?: BrandingDifferenceInfo;
  /** When true, card fills grid cell (equal width/height with siblings on large screens). */
  fillGridCell?: boolean;
}) {
  const branding = offering.branding;
  const titleLine = applicationWindowCardTitle(offering, termFieldSettings);
  const gridShell =
    fillGridCell === true
      ? "flex h-full min-h-0 w-full max-w-none flex-col overflow-hidden"
      : "max-w-[800px]";
  if (!branding) {
    return (
      <div
        className={`rounded-lg border border-dashed border-wsu-gray/20 bg-wsu-cream/20 px-4 py-4 ${gridShell}`}
      >
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
  const deadlineDiffers = brandingDifference?.deadlineDiffers === true;
  const linksDiffers = brandingDifference?.linkDiffers === true;
  const differingInstructionLines =
    brandingDifference?.differingInstructionLines ?? new Set<string>();
  const highlightedHtml = highlightInstructionBlocks(safeHtml, differingInstructionLines);
  const differenceLabels = [
    deadlineDiffers ? "deadline" : "",
    differingInstructionLines.size > 0 ? "instructions" : "",
    linksDiffers ? "links" : "",
  ].filter(Boolean);

  return (
    <div
      className={`${gridShell} overflow-hidden rounded-lg border border-wsu-gray/10 bg-white shadow-sm`}
    >
      <div className="border-b border-wsu-gray/10 bg-wsu-cream/40 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-base font-semibold text-wsu-gray-dark">{titleLine}</p>
          {differenceLabels.length > 0 ? (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-950">
              Different text: {differenceLabels.join(", ")}
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
      <div className="border-b border-wsu-gray/10 bg-wsu-gray-dark">
        <div className="relative overflow-hidden bg-wsu-gray-dark">
          {branding.headerImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.headerImageUrl}
              alt=""
              className="h-auto max-h-64 w-full object-cover"
            />
          ) : (
            <div className="h-32 bg-wsu-gray-dark" />
          )}
          {branding.studentFacingTitle || branding.deadlineText ? (
            <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-3 bg-black/75 px-4 py-3 text-white">
              <p
                className="min-w-0 flex-1 truncate text-sm font-semibold"
              >
                {branding.studentFacingTitle || "Student-facing branding"}
              </p>
              {branding.deadlineText ? (
                <p
                  className={`shrink-0 text-sm font-semibold ${
                    deadlineDiffers
                      ? "border-l-4 border-amber-400 bg-amber-50 pl-2 py-1 text-amber-950"
                      : ""
                  }`}
                >
                  {branding.deadlineText}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div
        className={`space-y-4 px-4 py-4 ${fillGridCell ? "min-h-0 flex-1 overflow-auto" : ""}`}
      >
        {hasHtml ? (
          <div
            className="max-w-none whitespace-normal text-sm leading-relaxed text-wsu-gray-dark [&_a]:text-wsu-crimson [&_a]:underline [&_a]:decoration-wsu-crimson/30 [&_li]:ml-5 [&_li]:list-disc [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:mb-3 [&_ul]:mb-3"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
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
          <ul
            className={`list-disc space-y-1 pl-5 text-sm text-wsu-gray-dark ${
              linksDiffers
                ? "border-l-4 border-amber-400 bg-amber-50 py-2 pl-8"
                : ""
            }`}
          >
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
          return (
            <StackedFieldRow
              key={k}
              fieldKey={k}
              raw={raw}
              labelClassName="text-[11px] font-semibold uppercase tracking-wide text-wsu-crimson"
            />
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
                return (
                  <StackedFieldRow
                    key={k}
                    fieldKey={k}
                    raw={raw}
                    labelClassName="text-xs font-semibold uppercase tracking-wide text-wsu-crimson"
                  />
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
