"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  filterKeysByVisibleData,
  getRecordValueCi,
  unionRowKeysWithData,
} from "@/lib/record-key";
import type {
  CasOffering,
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

/** `https://`, `http://`, and `mailto:` (until whitespace). */
const LINK_SPLIT_RE = /(https?:\/\/[^\s]+|mailto:[^\s]+)/gi;

function linkifySegment(segment: string): ReactNode[] {
  const parts = segment.split(LINK_SPLIT_RE);
  return parts.map((part, i) => {
    if (/^https?:\/\//i.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-wsu-crimson underline decoration-wsu-crimson/40 underline-offset-2 hover:decoration-wsu-crimson"
        >
          {part}
        </a>
      );
    }
    if (/^mailto:/i.test(part)) {
      return (
        <a
          key={i}
          href={part}
          className="font-medium text-wsu-crimson underline decoration-wsu-crimson/40 underline-offset-2 hover:decoration-wsu-crimson"
        >
          {part}
        </a>
      );
    }
    return part;
  });
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
              {linkifySegment(line)}
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

  const showOrg =
    initial.showOrgContent &&
    (initial.orgQuestions.length > 0 || initial.orgAnswers.length > 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
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
          <select
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-wsu-gray/20 bg-white px-3 py-2.5 text-base text-wsu-gray-dark shadow-sm focus:border-wsu-crimson focus:outline-none focus:ring-2 focus:ring-wsu-crimson/25"
          >
            {filtered.map((g) => (
              <option key={g.groupKey} value={g.groupKey}>
                {g.displayName}
              </option>
            ))}
          </select>
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

function applicationWindowHeading(o: CasOffering, settings: TermFieldSetting[]): string | null {
  const partMap = new Map(o.termParts.map((p) => [p.key, p.value]));
  const segs: string[] = [];
  for (const s of settings) {
    if (!s.show_in_heading) continue;
    const v = partMap.get(s.key)?.trim();
    if (v) segs.push(v);
  }
  return segs.length > 0 ? segs.join(" · ") : null;
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
              const heading = applicationWindowHeading(o, termFieldSettings);
              const bullets = visibleTermBullets(o, termFieldSettings);
              const titleLine = heading ?? o.termLine;
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

      <section className="space-y-3">
        {sectionTitle("Recommendations")}
        {group.recommendationNote && (
          <p className="rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            {group.recommendationNote}
          </p>
        )}
        {group.recommendations && Object.keys(group.recommendations).length > 0 ? (
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
          <TableFromRecords rows={group.questions} columns={questionColumns} />
        ) : (
          <p className="text-sm text-wsu-gray">None in export.</p>
        )}
      </section>

      <section className="space-y-3">
        {sectionTitle("Answers")}
        {group.answers.length ? (
          <TableFromRecords rows={group.answers} columns={answerColumns} />
        ) : (
          <p className="text-sm text-wsu-gray">None in export.</p>
        )}
      </section>

      <section className="space-y-3">
        {sectionTitle("Documents")}
        {group.documents.length ? (
          <TableFromRecords rows={group.documents} columns={documentColumns} />
        ) : (
          <p className="text-sm text-wsu-gray">None in export.</p>
        )}
      </section>
    </article>
  );
}

function TableFromRecords({
  rows,
  columns,
}: {
  rows: Record<string, string>[];
  columns?: string[];
}) {
  const keys = useMemo(() => {
    if (columns && columns.length > 0) {
      return filterKeysByVisibleData(rows, columns);
    }
    return unionRowKeysWithData(rows);
  }, [rows, columns]);

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
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-wsu-gray/15">
      <table className="min-w-full divide-y divide-wsu-gray/10 text-left text-sm">
        <thead className="bg-wsu-crimson/10 text-xs font-semibold uppercase tracking-wide text-wsu-gray-dark">
          <tr>
            {keys.map((k) => (
              <th key={k} className="whitespace-nowrap px-3 py-2.5">
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-wsu-gray/10 bg-white">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-wsu-cream/40">
              {keys.map((k) => (
                <td key={k} className="max-w-xs whitespace-pre-wrap px-3 py-2.5 text-wsu-gray-dark">
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
