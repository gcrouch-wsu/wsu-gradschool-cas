import { NextResponse } from "next/server";
import { getPublicationBySlug } from "@/lib/cas-store";
import { buildPublicationSettingsExport } from "@/lib/publication-settings-snapshot";
import { unauthorizedIfNotAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";

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
  const row = await getPublicationBySlug(slug);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const payload = buildPublicationSettingsExport(row);
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  const filename = `cas-publication-settings-${slug}.json`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
