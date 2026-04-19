import fs from "node:fs/promises";
import path from "node:path";
import { get } from "@vercel/blob";
import { getBlobAccessMode } from "./blob-access";
import type { CasPublicationData, ProgramBranding } from "./types";

export type BrandingRunStatus =
  | "idle"
  | "running"
  | "completed"
  | "error";

export type BrandingProfileStatus = {
  profile: string;
  status: BrandingRunStatus;
  mode?: "guide" | "export";
  startedAt?: string;
  updatedAt?: string;
  completedAt?: string;
  message?: string;
  snapshotId?: string;
};

export type BrandingSnapshotManifest = {
  snapshotId: string;
  profile: string;
  createdAt: string;
  completedAt?: string;
  status: "running" | "completed" | "error";
  totalPrograms?: number;
  okPrograms?: number;
  emptyShellPrograms?: number;
  errorPrograms?: number;
  outputDir: string;
  uploadedAt?: string;
  blobPrefix?: string;
};

type StoredBrandingRecord = ProgramBranding & {
  snapshotId: string;
};

type BrandingLatestPointer = {
  profile: string;
  snapshotId: string;
  uploadedAt: string;
  manifestPath: string;
  programsPath: string;
};

const BRANDING_ROOT = path.join(process.cwd(), ".branding-data");
const PROFILES_ROOT = path.join(BRANDING_ROOT, "profiles");
const SNAPSHOTS_ROOT = path.join(BRANDING_ROOT, "snapshots");
const BLOB_BRANDING_PREFIX = "cas-branding-snapshots";

function profileRoot(profile: string): string {
  return path.join(PROFILES_ROOT, profile);
}

function statusPath(profile: string): string {
  return path.join(profileRoot(profile), "status.json");
}

export function statusPathForProfile(profile: string): string {
  return statusPath(profile);
}

export function authPathForProfile(profile: string): string {
  return path.join(profileRoot(profile), "user.json");
}

export function trailPathForProfile(profile: string): string {
  return path.join(profileRoot(profile), "trail.json");
}

export function nextSnapshotId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function snapshotPath(snapshotId: string, profile: string): string {
  return path.join(SNAPSHOTS_ROOT, snapshotId, profile);
}

export function programRecordPath(snapshotId: string, profile: string, programId: string): string {
  return path.join(snapshotPath(snapshotId, profile), "programs", `${programId}.json`);
}

export function manifestPath(snapshotId: string, profile: string): string {
  return path.join(snapshotPath(snapshotId, profile), "manifest.json");
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function hasBlobToken(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

async function readBlobJson<T>(pathname: string): Promise<T | null> {
  if (!hasBlobToken()) return null;
  try {
    const result = await get(pathname, {
      access: getBlobAccessMode(),
      useCache: false,
    });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function listChildDirs(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    return [];
  }
}

export async function writeProfileStatus(
  profile: string,
  status: BrandingProfileStatus
): Promise<void> {
  const target = statusPath(profile);
  await ensureDir(path.dirname(target));
  await fs.writeFile(target, JSON.stringify(status, null, 2), "utf8");
}

export async function getProfileStatus(profile: string): Promise<BrandingProfileStatus | null> {
  return readJson<BrandingProfileStatus>(statusPath(profile));
}

export async function getAllProfileStatuses(profiles: string[]): Promise<BrandingProfileStatus[]> {
  const rows = await Promise.all(
    profiles.map(async (profile) => {
      const status = await getProfileStatus(profile);
      return (
        status ?? {
          profile,
          status: "idle" as const,
        }
      );
    })
  );
  return rows;
}

export async function getLatestCompletedSnapshotForProfile(
  profile: string
): Promise<BrandingSnapshotManifest | null> {
  const blobManifest = await getLatestBlobSnapshotForProfile(profile);
  if (blobManifest) return blobManifest;
  return getLatestLocalSnapshotForProfile(profile);
}

async function getLatestBlobSnapshotForProfile(
  profile: string
): Promise<BrandingSnapshotManifest | null> {
  const pointer = await readBlobJson<BrandingLatestPointer>(
    `${BLOB_BRANDING_PREFIX}/latest/${profile}.json`
  );
  if (!pointer?.manifestPath) return null;
  const manifest = await readBlobJson<BrandingSnapshotManifest>(pointer.manifestPath);
  if (!manifest || manifest.status !== "completed") return null;
  return manifest;
}

async function getLatestLocalSnapshotForProfile(
  profile: string
): Promise<BrandingSnapshotManifest | null> {
  const snapshotIds = await listChildDirs(SNAPSHOTS_ROOT);
  let best: BrandingSnapshotManifest | null = null;
  for (const snapshotId of snapshotIds) {
    const manifest = await readJson<BrandingSnapshotManifest>(manifestPath(snapshotId, profile));
    if (!manifest || manifest.status !== "completed") continue;
    if (!best || manifest.createdAt > best.createdAt) {
      best = manifest;
    }
  }
  return best;
}

async function readBlobProgramsForProfile(profile: string): Promise<StoredBrandingRecord[]> {
  const pointer = await readBlobJson<BrandingLatestPointer>(
    `${BLOB_BRANDING_PREFIX}/latest/${profile}.json`
  );
  if (!pointer?.programsPath) return [];
  const programs = await readBlobJson<StoredBrandingRecord[]>(pointer.programsPath);
  return Array.isArray(programs) ? programs : [];
}

async function readLocalProgramsForManifest(
  manifest: BrandingSnapshotManifest,
  profile: string
): Promise<StoredBrandingRecord[]> {
  const snapshotDir = snapshotPath(manifest.snapshotId, profile);
  const bundledPrograms = await readJson<StoredBrandingRecord[]>(
    path.join(snapshotDir, "programs.json")
  );
  if (Array.isArray(bundledPrograms)) return bundledPrograms;

  const records: StoredBrandingRecord[] = [];
  const programsDir = path.join(snapshotDir, "programs");
  let names: string[] = [];
  try {
    names = (await fs.readdir(programsDir)).filter((name) => name.endsWith(".json"));
  } catch {
    names = [];
  }
  for (const name of names) {
    const record = await readJson<StoredBrandingRecord>(path.join(programsDir, name));
    if (record) records.push(record);
  }
  return records;
}

export async function getLatestBrandingByProgramId(
  profiles: string[]
): Promise<Map<string, StoredBrandingRecord>> {
  const records = new Map<string, StoredBrandingRecord>();
  for (const profile of profiles) {
    const blobRecords = await readBlobProgramsForProfile(profile);
    const manifest = blobRecords.length > 0 ? null : await getLatestLocalSnapshotForProfile(profile);
    const profileRecords =
      blobRecords.length > 0 || !manifest
        ? blobRecords
        : await readLocalProgramsForManifest(manifest, profile);
    if (profileRecords.length === 0) continue;
    for (const record of profileRecords) {
      if (!record) continue;
      const existing = records.get(record.programId);
      if (!existing) {
        records.set(record.programId, record);
        continue;
      }
      if (existing.status !== "ok" && record.status === "ok") {
        records.set(record.programId, record);
        continue;
      }
      if (existing.capturedAt < record.capturedAt) {
        records.set(record.programId, record);
      }
    }
  }
  return records;
}

export async function mergeLatestBrandingIntoPublicationData(
  data: CasPublicationData,
  profiles: string[]
): Promise<CasPublicationData> {
  const brandingByProgramId = await getLatestBrandingByProgramId(profiles);
  if (brandingByProgramId.size === 0) return data;
  let totalOfferings = 0;
  let brandedOfferings = 0;
  let emptyShellOfferings = 0;
  const groups = data.groups.map((group) => ({
    ...group,
    offerings: group.offerings.map((offering) => {
      totalOfferings += 1;
      const branding = brandingByProgramId.get(offering.programId) ?? null;
      if (branding?.status === "ok") brandedOfferings += 1;
      if (branding?.status === "empty_shell") emptyShellOfferings += 1;
      return {
        ...offering,
        branding,
      };
    }),
  }));
  const snapshotIds = new Set(
    [...brandingByProgramId.values()].map((row) => row.snapshotId).filter(Boolean)
  );
  const brandingProfiles = [...new Set([...brandingByProgramId.values()].map((row) => row.sourceProfile))];
  return {
    ...data,
    groups,
    brandingSnapshotId: [...snapshotIds].sort().at(-1),
    brandingProfiles,
    brandingCoverage: {
      totalOfferings,
      brandedOfferings,
      emptyShellOfferings,
    },
  };
}

export async function buildBrandingAdminState(profiles: string[]) {
  const [statuses, latestSnapshots] = await Promise.all([
    getAllProfileStatuses(profiles),
    Promise.all(profiles.map((profile) => getLatestCompletedSnapshotForProfile(profile))),
  ]);
  return {
    rootDir: BRANDING_ROOT,
    profiles: profiles.map((profile, index) => ({
      profile,
      authPath: authPathForProfile(profile),
      trailPath: trailPathForProfile(profile),
      status: statuses[index],
      latestSnapshot: latestSnapshots[index],
    })),
  };
}
