/** Columns often duplicated from Program Attributes; hide by default on detail tables. */
export const REDUNDANT_DETAIL_COLUMN_KEYS = new Set(
  ["cycle", "organization", "program", "program id"].map((s) => s.toLowerCase())
);

export interface TermFieldSetting {
  key: string;
  label: string;
  visible: boolean;
  /** When true, this field’s value is included in the application window card title (e.g. Start Term · Start Year). */
  show_in_heading?: boolean;
}

export interface CasOffering {
  programId: string;
  /** Legacy single-line summary (still stored for exports). */
  termLine: string;
  /** Columns that differ within the program group (raw values). */
  varying: Record<string, string>;
  /** Ordered term / date fields for public bullets (from Program Attributes row). */
  termParts: { key: string; value: string }[];
}

/** Recommendation sheet values for one CAS Program ID, labeled for public display when terms differ. */
export interface RecommendationByOffering {
  programId: string;
  /** Short label aligned with application window (e.g. Start Term · Start Year). */
  windowLabel: string;
  values: Record<string, string>;
}

export interface CasProgramGroup {
  groupKey: string;
  displayName: string;
  shared: Record<string, string>;
  offerings: CasOffering[];
  recommendations: Record<string, string> | null;
  recommendationNote?: string;
  /** When set, `recommendations` is only a fallback; show each row’s `values` under its `windowLabel`. */
  recommendationRows?: RecommendationByOffering[];
  questions: Record<string, string>[];
  documents: Record<string, string>[];
  answers: Record<string, string>[];
}

export interface CasPublicationData {
  sourceFileName: string;
  orgQuestions: Record<string, string>[];
  orgAnswers: Record<string, string>[];
  groups: CasProgramGroup[];
  summaryColumnOptions: string[];
  /** Union of column keys appearing in program Questions (for admin picker). */
  questionColumnOptions: string[];
  answerColumnOptions: string[];
  documentColumnOptions: string[];
}

export interface PublicPublicationPayload {
  title: string;
  slug: string;
  defaultGroupKey: string;
  visibleColumnKeys: string[];
  showOrgContent: boolean;
  /** Top bar on /s/[slug] only (not the main site header). */
  publicHeaderTitle: string;
  publicHeaderSubtitle: string;
  publicHeaderLogoUrl: string | null;
  publicHeaderTitleHref: string;
  /** Intro card above search. */
  heroEyebrow: string;
  heroBody: string;
  /** When true, show CAS Program ID on application window cards (off by default). */
  showProgramIdOnPublic: boolean;
  termFieldSettings: TermFieldSetting[];
  /** Ordered keys for program question table columns on the public page. */
  visibleQuestionColumnKeys: string[];
  visibleAnswerColumnKeys: string[];
  visibleDocumentColumnKeys: string[];
  orgQuestions: Record<string, string>[];
  orgAnswers: Record<string, string>[];
  groups: PublicProgramGroup[];
}

export interface PublicProgramGroup {
  groupKey: string;
  displayName: string;
  visibleShared: Record<string, string>;
  offerings: CasOffering[];
  recommendations: Record<string, string> | null;
  recommendationNote?: string;
  recommendationRows?: RecommendationByOffering[];
  questions: Record<string, string>[];
  documents: Record<string, string>[];
  answers: Record<string, string>[];
}
