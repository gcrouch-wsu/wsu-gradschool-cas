/**
 * Magic suffix: strip the first comma in the name and everything after it
 * (e.g. `Master of Arts in X, Online (Spring)` → `Master of Arts in X`).
 */
export const PROGRAM_NAME_STRIP_COMMA_AND_REST = ",#";

/** Same effect as {@link PROGRAM_NAME_STRIP_COMMA_AND_REST} (common typo). */
export const PROGRAM_NAME_STRIP_COMMA_AND_REST_ALIAS = "#,";

/**
 * Strip at the first spaced hyphen or en dash (ASCII `-` or Unicode `–`), e.g.
 * `Master of Arts in X - Online` → `Master of Arts in X` when campus/modality uses a dash, not a comma.
 */
export const PROGRAM_NAME_STRIP_SPACED_DASH_AND_REST = " -#";

const COMMA_STRIP_TOKENS = new Set([
  PROGRAM_NAME_STRIP_COMMA_AND_REST,
  PROGRAM_NAME_STRIP_COMMA_AND_REST_ALIAS,
]);

/** ASCII hyphen or en dash, surrounded by spaces. */
const SPACED_DASH_SEP_RE = /\s[-\u2013]\s/;

function stripSpacedDashAndRest(out: string): string | null {
  const m = SPACED_DASH_SEP_RE.exec(out);
  if (!m || m.index === undefined) return null;
  return out.slice(0, m.index).trim();
}

/** Suffixes removed from the end of program display names (public), longest first per pass. */
export const DEFAULT_PROGRAM_NAME_STRIP_SUFFIXES: string[] = [
  ", Online (Spring)",
  ", Online (Summer)",
  ", Online (Fall)",
  ", Online (Winter)",
  ", Online",
  " (Spring)",
  " (Summer)",
  " (Fall)",
  " (Winter)",
];

/**
 * Repeatedly strips configured suffixes from the end of `name` until stable.
 * Pass an empty array to leave names unchanged.
 */
export function cleanProgramDisplayName(name: string, suffixes: string[]): string {
  let out = name.trim();
  if (!suffixes.length) return out;
  const sorted = [...suffixes]
    .map((s) => s.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of sorted) {
      if (COMMA_STRIP_TOKENS.has(s)) {
        const idx = out.indexOf(",");
        if (idx !== -1) {
          out = out.slice(0, idx).trim();
          changed = true;
          break;
        }
        continue;
      }
      if (s === PROGRAM_NAME_STRIP_SPACED_DASH_AND_REST) {
        const cut = stripSpacedDashAndRest(out);
        if (cut !== null) {
          out = cut;
          changed = true;
          break;
        }
        continue;
      }
      if (out.endsWith(s)) {
        out = out.slice(0, -s.length).trim();
        changed = true;
        break;
      }
    }
  }
  return out;
}
