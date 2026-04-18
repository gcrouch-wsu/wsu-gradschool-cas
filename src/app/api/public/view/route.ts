import { NextResponse } from "next/server";
import { getCurrentViewPublication, toPublicPayload } from "@/lib/cas-store";

export const runtime = "nodejs";

export async function GET() {
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return NextResponse.json(
      { error: "Server is missing BLOB_READ_WRITE_TOKEN." },
      { status: 503 }
    );
  }
  const row = await getCurrentViewPublication();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toPublicPayload(row));
}
