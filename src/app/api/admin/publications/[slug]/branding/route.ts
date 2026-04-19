import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authPathForProfile,
  buildBrandingAdminState,
  nextSnapshotId,
  snapshotPath,
  statusPathForProfile,
  trailPathForProfile,
} from "@/lib/branding-store";
import { getPublicationBySlug } from "@/lib/cas-store";
import { unauthorizedIfNotAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";
export const maxDuration = 120;

const DEFAULT_PROFILES = ["gradcas", "engineeringcas"];

const postSchema = z.object({
  action: z.enum(["guide", "export"]),
  profile: z.string().trim().min(1).max(100),
});

function allProgramIdsFromPublication(row: NonNullable<Awaited<ReturnType<typeof getPublicationBySlug>>>) {
  return [
    ...new Set(
      row.data.groups.flatMap((group) => group.offerings.map((offering) => offering.programId.trim())).filter(Boolean)
    ),
  ];
}

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
  const branding = await buildBrandingAdminState(DEFAULT_PROFILES);
  return NextResponse.json({
    currentCoverage: row.data.brandingCoverage ?? {
      totalOfferings: row.data.groups.reduce((sum, group) => sum + group.offerings.length, 0),
      brandedOfferings: 0,
      emptyShellOfferings: 0,
    },
    currentSnapshotId: row.data.brandingSnapshotId ?? null,
    currentProfiles: row.data.brandingProfiles ?? [],
    branding,
  });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const deny = await unauthorizedIfNotAdmin();
  if (deny) return deny;
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
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
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

  const ids = allProgramIdsFromPublication(row);
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
