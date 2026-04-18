import { get, put } from "@vercel/blob";
import type {
  CasPublicationData,
  PublicPublicationPayload,
  PublicProgramGroup,
  TermFieldSetting,
} from "./types";
import { getBlobAccessMode } from "./blob-access";
import {
  DEFAULT_PUBLIC_HEADER_SUBTITLE,
  DEFAULT_PUBLIC_HEADER_TITLE,
  DEFAULT_PUBLIC_HEADER_TITLE_HREF,
  DEFAULT_PUBLIC_HERO_BODY,
  DEFAULT_PUBLIC_HERO_EYEBROW,
} from "./public-page-defaults";
import { cleanProgramDisplayName } from "./program-display";
import {
  defaultVisibleColumns,
  ensurePublicationColumnMetadata,
  ensurePublicationOfferingShapes,
  filterRecordRows,
  mergePublicationData,
  mergeTermFieldSettings,
  mergeVisibleDetailKeys,
  parseCasWorkbook,
  pickVisibleShared,
  publicationUiDefaults,
} from "./parse-cas";

const BLOB_PREFIX = "cas-publications";
const CURRENT_VIEW_PATHNAME = `${BLOB_PREFIX}/_current-view.json`;

/** Stored as one JSON file per publication in Vercel Blob. */
export type StoredPublicationBlob = {
  version: 1;
  slug: string;
  title: string;
  visible_columns: string[];
  default_group_key: string;
  /** When false, public view hides organization-level Org Questions / Org Answers. */
  show_org_on_public?: boolean;
  /** Public program-question table columns (keys). */
  visible_question_columns?: string[];
  visible_answer_columns?: string[];
  visible_document_columns?: string[];
  /** Labels and visibility for application-window bullets. */
  term_field_settings?: TermFieldSetting[];
  /** When true, show Program ID on public application window cards. */
  show_program_id_on_public?: boolean;
  /** Public /s/[slug] top bar (crimson strip). */
  public_header_title?: string;
  public_header_subtitle?: string;
  public_header_logo_url?: string;
  public_header_title_href?: string;
  /** Intro card (eyebrow + body). */
  public_hero_eyebrow?: string;
  public_hero_body?: string;
  /** Suffixes removed from end of each program’s display name on the public page. */
  program_display_name_strip_suffixes?: string[];
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
  show_org_on_public: boolean;
  visible_question_columns: string[];
  visible_answer_columns: string[];
  visible_document_columns: string[];
  term_field_settings: TermFieldSetting[];
  show_program_id_on_public: boolean;
  public_header_title: string;
  public_header_subtitle: string;
  public_header_logo_url: string;
  public_header_title_href: string;
  public_hero_eyebrow: string;
  public_hero_body: string;
  program_display_name_strip_suffixes: string[];
  data: CasPublicationData;
  created_at: string;
  updated_at: string;
};

type StoredGroup = CasPublicationData["groups"][number];

export type PublicationPublicHeader = {
  title: string;
  subtitle: string;
  logoUrl: string | null;
  titleHref: string;
};

type CurrentViewBlob = {
  slug: string;
  updated_at: string;
};

export function resolvePublicationPublicHeader(row: PublicationRow): PublicationPublicHeader {
  return {
    title: row.public_header_title.trim() || DEFAULT_PUBLIC_HEADER_TITLE,
    subtitle: row.public_header_subtitle.trim() || DEFAULT_PUBLIC_HEADER_SUBTITLE,
    logoUrl: row.public_header_logo_url.trim() ? row.public_header_logo_url.trim() : null,
    titleHref: row.public_header_title_href.trim() || DEFAULT_PUBLIC_HEADER_TITLE_HREF,
  };
}

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
  const data = ensurePublicationOfferingShapes(ensurePublicationColumnMetadata(parsed.data));
  const ui = publicationUiDefaults(data);
  const visible_question_columns = mergeVisibleDetailKeys(
    parsed.visible_question_columns,
    data.questionColumnOptions,
    ui.visible_question_columns
  );
  const visible_answer_columns = mergeVisibleDetailKeys(
    parsed.visible_answer_columns,
    data.answerColumnOptions,
    ui.visible_answer_columns
  );
  const visible_document_columns = mergeVisibleDetailKeys(
    parsed.visible_document_columns,
    data.documentColumnOptions,
    ui.visible_document_columns
  );
  const term_field_settings = mergeTermFieldSettings(
    parsed.term_field_settings,
    ui.term_field_settings
  );
  const program_display_name_strip_suffixes =
    parsed.program_display_name_strip_suffixes !== undefined &&
    Array.isArray(parsed.program_display_name_strip_suffixes)
      ? [...parsed.program_display_name_strip_suffixes]
      : [...ui.program_display_name_strip_suffixes];
  return {
    id: parsed.slug,
    slug: parsed.slug,
    title: parsed.title,
    visible_columns: parsed.visible_columns,
    default_group_key: parsed.default_group_key,
    show_org_on_public: parsed.show_org_on_public !== false,
    visible_question_columns,
    visible_answer_columns,
    visible_document_columns,
    term_field_settings,
    show_program_id_on_public: parsed.show_program_id_on_public === true,
    public_header_title:
      typeof parsed.public_header_title === "string" ? parsed.public_header_title : "",
    public_header_subtitle:
      typeof parsed.public_header_subtitle === "string" ? parsed.public_header_subtitle : "",
    public_header_logo_url:
      typeof parsed.public_header_logo_url === "string" ? parsed.public_header_logo_url : "",
    public_header_title_href:
      typeof parsed.public_header_title_href === "string" ? parsed.public_header_title_href : "",
    public_hero_eyebrow:
      typeof parsed.public_hero_eyebrow === "string" ? parsed.public_hero_eyebrow : "",
    public_hero_body: typeof parsed.public_hero_body === "string" ? parsed.public_hero_body : "",
    program_display_name_strip_suffixes,
    data,
    created_at: parsed.created_at,
    updated_at: parsed.updated_at,
  };
}

async function persistBlob(body: StoredPublicationBlob): Promise<void> {
  const token = requireBlobToken();
  await put(publicationPathname(body.slug), JSON.stringify(body), {
    access: getBlobAccessMode(),
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

async function persistCurrentView(slug: string): Promise<void> {
  const token = requireBlobToken();
  const body: CurrentViewBlob = {
    slug,
    updated_at: new Date().toISOString(),
  };
  await put(CURRENT_VIEW_PATHNAME, JSON.stringify(body), {
    access: getBlobAccessMode(),
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

function mapToPublicGroup(
  g: StoredGroup,
  visibleColumnKeys: string[],
  questionKeys: string[],
  answerKeys: string[],
  documentKeys: string[],
  programStripSuffixes: string[]
): PublicProgramGroup {
  return {
    groupKey: g.groupKey,
    displayName: cleanProgramDisplayName(g.displayName, programStripSuffixes),
    visibleShared: pickVisibleShared(g.shared, visibleColumnKeys),
    offerings: g.offerings,
    recommendations: g.recommendations,
    recommendationNote: g.recommendationNote,
    recommendationRows: g.recommendationRows,
    questions: filterRecordRows(g.questions, questionKeys),
    documents: filterRecordRows(g.documents, documentKeys),
    answers: filterRecordRows(g.answers, answerKeys),
  };
}

export function toPublicPayload(row: PublicationRow): PublicPublicationPayload {
  const data = row.data;
  const keys = row.visible_columns ?? [];
  const showOrg = row.show_org_on_public;
  const qk = row.visible_question_columns;
  const ak = row.visible_answer_columns;
  const dk = row.visible_document_columns;
  const strip = row.program_display_name_strip_suffixes;
  const header = resolvePublicationPublicHeader(row);
  return {
    title: row.title,
    slug: row.slug,
    defaultGroupKey: row.default_group_key || data.groups[0]?.groupKey || "",
    visibleColumnKeys: keys,
    showOrgContent: showOrg,
    publicHeaderTitle: header.title,
    publicHeaderSubtitle: header.subtitle,
    publicHeaderLogoUrl: header.logoUrl,
    publicHeaderTitleHref: header.titleHref,
    heroEyebrow: row.public_hero_eyebrow.trim() || DEFAULT_PUBLIC_HERO_EYEBROW,
    heroBody: row.public_hero_body.trim() || DEFAULT_PUBLIC_HERO_BODY,
    termFieldSettings: row.term_field_settings,
    showProgramIdOnPublic: row.show_program_id_on_public,
    visibleQuestionColumnKeys: qk,
    visibleAnswerColumnKeys: ak,
    visibleDocumentColumnKeys: dk,
    orgQuestions: showOrg ? data.orgQuestions : [],
    orgAnswers: showOrg ? data.orgAnswers : [],
    groups: data.groups.map((g) => mapToPublicGroup(g, keys, qk, ak, dk, strip)),
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
  const access = getBlobAccessMode();
  try {
    const res = await get(pathname, {
      access,
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

export async function getCurrentViewSlug(): Promise<string | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) return null;
  try {
    const res = await get(CURRENT_VIEW_PATHNAME, {
      access: getBlobAccessMode(),
      token,
      useCache: false,
    });
    if (!res?.stream) return null;
    const text = await new Response(res.stream as ReadableStream).text();
    const parsed = JSON.parse(text) as Partial<CurrentViewBlob>;
    return typeof parsed.slug === "string" && /^[a-z0-9]{8,32}$/.test(parsed.slug)
      ? parsed.slug
      : null;
  } catch {
    return null;
  }
}

export async function getCurrentViewPublication(): Promise<PublicationRow | null> {
  const slug = await getCurrentViewSlug();
  if (!slug) return null;
  return getPublicationBySlug(slug);
}

export async function createPublication(input: {
  slug: string;
  title: string;
  data: CasPublicationData;
}): Promise<void> {
  const data = ensurePublicationOfferingShapes(ensurePublicationColumnMetadata(input.data));
  const vis = defaultVisibleColumns(data.summaryColumnOptions);
  const defaultGroupKey = data.groups[0]?.groupKey ?? "";
  const ui = publicationUiDefaults(data);
  const now = new Date().toISOString();
  const body: StoredPublicationBlob = {
    version: 1,
    slug: input.slug,
    title: input.title,
    visible_columns: vis,
    default_group_key: defaultGroupKey,
    show_org_on_public: true,
    visible_question_columns: ui.visible_question_columns,
    visible_answer_columns: ui.visible_answer_columns,
    visible_document_columns: ui.visible_document_columns,
    term_field_settings: ui.term_field_settings,
    show_program_id_on_public: false,
    public_header_title: "",
    public_header_subtitle: "",
    public_header_logo_url: "",
    public_header_title_href: "",
    public_hero_eyebrow: "",
    public_hero_body: "",
    program_display_name_strip_suffixes: ui.program_display_name_strip_suffixes,
    data,
    created_at: now,
    updated_at: now,
  };
  await persistBlob(body);
  await persistCurrentView(input.slug);
}

function validateSubset(keys: string[] | undefined, allowed: Set<string>): string[] {
  if (!keys) return [];
  return keys.filter((k) => allowed.has(k));
}

export async function updatePublication(
  slug: string,
  patch: {
    title?: string;
    visibleColumnKeys?: string[];
    defaultGroupKey?: string;
    showOrgOnPublic?: boolean;
    showProgramIdOnPublic?: boolean;
    visibleQuestionColumns?: string[];
    visibleAnswerColumns?: string[];
    visibleDocumentColumns?: string[];
    termFieldSettings?: TermFieldSetting[];
    publicHeaderTitle?: string;
    publicHeaderSubtitle?: string;
    publicHeaderLogoUrl?: string;
    publicHeaderTitleHref?: string;
    publicHeroEyebrow?: string;
    publicHeroBody?: string;
    programDisplayNameStripSuffixes?: string[];
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
  const showOrgOnPublic =
    patch.showOrgOnPublic !== undefined
      ? patch.showOrgOnPublic
      : existing.show_org_on_public;
  const show_program_id_on_public =
    patch.showProgramIdOnPublic !== undefined
      ? patch.showProgramIdOnPublic
      : existing.show_program_id_on_public;

  const qOpts = new Set(existing.data.questionColumnOptions);
  const aOpts = new Set(existing.data.answerColumnOptions);
  const dOpts = new Set(existing.data.documentColumnOptions);

  const uiFallback = publicationUiDefaults(existing.data);
  let visible_question_columns = existing.visible_question_columns;
  if (patch.visibleQuestionColumns) {
    visible_question_columns = validateSubset(patch.visibleQuestionColumns, qOpts);
    if (visible_question_columns.length === 0) {
      visible_question_columns = uiFallback.visible_question_columns;
    }
  }
  let visible_answer_columns = existing.visible_answer_columns;
  if (patch.visibleAnswerColumns) {
    visible_answer_columns = validateSubset(patch.visibleAnswerColumns, aOpts);
    if (visible_answer_columns.length === 0) {
      visible_answer_columns = uiFallback.visible_answer_columns;
    }
  }
  let visible_document_columns = existing.visible_document_columns;
  if (patch.visibleDocumentColumns) {
    visible_document_columns = validateSubset(patch.visibleDocumentColumns, dOpts);
    if (visible_document_columns.length === 0) {
      visible_document_columns = uiFallback.visible_document_columns;
    }
  }

  let term_field_settings = existing.term_field_settings;
  if (patch.termFieldSettings) {
    const defaults = publicationUiDefaults(existing.data).term_field_settings;
    const sanitized = patch.termFieldSettings.map((t) => ({
      key: t.key,
      label: String(t.label ?? t.key).slice(0, 200),
      visible: Boolean(t.visible),
      show_in_heading: t.show_in_heading === true,
    }));
    term_field_settings = mergeTermFieldSettings(sanitized, defaults);
  }

  let public_header_title = existing.public_header_title;
  if (patch.publicHeaderTitle !== undefined) {
    public_header_title = patch.publicHeaderTitle.slice(0, 200);
  }
  let public_header_subtitle = existing.public_header_subtitle;
  if (patch.publicHeaderSubtitle !== undefined) {
    public_header_subtitle = patch.publicHeaderSubtitle.slice(0, 300);
  }
  let public_header_logo_url = existing.public_header_logo_url;
  if (patch.publicHeaderLogoUrl !== undefined) {
    public_header_logo_url = patch.publicHeaderLogoUrl.slice(0, 2000);
  }
  let public_header_title_href = existing.public_header_title_href;
  if (patch.publicHeaderTitleHref !== undefined) {
    public_header_title_href = patch.publicHeaderTitleHref.slice(0, 2000);
  }
  let public_hero_eyebrow = existing.public_hero_eyebrow;
  if (patch.publicHeroEyebrow !== undefined) {
    public_hero_eyebrow = patch.publicHeroEyebrow.slice(0, 200);
  }
  let public_hero_body = existing.public_hero_body;
  if (patch.publicHeroBody !== undefined) {
    public_hero_body = patch.publicHeroBody.slice(0, 20000);
  }
  let program_display_name_strip_suffixes = existing.program_display_name_strip_suffixes;
  if (patch.programDisplayNameStripSuffixes !== undefined) {
    program_display_name_strip_suffixes = patch.programDisplayNameStripSuffixes
      .map((s) => String(s).trim().slice(0, 200))
      .filter(Boolean)
      .slice(0, 100);
  }

  const now = new Date().toISOString();
  const body: StoredPublicationBlob = {
    version: 1,
    slug: existing.slug,
    title,
    visible_columns: visible,
    default_group_key: defaultGroupKey,
    show_org_on_public: showOrgOnPublic,
    show_program_id_on_public,
    public_header_title,
    public_header_subtitle,
    public_header_logo_url,
    public_header_title_href,
    public_hero_eyebrow,
    public_hero_body,
    program_display_name_strip_suffixes,
    visible_question_columns,
    visible_answer_columns,
    visible_document_columns,
    term_field_settings,
    data: existing.data,
    created_at: existing.created_at,
    updated_at: now,
  };
  await persistBlob(body);
  await persistCurrentView(existing.slug);
  return getPublicationBySlug(slug);
}

/**
 * Parses a second workbook and merges it into an existing publication (same slug).
 */
export async function mergePublicationFromUpload(
  slug: string,
  buffer: Buffer,
  fileName: string
): Promise<PublicationRow | null> {
  const existing = await getPublicationBySlug(slug);
  if (!existing) return null;
  const parsed = parseCasWorkbook(buffer, fileName);
  const merged = ensurePublicationColumnMetadata(
    mergePublicationData(existing.data, parsed)
  );
  const ui = publicationUiDefaults(merged);
  const summaryOpts = new Set(merged.summaryColumnOptions);
  const summaryKept = existing.visible_columns.filter((k) => summaryOpts.has(k));
  const summaryFallback = defaultVisibleColumns(merged.summaryColumnOptions).filter((k) =>
    summaryOpts.has(k)
  );
  const visible_columns =
    summaryKept.length > 0 ? summaryKept : summaryFallback;
  const visible_question_columns = mergeVisibleDetailKeys(
    existing.visible_question_columns,
    merged.questionColumnOptions,
    ui.visible_question_columns
  );
  const visible_answer_columns = mergeVisibleDetailKeys(
    existing.visible_answer_columns,
    merged.answerColumnOptions,
    ui.visible_answer_columns
  );
  const visible_document_columns = mergeVisibleDetailKeys(
    existing.visible_document_columns,
    merged.documentColumnOptions,
    ui.visible_document_columns
  );
  const term_field_settings = mergeTermFieldSettings(
    existing.term_field_settings,
    ui.term_field_settings
  );
  const default_group_key = merged.groups.some(
    (g) => g.groupKey === existing.default_group_key
  )
    ? existing.default_group_key
    : merged.groups[0]?.groupKey ?? existing.default_group_key;

  const now = new Date().toISOString();
  const body: StoredPublicationBlob = {
    version: 1,
    slug: existing.slug,
    title: existing.title,
    visible_columns:
      visible_columns.length > 0
        ? visible_columns
        : defaultVisibleColumns(merged.summaryColumnOptions),
    default_group_key,
    show_org_on_public: existing.show_org_on_public,
    show_program_id_on_public: existing.show_program_id_on_public,
    visible_question_columns,
    visible_answer_columns,
    visible_document_columns,
    term_field_settings,
    public_header_title: existing.public_header_title,
    public_header_subtitle: existing.public_header_subtitle,
    public_header_logo_url: existing.public_header_logo_url,
    public_header_title_href: existing.public_header_title_href,
    public_hero_eyebrow: existing.public_hero_eyebrow,
    public_hero_body: existing.public_hero_body,
    program_display_name_strip_suffixes: existing.program_display_name_strip_suffixes,
    data: merged,
    created_at: existing.created_at,
    updated_at: now,
  };
  await persistBlob(body);
  await persistCurrentView(existing.slug);
  return getPublicationBySlug(slug);
}
