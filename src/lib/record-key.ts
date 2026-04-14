/** Read a value from a string record using exact key, then case-insensitive key match. */
export function getRecordValueCi(
  row: Record<string, string>,
  canonicalKey: string
): string | undefined {
  if (Object.prototype.hasOwnProperty.call(row, canonicalKey)) return row[canonicalKey];
  const want = canonicalKey.toLowerCase();
  for (const rk of Object.keys(row)) {
    if (rk.toLowerCase() === want) return row[rk];
  }
  return undefined;
}

/** Keep `columnOrder` entries that have at least one non-empty value in `rows`. */
export function filterKeysByVisibleData(
  rows: Record<string, string>[],
  columnOrder: string[]
): string[] {
  return columnOrder.filter((k) =>
    rows.some((r) => {
      const v = getRecordValueCi(r, k);
      return v !== undefined && v.trim() !== "";
    })
  );
}

/** Union of row keys that have at least one non-empty value anywhere, sorted. */
export function unionRowKeysWithData(rows: Record<string, string>[]): string[] {
  const s = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) s.add(k);
  return [...s]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .filter((k) => rows.some((r) => (getRecordValueCi(r, k) ?? "").trim() !== ""));
}
