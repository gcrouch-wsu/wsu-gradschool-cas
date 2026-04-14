import { z } from "zod";
import type { PublicationRow } from "./cas-store";

export const PUBLICATION_SETTINGS_EXPORT_VERSION = 1 as const;

const termFieldSettingSchema = z.object({
  key: z.string(),
  label: z.string(),
  visible: z.boolean(),
  show_in_heading: z.boolean().optional(),
});

/** Fields that can be exported/imported without the CAS workbook payload. */
export const publicationSettingsPatchSchema = z.object({
  title: z.string().max(500).optional(),
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
});

export type PublicationSettingsPatch = z.infer<typeof publicationSettingsPatchSchema>;

export type PublicationSettingsExportFile = {
  exportVersion: typeof PUBLICATION_SETTINGS_EXPORT_VERSION;
  exportedAt: string;
  /** Slug this file was exported from (informational; import applies to the open admin publication). */
  sourceSlug: string;
  settings: PublicationSettingsPatch;
};

export function buildPublicationSettingsExport(row: PublicationRow): PublicationSettingsExportFile {
  return {
    exportVersion: PUBLICATION_SETTINGS_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    sourceSlug: row.slug,
    settings: {
      title: row.title,
      visibleColumnKeys: [...row.visible_columns],
      defaultGroupKey: row.default_group_key,
      showOrgOnPublic: row.show_org_on_public,
      showProgramIdOnPublic: row.show_program_id_on_public,
      visibleQuestionColumns: [...row.visible_question_columns],
      visibleAnswerColumns: [...row.visible_answer_columns],
      visibleDocumentColumns: [...row.visible_document_columns],
      termFieldSettings: row.term_field_settings.map((t) => ({ ...t })),
      publicHeaderTitle: row.public_header_title,
      publicHeaderSubtitle: row.public_header_subtitle,
      publicHeaderLogoUrl: row.public_header_logo_url,
      publicHeaderTitleHref: row.public_header_title_href,
      publicHeroEyebrow: row.public_hero_eyebrow,
      publicHeroBody: row.public_hero_body,
      programDisplayNameStripSuffixes: [...row.program_display_name_strip_suffixes],
    },
  };
}

function extractSettingsObject(body: unknown): unknown {
  if (body === null || typeof body !== "object") {
    throw new Error("Import body must be a JSON object.");
  }
  const o = body as Record<string, unknown>;
  if ("settings" in o && o.settings !== null && typeof o.settings === "object") {
    return o.settings;
  }
  return body;
}

export function parsePublicationSettingsImport(body: unknown): PublicationSettingsPatch {
  const inner = extractSettingsObject(body);
  return publicationSettingsPatchSchema.parse(inner);
}

export type SanitizedPublicationSettingsPatch = {
  patch: PublicationSettingsPatch;
  /** True when import asked for a default program key that does not exist in this workbook. */
  droppedDefaultGroupKey: boolean;
};

/** Drops keys that cannot apply to the current workbook (e.g. stale default program). */
export function sanitizePublicationSettingsPatch(
  row: PublicationRow,
  patch: PublicationSettingsPatch
): SanitizedPublicationSettingsPatch {
  const out: PublicationSettingsPatch = { ...patch };
  const groupKeys = new Set(row.data.groups.map((g) => g.groupKey));
  let droppedDefaultGroupKey = false;
  if (
    out.defaultGroupKey !== undefined &&
    out.defaultGroupKey !== "" &&
    !groupKeys.has(out.defaultGroupKey)
  ) {
    delete out.defaultGroupKey;
    droppedDefaultGroupKey = true;
  }
  return { patch: out, droppedDefaultGroupKey };
}
