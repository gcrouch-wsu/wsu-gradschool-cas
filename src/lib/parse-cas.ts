import * as XLSX from "xlsx";
import type {
  CasOffering,
  CasProgramGroup,
  CasPublicationData,
  TermFieldSetting,
} from "./types";
import { DEFAULT_PROGRAM_NAME_STRIP_SUFFIXES } from "./program-display";
import { getRecordValueCi } from "./record-key";
import { REDUNDANT_DETAIL_COLUMN_KEYS } from "./types";

function cellToString(v: unknown): string {
  if (v == null || v === "") return "";
  if (v instanceof Date) {
    const m = v.getUTCMonth() + 1;
    const d = v.getUTCDate();
    const y = String(v.getUTCFullYear()).slice(-2);
    return `${m}/${d}/${y}`;
  }
  return String(v).trim();
}

function normalizeRow(r: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(r)) {
    out[k.trim()] = cellToString(v);
  }
  return out;
}

function readSheet(
  wb: XLSX.WorkBook,
  name: string
): Record<string, string>[] {
  const sheet = wb.Sheets[name];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  return rows.map(normalizeRow);
}

export function cleanProgramId(pid: string): string {
  return pid.trim();
}

export function groupKey(row: Record<string, string>): string {
  const w = (row["WebAdMIT Label"] || "").trim();
  if (w) return `webadmit:${w}`;
  const code = (row["ProgramCode"] || row["Program Code"] || "").trim();
  if (code) return `code:${code}`;
  const uid = (row["Unique ID"] || "").trim();
  if (uid) return `uid:${uid}`;
  const prog = (row["Program"] || "").trim();
  const org = (row["Organization"] || "").trim();
  const cycle = (row["Cycle"] || "").trim();
  return `fallback:${org}|${prog}|${cycle}`;
}

const TERMISH = new Set(
  [
    "Start Term",
    "Start Year",
    "Open Date",
    "Deadline",
    "Application Deadline",
    "Updated Date",
  ].map((s) => s.toLowerCase())
);

function isTermishColumn(name: string): boolean {
  const l = name.toLowerCase();
  if (TERMISH.has(l)) return true;
  if (l.includes("deadline")) return true;
  if (l.includes("open date")) return true;
  return false;
}

function buildTermLine(row: Record<string, string>): string {
  const st = row["Start Term"] || "";
  const sy = row["Start Year"] || "";
  const head = [st, sy].filter(Boolean).join(" ").trim();
  const open = row["Open Date"] || "";
  const app = row["Application Deadline"] || "";
  const close = row["Deadline"] || "";
  const parts: string[] = [];
  if (head) parts.push(head);
  const tail: string[] = [];
  if (open) tail.push(`open: ${open}`);
  if (app) tail.push(`application deadline: ${app}`);
  if (close) tail.push(`close: ${close}`);
  if (tail.length) parts.push(tail.join(", "));
  return parts.join(" — ") || "Offering";
}

/** Ordered term / deadline fields for public bullets (subset of Program Attributes columns). */
export function buildTermParts(row: Record<string, string>): { key: string; value: string }[] {
  const pref = [
    "Start Term",
    "Start Year",
    "Open Date",
    "Application Deadline",
    "Deadline",
    "Updated Date",
  ];
  const out: { key: string; value: string }[] = [];
  const used = new Set<string>();
  for (const k of pref) {
    const v = (row[k] ?? "").trim();
    if (!v) continue;
    out.push({ key: k, value: row[k] ?? "" });
    used.add(k);
  }
  const rest = Object.keys(row)
    .filter((k) => isTermishColumn(k) && !used.has(k) && (row[k] ?? "").trim())
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  for (const k of rest) {
    out.push({ key: k, value: row[k] ?? "" });
  }
  if (out.length === 0) {
    const tl = buildTermLine(row);
    if (tl && tl !== "Offering") return [{ key: "__summary", value: tl }];
  }
  return out;
}

function computeShared(rows: Record<string, string>[]): Record<string, string> {
  if (rows.length === 0) return {};
  const keys = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) keys.add(k);
  const shared: Record<string, string> = {};
  for (const k of keys) {
    const vals = rows.map((r) => r[k] ?? "");
    const first = vals[0];
    if (vals.every((v) => v === first)) {
      shared[k] = first;
    }
  }
  return shared;
}

function computeVarying(row: Record<string, string>, shared: Record<string, string>): Record<string, string> {
  const varying: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    if (!(k in shared) || shared[k] !== v) {
      varying[k] = v;
    }
  }
  return varying;
}

function mergeRecs(
  pa: Record<string, string>[],
  recRows: Record<string, string>[]
): Map<string, Record<string, string>> {
  const map = new Map<string, Record<string, string>>();
  for (const r of recRows) {
    const pid = cleanProgramId(r["Program ID"] || "");
    if (!pid) continue;
    map.set(pid, {
      "Evaluation Type": r["Evaluation Type"] || "",
      Max: r["Max"] || "",
      Min: r["Min"] || "",
      "Minimum Required for Application to be submitted for review":
        r["Minimum Required for Application to be submitted for review"] || "",
    });
  }
  return map;
}

function rowsForProgram(
  rows: Record<string, string>[],
  programId: string
): Record<string, string>[] {
  const pid = cleanProgramId(programId);
  return rows.filter((r) => cleanProgramId(r["Program ID"] || "") === pid);
}

/**
 * Per–Program ID dedupe only. On the public page, identical rows across terms are merged into
 * one line (Fall/Spring, etc.); see `application-window-label.ts` collapse helpers.
 */
function dedupeQuestions(rows: Record<string, string>[]): Record<string, string>[] {
  const seen = new Set<string>();
  const out: Record<string, string>[] = [];
  for (const r of rows) {
    const pid = cleanProgramId(r["Program ID"] || "");
    /** Program ID: same question text can exist per application window (Fall vs Spring). */
    const k = `${pid}|${r["Question Block"] || ""}|${r["Question"] || ""}|${r["Question Type"] || ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

/** Per–Program ID dedupe; public merge of identical cross-term rows is in application-window-label. */
function dedupeDocuments(rows: Record<string, string>[]): Record<string, string>[] {
  const seen = new Set<string>();
  const out: Record<string, string>[] = [];
  for (const r of rows) {
    const pid = cleanProgramId(r["Program ID"] || "");
    /** Program ID: same document type/instructions repeat per CAS Program ID / term. */
    const k = `${pid}|${r["Document Type"] || ""}|${r["Application Instructions"] || ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

/** Per–Program ID dedupe; public merge of identical cross-term rows is in application-window-label. */
function dedupeAnswers(rows: Record<string, string>[]): Record<string, string>[] {
  const seen = new Set<string>();
  const out: Record<string, string>[] = [];
  for (const r of rows) {
    const pid = cleanProgramId(r["Program ID"] || "");
    const k = `${pid}|${r["Answer Value"] || JSON.stringify(r)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

function pickDisplayName(rows: Record<string, string>[]): string {
  const r = rows[0];
  return (
    (r["Program"] || "").trim() ||
    (r["WebAdMIT Label"] || "").trim() ||
    (r["ProgramCode"] || r["Program Code"] || "").trim() ||
    "Program"
  );
}

function mergeRecommendationForGroup(
  programIds: string[],
  recMap: Map<string, Record<string, string>>
): { rec: Record<string, string> | null; note?: string } {
  const payloads = programIds
    .map((id) => recMap.get(id))
    .filter((x): x is Record<string, string> => !!x && Object.values(x).some(Boolean));
  if (payloads.length === 0) return { rec: null };
  const canon = JSON.stringify(payloads[0]);
  const allSame = payloads.every((p) => JSON.stringify(p) === canon);
  if (allSame) return { rec: payloads[0] };
  return {
    rec: payloads[0],
    note: "Recommendation settings differ between application windows in this group; showing one window’s values. Confirm in CAS.",
  };
}

function defaultHideSummaryKey(k: string): boolean {
  const l = k.toLowerCase();
  if (l === "program id") return true;
  if (l === "unique id") return true;
  if (l.includes("internal")) return true;
  return false;
}

function unionKeysFromRows(rows: Record<string, string>[]): string[] {
  const s = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) s.add(k);
  return [...s].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function collectKeysFromGroups(
  groups: CasProgramGroup[],
  pick: (g: CasProgramGroup) => Record<string, string>[]
): string[] {
  const s = new Set<string>();
  for (const g of groups) {
    for (const r of pick(g)) {
      for (const k of Object.keys(r)) s.add(k);
    }
  }
  return [...s].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function collectSummaryColumnOptions(groups: CasProgramGroup[]): string[] {
  const summaryColumnOptionsSet = new Set<string>();
  for (const g of groups) {
    for (const [k, v] of Object.entries(g.shared)) {
      if (!v && k !== "Program") continue;
      if (!isTermishColumn(k)) summaryColumnOptionsSet.add(k);
    }
  }
  return [...summaryColumnOptionsSet].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

export function recomputePublicationMetadata(data: CasPublicationData): CasPublicationData {
  const summaryColumnOptions = collectSummaryColumnOptions(data.groups);
  const questionColumnOptions = collectKeysFromGroups(data.groups, (g) => g.questions);
  const answerColumnOptions = collectKeysFromGroups(data.groups, (g) => g.answers);
  const documentColumnOptions = collectKeysFromGroups(data.groups, (g) => g.documents);
  return {
    ...data,
    summaryColumnOptions,
    questionColumnOptions,
    answerColumnOptions,
    documentColumnOptions,
  };
}

/** Ensures column option arrays exist (migrates older blobs). */
export function ensurePublicationColumnMetadata(data: CasPublicationData): CasPublicationData {
  if (
    Array.isArray(data.summaryColumnOptions) &&
    Array.isArray(data.questionColumnOptions) &&
    Array.isArray(data.answerColumnOptions) &&
    Array.isArray(data.documentColumnOptions)
  ) {
    return data;
  }
  return recomputePublicationMetadata(data);
}

/** Older stored publications may lack `termParts` on offerings; derive from `termLine`. */
export function ensurePublicationOfferingShapes(data: CasPublicationData): CasPublicationData {
  const groups = data.groups.map((g) => ({
    ...g,
    offerings: g.offerings.map((o) => {
      if (Array.isArray(o.termParts) && o.termParts.length > 0) return o;
      const line = (o.termLine || "").trim() || "Offering";
      return { ...o, termParts: [{ key: "__summary", value: line }] };
    }),
  }));
  return { ...data, groups };
}

export function deriveDefaultVisibleDetailColumns(options: string[]): string[] {
  return options.filter((k) => !REDUNDANT_DETAIL_COLUMN_KEYS.has(k.trim().toLowerCase()));
}

export function deriveDefaultTermFieldSettings(data: CasPublicationData): TermFieldSetting[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const pref = [
    "Start Term",
    "Start Year",
    "Open Date",
    "Application Deadline",
    "Deadline",
    "Updated Date",
  ];
  for (const g of data.groups) {
    for (const o of g.offerings) {
      for (const p of o.termParts) {
        if (!p.value.trim()) continue;
        if (seen.has(p.key)) continue;
        seen.add(p.key);
        keys.push(p.key);
      }
    }
  }
  const prefOrdered = pref.filter((k) => keys.includes(k));
  const rest = keys
    .filter((k) => !pref.includes(k))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const ordered = [...prefOrdered, ...rest];
  return ordered.map((key) => ({
    key,
    label: key === "__summary" ? "Application window" : key,
    visible: true,
    show_in_heading: key === "Start Term" || key === "Start Year",
  }));
}

export function publicationUiDefaults(data: CasPublicationData) {
  const full = ensurePublicationColumnMetadata(data);
  return {
    visible_question_columns: deriveDefaultVisibleDetailColumns(full.questionColumnOptions),
    visible_answer_columns: deriveDefaultVisibleDetailColumns(full.answerColumnOptions),
    visible_document_columns: deriveDefaultVisibleDetailColumns(full.documentColumnOptions),
    term_field_settings: deriveDefaultTermFieldSettings(full),
    program_display_name_strip_suffixes: [...DEFAULT_PROGRAM_NAME_STRIP_SUFFIXES],
  };
}

function dedupeOrgRows(rows: Record<string, string>[]): Record<string, string>[] {
  const seen = new Set<string>();
  const out: Record<string, string>[] = [];
  for (const r of rows) {
    const sig = JSON.stringify(r);
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(r);
  }
  return out;
}

function mergeGroupRecommendations(
  existing: CasProgramGroup,
  incoming: CasProgramGroup
): { rec: Record<string, string> | null; note?: string } {
  const a = existing.recommendations;
  const b = incoming.recommendations;
  if (!a && !b) return { rec: null };
  if (a && !b) return { rec: a, note: existing.recommendationNote };
  if (!a && b) return { rec: b, note: incoming.recommendationNote };
  const same = JSON.stringify(a) === JSON.stringify(b);
  if (same) {
    return {
      rec: a,
      note: existing.recommendationNote ?? incoming.recommendationNote,
    };
  }
  return {
    rec: a,
    note: "Recommendation settings differ between merged CAS exports for this program group; values shown are from the first export. Confirm in CAS.",
  };
}

function cloneGroup(g: CasProgramGroup): CasProgramGroup {
  return JSON.parse(JSON.stringify(g)) as CasProgramGroup;
}

/**
 * Merges a second CAS export into the first (same schema). Groups match on `groupKey`;
 * offerings dedupe on Program ID; questions/documents/answers are unioned and deduped.
 */
export function mergePublicationData(
  base: CasPublicationData,
  extra: CasPublicationData
): CasPublicationData {
  const a = ensurePublicationColumnMetadata(base);
  const b = ensurePublicationColumnMetadata(extra);
  const map = new Map<string, CasProgramGroup>();
  for (const g of a.groups) {
    map.set(g.groupKey, cloneGroup(g));
  }
  for (const g of b.groups) {
    const ex = map.get(g.groupKey);
    if (!ex) {
      map.set(g.groupKey, cloneGroup(g));
      continue;
    }
    const pidSeen = new Set(ex.offerings.map((o) => o.programId));
    for (const o of g.offerings) {
      if (!pidSeen.has(o.programId)) {
        ex.offerings.push({ ...o, termParts: [...o.termParts] });
        pidSeen.add(o.programId);
      }
    }
    ex.questions = dedupeQuestions([...ex.questions, ...g.questions]);
    ex.documents = dedupeDocuments([...ex.documents, ...g.documents]);
    ex.answers = dedupeAnswers([...ex.answers, ...g.answers]);
    const mergedRec = mergeGroupRecommendations(ex, g);
    ex.recommendations = mergedRec.rec;
    ex.recommendationNote = mergedRec.note;
  }
  const mergedGroups = [...map.values()].sort((x, y) =>
    x.displayName.localeCompare(y.displayName, undefined, { sensitivity: "base" })
  );
  const sourceFileName = `${a.sourceFileName} + ${b.sourceFileName}`;
  const orgQuestions = dedupeOrgRows([...a.orgQuestions, ...b.orgQuestions]);
  const orgAnswers = dedupeOrgRows([...a.orgAnswers, ...b.orgAnswers]);
  const raw: CasPublicationData = {
    sourceFileName,
    orgQuestions,
    orgAnswers,
    groups: mergedGroups,
    summaryColumnOptions: [],
    questionColumnOptions: [],
    answerColumnOptions: [],
    documentColumnOptions: [],
  };
  return recomputePublicationMetadata(raw);
}

function buildGroupsFromSheets(params: {
  pa: Record<string, string>[];
  recRows: Record<string, string>[];
  questionsAll: Record<string, string>[];
  documentsAll: Record<string, string>[];
  answersAll: Record<string, string>[];
  orgQuestions: Record<string, string>[];
  orgAnswers: Record<string, string>[];
}): CasProgramGroup[] {
  const { pa, recRows, questionsAll, documentsAll, answersAll } = params;
  const recMap = mergeRecs(pa, recRows);
  const byGroup = new Map<string, Record<string, string>[]>();
  for (const row of pa) {
    const g = groupKey(row);
    const list = byGroup.get(g) ?? [];
    list.push(row);
    byGroup.set(g, list);
  }

  const groups: CasProgramGroup[] = [];
  for (const [, rows] of byGroup) {
    const shared = computeShared(rows);
    const offerings: CasOffering[] = rows.map((row) => {
      const pid = cleanProgramId(row["Program ID"] || "");
      const varying = computeVarying(row, shared);
      return {
        programId: pid,
        termLine: buildTermLine(row),
        varying,
        termParts: buildTermParts(row),
      };
    });

    const programIds = rows.map((r) => cleanProgramId(r["Program ID"] || ""));
    const qAccum: Record<string, string>[] = [];
    const dAccum: Record<string, string>[] = [];
    const aAccum: Record<string, string>[] = [];
    for (const pid of programIds) {
      qAccum.push(...rowsForProgram(questionsAll, pid));
      dAccum.push(...rowsForProgram(documentsAll, pid));
      aAccum.push(...rowsForProgram(answersAll, pid));
    }

    const { rec, note } = mergeRecommendationForGroup(programIds, recMap);

    groups.push({
      groupKey: groupKey(rows[0]),
      displayName: pickDisplayName(rows),
      shared,
      offerings,
      recommendations: rec,
      recommendationNote: note,
      questions: dedupeQuestions(qAccum),
      documents: dedupeDocuments(dAccum),
      answers: dedupeAnswers(aAccum),
    });
  }

  groups.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }));
  return groups;
}

export function parseCasWorkbook(buffer: Buffer, sourceFileName: string): CasPublicationData {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });

  const pa = readSheet(wb, "Program Attributes").filter((r) => cleanProgramId(r["Program ID"] || ""));
  const recRows = readSheet(wb, "Recommendations");
  const questionsAll = readSheet(wb, "Questions").filter((r) => cleanProgramId(r["Program ID"] || ""));
  const documentsAll = readSheet(wb, "Documents").filter((r) => cleanProgramId(r["Program ID"] || ""));
  const answersAll = readSheet(wb, "Answers").filter((r) => cleanProgramId(r["Program ID"] || ""));
  const orgQuestions = readSheet(wb, "Org Questions");
  const orgAnswers = readSheet(wb, "Org Answers");

  const groups = buildGroupsFromSheets({
    pa,
    recRows,
    questionsAll,
    documentsAll,
    answersAll,
    orgQuestions,
    orgAnswers,
  });

  const base: CasPublicationData = {
    sourceFileName,
    orgQuestions,
    orgAnswers,
    groups,
    summaryColumnOptions: [],
    questionColumnOptions: [],
    answerColumnOptions: [],
    documentColumnOptions: [],
  };
  return recomputePublicationMetadata(base);
}

export function parseAndMergeCasWorkbooks(
  parts: { buffer: Buffer; fileName: string }[]
): CasPublicationData {
  if (parts.length === 0) throw new Error("No files to merge");
  let acc = parseCasWorkbook(parts[0].buffer, parts[0].fileName);
  for (let i = 1; i < parts.length; i++) {
    const next = parseCasWorkbook(parts[i].buffer, parts[i].fileName);
    acc = mergePublicationData(acc, next);
  }
  return acc;
}

export function defaultVisibleColumns(options: string[]): string[] {
  return options.filter((k) => !defaultHideSummaryKey(k));
}

export function pickVisibleShared(
  shared: Record<string, string>,
  visibleColumnKeys: string[]
): Record<string, string> {
  const keys =
    visibleColumnKeys.length > 0
      ? visibleColumnKeys
      : Object.keys(shared).filter((k) => !defaultHideSummaryKey(k));
  const out: Record<string, string> = {};
  for (const k of keys) {
    if (k in shared) out[k] = shared[k];
  }
  return out;
}

export function filterRecordRows(
  rows: Record<string, string>[],
  visibleKeys: string[]
): Record<string, string>[] {
  if (visibleKeys.length === 0) return rows;
  return rows.map((r) => {
    const o: Record<string, string> = {};
    for (const k of visibleKeys) {
      const v = getRecordValueCi(r, k);
      if (v !== undefined) o[k] = v;
    }
    /** Needed to tie each row to an offering / term even when “Program ID” is hidden in admin. */
    const hasPid = Object.keys(o).some((k) => k.trim().toLowerCase() === "program id");
    if (!hasPid) {
      const pid = getRecordValueCi(r, "Program ID");
      if (pid !== undefined) o["Program ID"] = pid;
    }
    return o;
  });
}

export function mergeTermFieldSettings(
  previous: TermFieldSetting[] | undefined,
  defaults: TermFieldSetting[]
): TermFieldSetting[] {
  const prevMap = new Map((previous ?? []).map((t) => [t.key, t]));
  return defaults.map((d) => {
    const p = prevMap.get(d.key);
    if (!p) return { ...d };
    const show_in_heading =
      typeof p.show_in_heading === "boolean" ? p.show_in_heading : Boolean(d.show_in_heading);
    return {
      key: d.key,
      label: p.label.trim() || d.label,
      visible: p.visible,
      show_in_heading,
    };
  });
}

export function mergeVisibleDetailKeys(
  previous: string[] | undefined,
  options: string[],
  defaults: string[]
): string[] {
  const opt = new Set(options);
  const filtered = (previous ?? []).filter((k) => opt.has(k));
  if (filtered.length > 0) return filtered;
  return defaults.filter((k) => opt.has(k));
}
