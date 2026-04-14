import { NextResponse } from "next/server";
import { z } from "zod";
import { getPublicationBySlug, updatePublication } from "@/lib/cas-store";

export const runtime = "nodejs";

function assertAdmin(request: Request): NextResponse | null {
  const secret = process.env.ADMIN_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Server is not configured with ADMIN_SECRET." },
      { status: 500 }
    );
  }
  const h = request.headers.get("authorization");
  const token = h?.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

const patchSchema = z.object({
  title: z.string().min(0).max(500).optional(),
  visibleColumnKeys: z.array(z.string()).optional(),
  defaultGroupKey: z.string().optional(),
});

export async function GET(
  request: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const deny = assertAdmin(request);
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
  return NextResponse.json({
    slug: row.slug,
    title: row.title,
    visibleColumnKeys: row.visible_columns,
    defaultGroupKey: row.default_group_key,
    summaryColumnOptions: row.data.summaryColumnOptions,
    groupKeys: row.data.groups.map((g) => ({
      key: g.groupKey,
      label: g.displayName,
    })),
    sourceFileName: row.data.sourceFileName,
  });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const deny = assertAdmin(request);
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
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
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
  return NextResponse.json({
    slug: updated.slug,
    title: updated.title,
    visibleColumnKeys: updated.visible_columns,
    defaultGroupKey: updated.default_group_key,
  });
}
