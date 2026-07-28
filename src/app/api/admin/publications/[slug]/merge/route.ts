import { NextResponse } from "next/server";
import { mergePublicationFromUpload, type WorkbookUploadMode } from "@/lib/cas-store";
import { mergePublicationFromStagedPathname } from "@/lib/merge-staged-workbook";
import { unauthorizedIfNotAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";
export const maxDuration = 120;

const SLUG_RE = /^[a-z0-9]{8,32}$/;

function parseMode(value: unknown): WorkbookUploadMode {
  return value === "merge" ? "merge" : "replace-source";
}

/**
 * Update this publication from another CAS workbook.
 *
 * - Preferred: `Content-Type: application/json` with `{ pathname, sourceFileName?, mode? }` after
 *   a client-side Blob upload (bypasses Vercel’s ~4.5MB serverless body limit).
 * - Legacy: `multipart/form-data` with field `file` (small workbooks only).
 *
 * Default mode is `replace-source`: the incoming workbook's CAS profile (GradCAS or
 * EngineeringCAS) replaces that same source in the publication while other sources, public display
 * settings, and branding snapshots are preserved.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const deny = await unauthorizedIfNotAdmin();
  if (deny) return deny;
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN is not set. Link a Blob store to this project." },
      { status: 500 }
    );
  }

  const { slug } = await ctx.params;
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const ct = request.headers.get("content-type") ?? "";

  if (ct.includes("application/json")) {
    let payload: { pathname?: string; sourceFileName?: string; mode?: unknown };
    try {
      payload = (await request.json()) as {
        pathname?: string;
        sourceFileName?: string;
        mode?: unknown;
      };
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const pathname =
      typeof payload.pathname === "string" ? payload.pathname.trim() : "";
    if (!pathname.startsWith(`cas-merge-staging/${slug}/`)) {
      return NextResponse.json(
        { error: "Invalid pathname (must be a merge staging object for this publication)." },
        { status: 400 }
      );
    }
    const sourceLabel =
      typeof payload.sourceFileName === "string" && payload.sourceFileName.trim()
        ? payload.sourceFileName.trim()
        : pathname.split("/").pop() || "merge.xlsx";
    const mode = parseMode(payload.mode);
    try {
      const updated = await mergePublicationFromStagedPathname(slug, pathname, sourceLabel, mode);
      return NextResponse.json({
        slug: updated.slug,
        sourceFileName: updated.data.sourceFileName,
        groupCount: updated.data.groups.length,
        mode,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Merge failed";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch (e) {
    const hint = e instanceof Error ? e.message : "Bad form data";
    return NextResponse.json(
      {
        error: `Could not read upload (${hint}). Large workbooks must use direct Blob upload from the admin page. If you still see this, redeploy the latest app.`,
      },
      { status: 413 }
    );
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  try {
    const updated = await mergePublicationFromUpload(slug, buf, file.name, "replace-source");
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      slug: updated.slug,
      sourceFileName: updated.data.sourceFileName,
      groupCount: updated.data.groups.length,
      mode: "replace-source",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Merge failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
