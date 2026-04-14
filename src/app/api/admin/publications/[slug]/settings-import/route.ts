import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getPublicationBySlug, updatePublication } from "@/lib/cas-store";
import {
  parsePublicationSettingsImport,
  sanitizePublicationSettingsPatch,
} from "@/lib/publication-settings-snapshot";
import { unauthorizedIfNotAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";

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
  const row = await getPublicationBySlug(slug);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let patch;
  try {
    patch = parsePublicationSettingsImport(body);
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: "Invalid settings file", details: e.flatten() }, { status: 400 });
    }
    const msg = e instanceof Error ? e.message : "Invalid settings file";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { patch: sanitized, droppedDefaultGroupKey } = sanitizePublicationSettingsPatch(
    row,
    patch
  );
  let updated;
  try {
    updated = await updatePublication(slug, sanitized);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed";
    if (msg === "Invalid defaultGroupKey") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    slug: updated.slug,
    droppedDefaultGroupKey,
  });
}
