import type { CasOffering, TermFieldSetting } from "./types";
import { cleanProgramId } from "./parse-cas";

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

/** Full title for a card or table row: heading fields, else legacy term line, else em dash. */
export function applicationWindowCardTitle(
  o: CasOffering,
  settings: TermFieldSetting[]
): string {
  const fromHeading = applicationWindowHeadingText(o, settings);
  if (fromHeading) return fromHeading;
  const fromLine = o.termLine.trim();
  if (fromLine) return fromLine;
  return "—";
}

/** Prepended on Questions / Answers / Documents so each row shows Fall vs Spring (etc.) first. */
export const APPLICATION_WINDOW_COLUMN = "Application window";

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
    const pid = cleanProgramId(r["Program ID"] || "");
    const o = pid ? byPid.get(pid) : undefined;
    const label = o ? applicationWindowCardTitle(o, settings) : "—";
    return { [APPLICATION_WINDOW_COLUMN]: label, ...r };
  });
}

export function prependApplicationWindowColumn(columns: string[]): string[] {
  const rest = columns.filter((c) => c !== APPLICATION_WINDOW_COLUMN);
  return [APPLICATION_WINDOW_COLUMN, ...rest];
}
