import { customAlphabet } from "nanoid";
import { NextResponse } from "next/server";
import { createPublication } from "@/lib/cas-store";
import { parseAndMergeCasWorkbooks, parseCasWorkbook } from "@/lib/parse-cas";
import { unauthorizedIfNotAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";
/** Large CAS workbooks + merge can exceed the default serverless window on Vercel. */
export const maxDuration = 120;

const mkSlug = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12);

function collectUploadedWorkbooks(form: FormData): File[] {
  const byIndex = new Map<number, File>();
  for (const key of form.keys()) {
    const m = /^cas_(\d+)$/.exec(key);
    if (!m) continue;
    const v = form.get(key);
    if (v instanceof File && v.size > 0) {
      byIndex.set(parseInt(m[1], 10), v);
    }
  }
  if (byIndex.size > 0) {
    return [...byIndex.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, f]) => f);
  }
  const repeated = form.getAll("files").filter((x): x is File => x instanceof File && x.size > 0);
  if (repeated.length > 0) return repeated;
  const file = form.get("file");
  const file2 = form.get("file2");
  const out: File[] = [];
  if (file instanceof File && file.size > 0) out.push(file);
  if (file2 instanceof File && file2.size > 0) out.push(file2);
  return out;
}

export async function POST(request: Request) {
  const deny = await unauthorizedIfNotAdmin();
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

  let form: FormData;
  try {
    form = await request.formData();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid form data";
    return NextResponse.json(
      {
        error: `Could not read upload (${msg}). If both workbooks are large, try uploading one file first, then use “Merge workbook” on the publication settings page — some hosts limit request size to about 4.5MB.`,
      },
      { status: 413 }
    );
  }

  const titleRaw = form.get("title");
  const title =
    typeof titleRaw === "string" && titleRaw.trim()
      ? titleRaw.trim()
      : "CAS programs";

  const multiFiles = collectUploadedWorkbooks(form);

  let parts: { buffer: Buffer; fileName: string }[] = [];

  if (multiFiles.length > 0) {
    parts = await Promise.all(
      multiFiles.map(async (f) => ({
        buffer: Buffer.from(await f.arrayBuffer()),
        fileName: f.name,
      }))
    );
  }

  if (parts.length === 0) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  let data;
  try {
    if (parts.length === 1) {
      data = parseCasWorkbook(parts[0].buffer, parts[0].fileName);
    } else {
      data = parseAndMergeCasWorkbooks(parts);
    }
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
    publicUrl: "/view",
    slugUrl: `/s/${slug}`,
    adminUrl: `/admin/${slug}`,
  });
}
