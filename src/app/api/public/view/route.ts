import { NextResponse } from "next/server";
import {
  getCurrentViewPublication,
  PublicationStorageError,
  toPublicPayload,
} from "@/lib/cas-store";

export const runtime = "nodejs";

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
};

export async function GET() {
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return NextResponse.json(
      { error: "Server is missing BLOB_READ_WRITE_TOKEN." },
      { status: 503 }
    );
  }
  try {
    const row = await getCurrentViewPublication();
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(toPublicPayload(row), { headers: CACHE_HEADERS });
  } catch (e) {
    if (e instanceof PublicationStorageError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    throw e;
  }
}
