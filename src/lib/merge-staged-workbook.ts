import { del, get } from "@vercel/blob";
import type { PublicationRow, WorkbookUploadMode } from "./cas-store";
import { mergePublicationFromUpload } from "./cas-store";
import { getBlobAccessMode } from "./blob-access";

function requireBlobToken(): string {
  const t = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!t) throw new Error("BLOB_READ_WRITE_TOKEN is not set.");
  return t;
}

/**
 * Reads a workbook staged via client Blob upload, merges into the publication, deletes the staging object.
 */
export async function mergePublicationFromStagedPathname(
  slug: string,
  pathname: string,
  sourceLabel: string,
  mode: WorkbookUploadMode = "replace-source"
): Promise<PublicationRow> {
  const prefix = `cas-merge-staging/${slug}/`;
  if (!pathname.startsWith(prefix)) {
    throw new Error("Invalid staging pathname");
  }
  const token = requireBlobToken();
  const access = getBlobAccessMode();
  const res = await get(pathname, { token, access });
  if (!res?.stream) {
    throw new Error("Staging file not found or already removed.");
  }
  const buf = Buffer.from(await new Response(res.stream as ReadableStream).arrayBuffer());
  try {
    const updated = await mergePublicationFromUpload(slug, buf, sourceLabel, mode);
    if (!updated) throw new Error("Publication not found.");
    return updated;
  } finally {
    await del(pathname, { token }).catch(() => {});
  }
}
