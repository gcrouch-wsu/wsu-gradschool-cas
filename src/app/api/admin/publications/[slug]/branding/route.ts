import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authPathForProfile,
  buildBrandingAdminState,
  getLatestBrandingByProgramId,
  nextSnapshotId,
  snapshotPath,
  statusPathForProfile,
  trailPathForProfile,
} from "@/lib/branding-store";
import { getPublicationBySlug } from "@/lib/cas-store";
import { inferCasProfile } from "@/lib/cas-profile";
import { unauthorizedIfNotAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";
export const maxDuration = 120;

const DEFAULT_PROFILES = ["gradcas", "engineeringcas"];

function expectedIdsByProfile(row: NonNullable<Awaited<ReturnType<typeof getPublicationBySlug>>>) {
  const out = {
    gradcas: new Set<string>(),
    engineeringcas: new Set<string>(),
  };
  for (const group of row.data.groups) {
    for (const offering of group.offerings) {
      const programId = offering.programId.trim();
      if (!programId) continue;
      const profile = inferCasProfile({
        programId,
        sourceProfile: offering.sourceProfile,
        sourceFileName: row.data.sourceFileName,
      });
      if (profile === "engineeringcas") out.engineeringcas.add(programId);
      else out.gradcas.add(programId);
    }
  }
  return out;
}

const postSchema = z.object({
  action: z.enum(["guide", "export"]),
  profile: z.string().trim().min(1).max(100),
});

async function spawnBrandingProcess(args: string[]) {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
}

async function writeProgramIdsFile(slug: string, profile: string, ids: string[]): Promise<string> {
  const jobsDir = path.join(process.cwd(), ".branding-data", "jobs");
  await fs.mkdir(jobsDir, { recursive: true });
  const filePath = path.join(
    jobsDir,
    `${slug}-${profile}-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`
  );
  await fs.writeFile(filePath, ids.join(os.EOL), "utf8");
  return filePath;
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const deny = await unauthorizedIfNotAdmin();
  if (deny) return deny;
  const { slug } = await ctx.params;
  const row = await getPublicationBySlug(slug);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [branding, brandingByProgramId] = await Promise.all([
    buildBrandingAdminState(DEFAULT_PROFILES),
    getLatestBrandingByProgramId(DEFAULT_PROFILES),
  ]);
  const expected = expectedIdsByProfile(row);
  const profileStatus = DEFAULT_PROFILES.map((profile) => {
    const ids = [...expected[profile as keyof typeof expected]];
    const capturedAny = ids.filter((id) => brandingByProgramId.has(id));
    const capturedOk = ids.filter((id) => brandingByProgramId.get(id)?.status === "ok");
    const missing = ids.filter((id) => !brandingByProgramId.get(id));
    const latest = branding.profiles.find((p) => p.profile === profile)?.latestSnapshot ?? null;
    const hasMissingIds = missing.length > 0;
    const dataNewerThanSnapshot = Boolean(
      latest?.completedAt && latest.completedAt < row.updated_at
    );
    const status =
      ids.length === 0
        ? "not_applicable"
        : capturedAny.length === 0 || hasMissingIds
          ? "missing"
          : dataNewerThanSnapshot
            ? "stale"
            : "current";
    return {
      profile,
      label: profile === "gradcas" ? "GradCAS" : "EngineeringCAS",
      expectedExcelName: profile === "gradcas" ? "GradCAS.xlsx" : "EngCAS.xlsx",
      expectedProgramCount: ids.length,
      capturedProgramCount: capturedAny.length,
      okBrandingProgramCount: capturedOk.length,
      missingProgramCount: missing.length,
      missingProgramIds: missing.slice(0, 25),
      status,
      hasMissingIds,
      dataNewerThanSnapshot,
      statusDetail:
        status === "missing"
          ? `${missing.length} expected Program ID${missing.length === 1 ? "" : "s"} missing from the latest branding snapshot.`
          : status === "stale"
            ? "All expected Program IDs have captures, but the latest branding snapshot predates the latest publication save."
            : status === "current"
              ? "All expected Program IDs have captures and the latest snapshot is newer than the publication save."
              : "This publication has no expected Program IDs for this profile.",
      latestSnapshotId: latest?.snapshotId ?? null,
      latestCompletedAt: latest?.completedAt ?? null,
    };
  });
  return NextResponse.json({
    currentCoverage: row.data.brandingCoverage ?? {
      totalOfferings: row.data.groups.reduce((sum, group) => sum + group.offerings.length, 0),
      brandedOfferings: 0,
      emptyShellOfferings: 0,
    },
    currentSnapshotId: row.data.brandingSnapshotId ?? null,
    currentProfiles: row.data.brandingProfiles ?? [],
    captureManifest: {
      publicationSlug: row.slug,
      publicationTitle: row.title,
      publicationUpdatedAt: row.updated_at,
      blobPath: `cas-branding-capture/${row.slug}.json`,
      currentPointerPath: "cas-branding-capture/current.json",
      profiles: profileStatus,
      localAppUrl: "http://127.0.0.1:5050",
    },
    branding,
  });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const deny = await unauthorizedIfNotAdmin();
  if (deny) return deny;

  // Server-side Playwright spawn is obsolete; use the local Flask branding app.
  if (process.env.ALLOW_SERVER_BRANDING_CAPTURE !== "1") {
    return NextResponse.json(
      {
        error:
          "Server-side branding capture is disabled. Use the local Flask app at http://127.0.0.1:5050.",
      },
      { status: 410 }
    );
  }

  const { slug } = await ctx.params;
  const row = await getPublicationBySlug(slug);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const { action, profile } = parsed.data;
  const statusFile = statusPathForProfile(profile);
  const authFile = authPathForProfile(profile);
  const trailFile = trailPathForProfile(profile);

  if (action === "guide") {
    await spawnBrandingProcess([
      "tools/branding/cli.mjs",
      "guide",
      "--profile",
      profile,
      "--auth-file",
      authFile,
      "--trail-file",
      trailFile,
      "--status-file",
      statusFile,
      "--non-interactive",
    ]);
    return NextResponse.json({
      ok: true,
      message: `Started guided branding login for ${profile}. Finish in the browser, then close it when done.`,
    });
  }

  const expected = expectedIdsByProfile(row);
  const ids = [
    ...(expected[profile as keyof typeof expected] ?? new Set<string>()),
  ];
  const idFile = await writeProgramIdsFile(slug, profile, ids);
  const snapshotId = nextSnapshotId();
  const outputDir = snapshotPath(snapshotId, profile);
  await spawnBrandingProcess([
    "tools/branding/cli.mjs",
    "export",
    "--profile",
    profile,
    "--auth-file",
    authFile,
    "--trail-file",
    trailFile,
    "--status-file",
    statusFile,
    "--output-dir",
    outputDir,
    "--id-file",
    idFile,
    "--delay-ms",
    "4000",
    "--non-interactive",
  ]);
  return NextResponse.json({
    ok: true,
    message: `Started branding export for ${profile} across ${ids.length} Program IDs.`,
    snapshotId,
  });
}
