/** Filesystem-safe short title segment for Content-Disposition / download names. */
export function sanitizeTitleForFilename(title: string, maxLen = 40): string {
  const cleaned = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen)
    .replace(/-+$/g, "")
    .toLowerCase();
  return cleaned || "publication";
}

export function settingsExportFilename(slug: string, title: string): string {
  return `cas-publication-settings-${slug}-${sanitizeTitleForFilename(title)}.json`;
}
