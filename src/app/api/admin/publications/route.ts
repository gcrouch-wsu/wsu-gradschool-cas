import { customAlphabet } from "nanoid";
import { NextResponse } from "next/server";
import { createPublication } from "@/lib/cas-store";
import { parseCasWorkbook } from "@/lib/parse-cas";

export const runtime = "nodejs";

const mkSlug = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12);

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

export async function POST(request: Request) {
  const deny = assertAdmin(request);
  if (deny) return deny;

  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return NextResponse.json(
      {
        error:
          "BLOB_READ_WRITE_TOKEN is not set. In Vercel: open this project → Storage → create or connect a Blob store so the token is added, then redeploy.",
      },
      { status: 500 }
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  const titleRaw = form.get("title");
  const title =
    typeof titleRaw === "string" && titleRaw.trim()
      ? titleRaw.trim()
      : "CAS programs";

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let data;
  try {
    data = parseCasWorkbook(buf, file.name);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Parse failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (data.groups.length === 0) {
    return NextResponse.json(
      { error: "No Program Attributes rows found (check sheet name and Program ID)." },
      { status: 400 }
    );
  }

  const slug = mkSlug();
  try {
    await createPublication({ slug, title, data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Storage error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({
    slug,
    publicUrl: `/s/${slug}`,
    adminUrl: `/admin/${slug}`,
  });
}
