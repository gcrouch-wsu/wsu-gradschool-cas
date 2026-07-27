import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deletePublication,
  getCurrentViewSlug,
  getPublicationBySlug,
  updatePublication,
} from "@/lib/cas-store";
import { unauthorizedIfNotAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";

const termFieldSettingSchema = z.object({
  key: z.string(),
  label: z.string(),
  visible: z.boolean(),
  show_in_heading: z.boolean().optional(),
});

const patchSchema = z.object({
  title: z.string().min(0).max(500).optional(),
  visibleColumnKeys: z.array(z.string()).optional(),
  defaultGroupKey: z.string().optional(),
  showOrgOnPublic: z.boolean().optional(),
  showProgramIdOnPublic: z.boolean().optional(),
  visibleQuestionColumns: z.array(z.string()).optional(),
  visibleAnswerColumns: z.array(z.string()).optional(),
  visibleDocumentColumns: z.array(z.string()).optional(),
  termFieldSettings: z.array(termFieldSettingSchema).optional(),
  publicHeaderTitle: z.string().max(200).optional(),
  publicHeaderSubtitle: z.string().max(300).optional(),
  publicHeaderLogoUrl: z.string().max(2000).optional(),
  publicHeaderTitleHref: z.string().max(2000).optional(),
  publicHeroEyebrow: z.string().max(200).optional(),
  publicHeroBody: z.string().max(20000).optional(),
  programDisplayNameStripSuffixes: z.array(z.string().max(200)).max(100).optional(),
  cycleDisplayOverride: z.string().max(200).optional(),
  setAsCurrentView: z.boolean().optional(),
});

function rowToAdminJson(row: NonNullable<Awaited<ReturnType<typeof getPublicationBySlug>>>) {
  return {
    slug: row.slug,
    title: row.title,
    visibleColumnKeys: row.visible_columns,
    defaultGroupKey: row.default_group_key,
    showOrgOnPublic: row.show_org_on_public,
    showProgramIdOnPublic: row.show_program_id_on_public,
    summaryColumnOptions: row.data.summaryColumnOptions,
    questionColumnOptions: row.data.questionColumnOptions,
    answerColumnOptions: row.data.answerColumnOptions,
    documentColumnOptions: row.data.documentColumnOptions,
    visibleQuestionColumns: row.visible_question_columns,
    visibleAnswerColumns: row.visible_answer_columns,
    visibleDocumentColumns: row.visible_document_columns,
    termFieldSettings: row.term_field_settings,
    publicHeaderTitle: row.public_header_title,
    publicHeaderSubtitle: row.public_header_subtitle,
    publicHeaderLogoUrl: row.public_header_logo_url,
    publicHeaderTitleHref: row.public_header_title_href,
    publicHeroEyebrow: row.public_hero_eyebrow,
    publicHeroBody: row.public_hero_body,
    programDisplayNameStripSuffixes: row.program_display_name_strip_suffixes,
    cycleDisplayOverride: row.cycle_display_override,
    groupKeys: row.data.groups.map((g) => ({
      key: g.groupKey,
      label: g.displayName,
    })),
    sourceFileName: row.data.sourceFileName,
    updatedAt: row.updated_at,
  };
}

export async function GET(
  _request: Request,
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
  let row;
  try {
    row = await getPublicationBySlug(slug);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Storage error";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const currentViewSlug = await getCurrentViewSlug();
  let currentView: { slug: string; title: string; updatedAt: string } | null = null;
  if (currentViewSlug && currentViewSlug !== slug) {
    try {
      const live = await getPublicationBySlug(currentViewSlug);
      if (live) {
        currentView = {
          slug: live.slug,
          title: live.title,
          updatedAt: live.updated_at,
        };
      }
    } catch {
      currentView = { slug: currentViewSlug, title: "(unavailable)", updatedAt: "" };
    }
  }

  return NextResponse.json({
    ...rowToAdminJson(row),
    isCurrentView: currentViewSlug === slug,
    currentViewSlug,
    currentView,
  });
}

export async function PATCH(
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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }
  let updated;
  try {
    updated = await updatePublication(slug, parsed.data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed";
    if (msg === "Invalid defaultGroupKey") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const currentViewSlug = await getCurrentViewSlug();
  return NextResponse.json({
    ...rowToAdminJson(updated),
    isCurrentView: currentViewSlug === updated.slug,
    currentViewSlug,
  });
}

export async function DELETE(
  _request: Request,
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
  let result;
  try {
    result = await deletePublication(slug);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  if (result.status === "not_found") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (result.status === "current_view") {
    return NextResponse.json(
      {
        error:
          "This cycle drives the live home page. Set another cycle as live before deleting this one.",
        currentViewSlug: result.currentViewSlug,
      },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true, slug: result.slug, title: result.title });
}
