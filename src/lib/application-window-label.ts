import type { CasOffering, TermFieldSetting } from "./types";
import { cleanProgramId } from "./parse-cas";
import { getRecordValueCi } from "./record-key";

/**
 * ## Detail tables (Program questions, Answers, Documents) — row merge policy
 *
 * **Parse time (parse-cas):** Rows are kept per CAS Program ID. Dedupe keys include Program ID so
 * identical-looking Fall and Spring rows are not dropped before publish.
 *
 * **Public view (this file):** After adding the “Application window” column from Program
 * Attributes (and Start Term on the row when needed), we merge rows when:
 *
 * - **Combine:** Every column except Program ID, Application window, Start Term, and Start Year
 *   matches another row (after normalizing whitespace). That means the requirement text is the
 *   same across application windows; only term / Program ID differed.
 * - **Result:** One row with Application window set to combined terms (e.g. `Fall · 2027/Spring · 2028`
 *   or season-only `Fall/Spring` in Start Term when seasons are clear). Program ID lists both CAS
 *   IDs. Start Year is cleared when multiple programs were merged so a single year is not wrong.
 *
 * - **Keep separate:** If any compared column differs, rows stay separate so different requirements
 *   are never collapsed together.
 *
 * **Not merged here:** Summary, recommendations, org questions/answers, or the Application windows
 * card list (each offering stays its own card).
 */

/** Prepended on Questions / Answers / Documents so each row shows Fall vs Spring (etc.) first. */
export const APPLICATION_WINDOW_COLUMN = "Application window";

/** Normalize cell text so “identical” rows match despite minor whitespace differences. */
function normalizeForDetailSignature(value: string): string {
  return value
    .trim()
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/\s+/g, " ");
}

/** Start Term / Start Year from Program Attributes (case-insensitive keys on termParts). */
export function startTermYearPrimary(o: CasOffering): string | null {
  const map = new Map(
    o.termParts.map((p) => [p.key.trim().toLowerCase(), (p.value || "").trim()])
  );
  const st = map.get("start term");
  const sy = map.get("start year");
  if (st && sy) return `${st} · ${sy}`;
  if (st) return st;
  if (sy) return sy;
  return null;
}

/** Bold line segments from “In title” term fields (same logic as public application-window cards). */
export function applicationWindowHeadingText(
  o: CasOffering,
  settings: TermFieldSetting[]
): string | null {
  const partMap = new Map(o.termParts.map((p) => [p.key, p.value]));
  const segs: string[] = [];
  for (const s of settings) {
    if (!s.show_in_heading) continue;
    const v = partMap.get(s.key)?.trim();
    if (v) segs.push(v);
  }
  return segs.length > 0 ? segs.join(" · ") : null;
}

const FALLBACK_TERM_KEYS = [
  "Start Term",
  "Start Year",
  "Open Date",
  "Application Deadline",
  "Deadline",
  "Updated Date",
] as const;

/** When nothing is “In title”, still show term-like fields so Fall/Spring are visible. */
export function applicationWindowFallbackFromTermParts(o: CasOffering): string | null {
  const map = new Map(o.termParts.map((p) => [p.key, p.value]));
  const segs: string[] = [];
  for (const k of FALLBACK_TERM_KEYS) {
    const v = map.get(k)?.trim();
    if (v) segs.push(v);
  }
  if (segs.length > 0) return segs.join(" · ");
  for (const p of o.termParts) {
    if (p.key === "__summary") continue;
    const v = p.value?.trim();
    if (v) return v;
  }
  const summary = map.get("__summary")?.trim();
  if (summary) return summary;
  return null;
}

/** Full title for application-window cards (respects “In title” first, then fallbacks). */
export function applicationWindowCardTitle(
  o: CasOffering,
  settings: TermFieldSetting[]
): string {
  const fromHeading = applicationWindowHeadingText(o, settings);
  if (fromHeading) return fromHeading;
  const fromParts = applicationWindowFallbackFromTermParts(o);
  if (fromParts) return fromParts;
  const fromLine = o.termLine.trim();
  if (fromLine) return fromLine;
  const pid = cleanProgramId(o.programId);
  if (pid) return `Program ID ${pid}`;
  return "—";
}

/**
 * Label for the prepended “Application window” column on detail tables: Start Term (and year)
 * first, then the same fallbacks as the cards.
 */
export function detailTableApplicationWindowLabel(
  o: CasOffering,
  settings: TermFieldSetting[]
): string {
  const primary = startTermYearPrimary(o);
  if (primary) return primary;
  return applicationWindowCardTitle(o, settings);
}

function stripConflictingRowKeys(r: Record<string, string>): Record<string, string> {
  const out = { ...r };
  const kill = APPLICATION_WINDOW_COLUMN.toLowerCase();
  for (const k of Object.keys(out)) {
    if (k.toLowerCase() === kill) delete out[k];
  }
  return out;
}

/** When Program ID is missing or unmatched, use the row’s own Start Term / Year (CAS detail sheets). */
function labelFromRowStartFields(base: Record<string, string>): string | null {
  const st = getRecordValueCi(base, "Start Term")?.trim();
  const sy = getRecordValueCi(base, "Start Year")?.trim();
  if (st && sy) return `${st} · ${sy}`;
  if (st) return st;
  if (sy) return sy;
  return null;
}

export function augmentDetailRowsWithApplicationWindow(
  rows: Record<string, string>[],
  offerings: CasOffering[],
  settings: TermFieldSetting[]
): Record<string, string>[] {
  const byPid = new Map<string, CasOffering>();
  for (const o of offerings) {
    byPid.set(cleanProgramId(o.programId), o);
  }
  return rows.map((r) => {
    const base = stripConflictingRowKeys(r);
    const pid = programIdFromRow(base);
    const o = pid ? byPid.get(pid) : undefined;
    const label = o
      ? detailTableApplicationWindowLabel(o, settings)
      : labelFromRowStartFields(base) ?? "—";
    return { [APPLICATION_WINDOW_COLUMN]: label, ...base };
  });
}

function programIdFromRow(r: Record<string, string>): string {
  const direct = r["Program ID"] ?? r["Program Id"];
  if (typeof direct === "string" && direct.trim()) return cleanProgramId(direct);
  for (const [k, v] of Object.entries(r)) {
    if (k.trim().toLowerCase() === "program id" && typeof v === "string" && v.trim()) {
      return cleanProgramId(v);
    }
  }
  return "";
}

/** Stable signature for “same requirement text” across Program IDs / terms. */
function detailRowContentSignature(row: Record<string, string>): string {
  const entries = Object.entries(row)
    .filter(([k]) => {
      const kl = k.trim().toLowerCase();
      if (kl === "program id") return false;
      if (kl === APPLICATION_WINDOW_COLUMN.toLowerCase()) return false;
      /** Same prompt across Fall/Spring should merge; term is carried in Application window. */
      if (kl === "start term" || kl === "start year") return false;
      return true;
    })
    .map(([k, v]) => [k, normalizeForDetailSignature(v ?? "")] as const)
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return JSON.stringify(entries);
}

/** Fall before Spring for combined labels like Fall/Spring. */
function seasonSortRank(s: string): number {
  const l = s.toLowerCase();
  if (l.includes("fall")) return 0;
  if (l.includes("spring")) return 1;
  if (l.includes("summer")) return 2;
  if (l.includes("winter")) return 3;
  return 99;
}

function distinctSortedTermLabels(labels: string[]): string {
  const u = [...new Set(labels.map((x) => x.trim()).filter(Boolean))];
  if (u.length === 0) return "";
  u.sort((a, b) => seasonSortRank(a) - seasonSortRank(b) || a.localeCompare(b, undefined, { sensitivity: "base" }));
  return u.join("/");
}

/** First matching season word for short labels like Fall/Spring. */
function primarySeasonFromLabel(label: string): string | null {
  const l = label.toLowerCase();
  if (l.includes("fall")) return "Fall";
  if (l.includes("spring")) return "Spring";
  if (l.includes("summer")) return "Summer";
  if (l.includes("winter")) return "Winter";
  return null;
}

/** e.g. Fall · 2027 + Spring · 2028 → Fall/Spring; single season → that word only. */
function shortSlashSeasonsFromTermLabels(labels: string[]): string | null {
  const seasons: string[] = [];
  for (const lab of labels) {
    const s = primarySeasonFromLabel(lab);
    if (s && !seasons.includes(s)) seasons.push(s);
  }
  if (seasons.length === 0) return null;
  seasons.sort((a, b) => seasonSortRank(a) - seasonSortRank(b));
  return seasons.join("/");
}

function setCellCi(row: Record<string, string>, fieldLower: string, value: string): void {
  const key = Object.keys(row).find((k) => k.trim().toLowerCase() === fieldLower);
  if (key) row[key] = value;
}

function mergeAugmentedRowBucket(
  bucket: Record<string, string>[],
  byPid: Map<string, CasOffering>,
  settings: TermFieldSetting[]
): Record<string, string> {
  const template = { ...bucket[0] };
  const pids: string[] = [];
  for (const r of bucket) {
    const p = programIdFromRow(r);
    if (p && !pids.includes(p)) pids.push(p);
  }
  const termLabels: string[] = [];
  for (const pid of pids) {
    const o = byPid.get(pid);
    if (!o) continue;
    const t = startTermYearPrimary(o);
    if (t) termLabels.push(t);
  }
  let windowLabel = distinctSortedTermLabels(termLabels);
  if (!windowLabel) {
    const fromCol = bucket.map((r) => r[APPLICATION_WINDOW_COLUMN]).find((x) => x && x.trim() !== "—");
    windowLabel = fromCol?.trim() || "—";
  }
  template[APPLICATION_WINDOW_COLUMN] = windowLabel;
  template["Program ID"] = pids.join(", ");

  const slash = shortSlashSeasonsFromTermLabels(termLabels);
  if (slash) setCellCi(template, "start term", slash);
  else if (windowLabel && windowLabel !== "—") setCellCi(template, "start term", windowLabel);
  if (pids.length > 1) setCellCi(template, "start year", "");

  return template;
}

function refreshAugmentedRowWindow(
  row: Record<string, string>,
  byPid: Map<string, CasOffering>,
  settings: TermFieldSetting[]
): Record<string, string> {
  const pid = programIdFromRow(row);
  const o = pid ? byPid.get(pid) : undefined;
  const label = o ? detailTableApplicationWindowLabel(o, settings) : row[APPLICATION_WINDOW_COLUMN] || "—";
  return { ...row, [APPLICATION_WINDOW_COLUMN]: label };
}

/**
 * After {@link augmentDetailRowsWithApplicationWindow}, merges **Program questions**, **Answers**,
 * and **Documents** rows the same way. See file-top policy comment.
 */
export function collapseAugmentedDetailRowsByMatchingContent(
  rows: Record<string, string>[],
  offerings: CasOffering[],
  settings: TermFieldSetting[]
): Record<string, string>[] {
  if (rows.length === 0) return rows;
  const byPid = new Map<string, CasOffering>();
  for (const o of offerings) {
    byPid.set(cleanProgramId(o.programId), o);
  }
  const sigOrder: string[] = [];
  const buckets = new Map<string, Record<string, string>[]>();
  for (const r of rows) {
    const sig = detailRowContentSignature(r);
    if (!buckets.has(sig)) {
      sigOrder.push(sig);
      buckets.set(sig, []);
    }
    buckets.get(sig)!.push(r);
  }
  const out: Record<string, string>[] = [];
  for (const sig of sigOrder) {
    const bucket = buckets.get(sig)!;
    if (bucket.length === 1) {
      out.push(refreshAugmentedRowWindow(bucket[0], byPid, settings));
    } else {
      out.push(mergeAugmentedRowBucket(bucket, byPid, settings));
    }
  }
  return out;
}

export function prependApplicationWindowColumn(columns: string[]): string[] {
  const rest = columns.filter((c) => c !== APPLICATION_WINDOW_COLUMN);
  return [APPLICATION_WINDOW_COLUMN, ...rest];
}
