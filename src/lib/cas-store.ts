import { get, put } from "@vercel/blob";
import type {
  CasPublicationData,
  PublicPublicationPayload,
  PublicProgramGroup,
} from "./types";
import { defaultVisibleColumns, pickVisibleShared } from "./parse-cas";

const BLOB_PREFIX = "cas-publications";

/** Stored as one JSON file per publication in Vercel Blob. */
export type StoredPublicationBlob = {
  version: 1;
  slug: string;
  title: string;
  visible_columns: string[];
  default_group_key: string;
  data: CasPublicationData;
  created_at: string;
  updated_at: string;
};

export type PublicationRow = {
  id: string;
  slug: string;
  title: string;
  visible_columns: string[];
  default_group_key: string;
  data: CasPublicationData;
  created_at: string;
  updated_at: string;
};

type StoredGroup = CasPublicationData["groups"][number];

function requireBlobToken(): string {
  const t = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!t) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not set.");
  }
  return t;
}

function publicationPathname(slug: string): string {
  if (!/^[a-z0-9]{8,32}$/.test(slug)) {
    throw new Error("Invalid slug");
  }
  return `${BLOB_PREFIX}/${slug}.json`;
}

function blobToRow(parsed: StoredPublicationBlob): PublicationRow {
  return {
    id: parsed.slug,
    slug: parsed.slug,
    title: parsed.title,
    visible_columns: parsed.visible_columns,
    default_group_key: parsed.default_group_key,
    data: parsed.data,
    created_at: parsed.created_at,
    updated_at: parsed.updated_at,
  };
}

function mapToPublicGroup(
  g: StoredGroup,
  visibleColumnKeys: string[]
): PublicProgramGroup {
  return {
    groupKey: g.groupKey,
    displayName: g.displayName,
    visibleShared: pickVisibleShared(g.shared, visibleColumnKeys),
    offerings: g.offerings,
    recommendations: g.recommendations,
    recommendationNote: g.recommendationNote,
    questions: g.questions,
    documents: g.documents,
    answers: g.answers,
  };
}

export function toPublicPayload(row: PublicationRow): PublicPublicationPayload {
  const data = row.data;
  const keys = row.visible_columns ?? [];
  return {
    title: row.title,
    slug: row.slug,
    defaultGroupKey: row.default_group_key || data.groups[0]?.groupKey || "",
    visibleColumnKeys: keys,
    orgQuestions: data.orgQuestions,
    orgAnswers: data.orgAnswers,
    groups: data.groups.map((g) => mapToPublicGroup(g, keys)),
  };
}

export async function getPublicationBySlug(
  slug: string
): Promise<PublicationRow | null> {
  if (!/^[a-z0-9]{8,32}$/.test(slug)) {
    return null;
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    return null;
  }
  const pathname = publicationPathname(slug);
  try {
    const res = await get(pathname, {
      access: "private",
      token,
      useCache: false,
    });
    if (!res?.stream) {
      return null;
    }
    const text = await new Response(res.stream as ReadableStream).text();
    const parsed = JSON.parse(text) as StoredPublicationBlob;
    if (parsed.version !== 1 || parsed.slug !== slug) {
      return null;
    }
    return blobToRow(parsed);
  } catch {
    return null;
  }
}

export async function createPublication(input: {
  slug: string;
  title: string;
  data: CasPublicationData;
}): Promise<void> {
  const token = requireBlobToken();
  const vis = defaultVisibleColumns(input.data.summaryColumnOptions);
  const defaultGroupKey = input.data.groups[0]?.groupKey ?? "";
  const now = new Date().toISOString();
  const body: StoredPublicationBlob = {
    version: 1,
    slug: input.slug,
    title: input.title,
    visible_columns: vis,
    default_group_key: defaultGroupKey,
    data: input.data,
    created_at: now,
    updated_at: now,
  };
  await put(publicationPathname(input.slug), JSON.stringify(body), {
    access: "private",
    token,
    addRandomSuffix: false,
    contentType: "application/json",
  });
}

export async function updatePublication(
  slug: string,
  patch: {
    title?: string;
    visibleColumnKeys?: string[];
    defaultGroupKey?: string;
  }
): Promise<PublicationRow | null> {
  const existing = await getPublicationBySlug(slug);
  if (!existing) return null;
  const opts = new Set(existing.data.summaryColumnOptions);
  const title = patch.title ?? existing.title;
  const defaultGroupKey =
    patch.defaultGroupKey !== undefined && patch.defaultGroupKey !== ""
      ? patch.defaultGroupKey
      : existing.default_group_key;
  if (
    patch.defaultGroupKey !== undefined &&
    patch.defaultGroupKey !== "" &&
    !existing.data.groups.some((g) => g.groupKey === patch.defaultGroupKey)
  ) {
    throw new Error("Invalid defaultGroupKey");
  }
  let visible = patch.visibleColumnKeys ?? existing.visible_columns;
  if (patch.visibleColumnKeys) {
    visible = patch.visibleColumnKeys.filter((k) => opts.has(k));
  }
  const token = requireBlobToken();
  const body: StoredPublicationBlob = {
    version: 1,
    slug: existing.slug,
    title,
    visible_columns: visible,
    default_group_key: defaultGroupKey,
    data: existing.data,
    created_at: existing.created_at,
    updated_at: new Date().toISOString(),
  };
  await put(publicationPathname(slug), JSON.stringify(body), {
    access: "private",
    token,
    addRandomSuffix: false,
    contentType: "application/json",
  });
  return getPublicationBySlug(slug);
}
