import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { put } from "@vercel/blob";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const defaultBrandingDataRoot = path.join(repoRoot, ".branding-data");
const blobPrefix = "cas-branding-snapshots";

async function loadEnvFile(filePath) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // Environment files are optional.
  }
}

function usage() {
  console.log(`Usage:
  node tools/branding/upload-snapshot.mjs --profile gradcas --snapshot-id 2026-04-18T12-00-00-000Z
  node tools/branding/upload-snapshot.mjs --snapshot-dir .branding-data/snapshots/<snapshot>/<profile>

Required:
  BLOB_READ_WRITE_TOKEN must be set in .env.local or the environment.

Optional:
  --profile <name>
  --snapshot-id <id>
  --snapshot-dir <dir>
  --json-access public|private      Defaults to CAS_BLOB_ACCESS or private.
  --asset-access public|private     Defaults to CAS_BLOB_ACCESS/private.
  --upload-assets                   Also upload downloaded image assets.
`);
}

function parseArgs(argv) {
  const opts = {
    profile: "",
    snapshotId: "",
    snapshotDir: "",
    jsonAccess: process.env.CAS_BLOB_ACCESS === "public" ? "public" : "private",
    assetAccess:
      process.env.BRANDING_ASSET_ACCESS === "public" || process.env.CAS_BLOB_ACCESS === "public"
        ? "public"
        : "private",
    uploadAssets: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--profile":
        if (!next) throw new Error("Missing value for --profile");
        opts.profile = next;
        i += 1;
        break;
      case "--snapshot-id":
        if (!next) throw new Error("Missing value for --snapshot-id");
        opts.snapshotId = next;
        i += 1;
        break;
      case "--snapshot-dir":
        if (!next) throw new Error("Missing value for --snapshot-dir");
        opts.snapshotDir = next;
        i += 1;
        break;
      case "--json-access":
        if (!next || !["public", "private"].includes(next)) {
          throw new Error("--json-access must be public or private");
        }
        opts.jsonAccess = next;
        i += 1;
        break;
      case "--asset-access":
        if (!next || !["public", "private"].includes(next)) {
          throw new Error("--asset-access must be public or private");
        }
        opts.assetAccess = next;
        i += 1;
        break;
      case "--upload-assets":
        opts.uploadAssets = true;
        break;
      case "--help":
      case "-h":
        usage();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function sanitizeName(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function resolveSnapshotDir(opts) {
  if (opts.snapshotDir) {
    return path.isAbsolute(opts.snapshotDir) ? opts.snapshotDir : path.join(repoRoot, opts.snapshotDir);
  }
  if (!opts.profile || !opts.snapshotId) {
    throw new Error("Provide --snapshot-dir or both --profile and --snapshot-id.");
  }
  return path.join(defaultBrandingDataRoot, "snapshots", opts.snapshotId, sanitizeName(opts.profile));
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function textFromBlocks(blocks) {
  return (blocks ?? [])
    .map((block) => block?.text || "")
    .find((value) => value.trim().length > 0) || "";
}

function htmlFromBlocks(blocks) {
  return (blocks ?? [])
    .map((block) => block?.html || "")
    .find((value) => value.trim().length > 0) || "";
}

function titleFromPayload(payload) {
  const headings = payload.extracted?.headingsAndPanels ?? [];
  const candidate = headings.find((value) => {
    const text = String(value || "").trim();
    return text && !/deadline|branding|configuration|program/i.test(text);
  });
  return candidate || payload.extracted?.title || "";
}

function deadlineFromPayload(payload) {
  const controls = payload.extracted?.controls ?? [];
  const control = controls.find((row) => /deadline/i.test(`${row.label} ${row.value}`));
  if (control) return [control.label, control.value].filter(Boolean).join(": ");
  const heading = (payload.extracted?.headingsAndPanels ?? []).find((value) =>
    /deadline/i.test(String(value || ""))
  );
  return heading || "";
}

async function uploadJson(pathname, value, access) {
  return put(pathname, JSON.stringify(value, null, 2), {
    access,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

async function uploadProgramAssets(payload, snapshotDir, snapshotId, profile, access) {
  const tasks = (payload.downloadedImages ?? []).map(async (relativePath) => {
    const sourcePath = path.isAbsolute(relativePath)
      ? relativePath
      : path.join(repoRoot, relativePath);
    try {
      await fs.access(sourcePath);
    } catch {
      return null;
    }
    const filename = path.basename(sourcePath);
    const pathname = `${blobPrefix}/${snapshotId}/${profile}/assets/${payload.programId}/${filename}`;
    const fileBuffer = await fs.readFile(sourcePath);
    const blob = await put(pathname, fileBuffer, {
      access,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: contentTypeFor(sourcePath),
    });
    return {
      sourcePath: path.relative(snapshotDir, sourcePath),
      pathname: blob.pathname,
      url: blob.url,
    };
  });
  const uploaded = await Promise.all(tasks);
  return uploaded.filter(Boolean);
}

async function normalizeProgram(payload, snapshotDir, snapshotId, profile, assetAccess, uploadAssets) {
  const uploadedAssets = uploadAssets
    ? await uploadProgramAssets(payload, snapshotDir, snapshotId, profile, assetAccess)
    : [];
  const firstAssetUrl = uploadedAssets[0]?.url || "";
  const backgroundUrl = payload.extracted?.backgroundImages?.[0]?.url || "";
  const imageUrl = payload.extracted?.images?.[0]?.src || "";
  const capturedAt = payload.fetchedAt || new Date().toISOString();

  return {
    programId: String(payload.programId || ""),
    sourceProfile: payload.sourceProfile || profile,
    snapshotId,
    capturedAt,
    pageUrl: payload.pageUrl || payload.extracted?.url || "",
    status: payload.status || "error",
    studentFacingTitle: titleFromPayload(payload),
    deadlineText: deadlineFromPayload(payload),
    headerImageUrl: firstAssetUrl || backgroundUrl || imageUrl,
    instructionsHtml: htmlFromBlocks(payload.extracted?.htmlBlocks),
    instructionsText: textFromBlocks(payload.extracted?.htmlBlocks) || payload.extracted?.textSnapshot || "",
    links: (payload.extracted?.links ?? []).map((link) => ({
      text: String(link.text || ""),
      href: String(link.href || ""),
    })),
    extractedSummary: {
      controlCount: payload.extracted?.controls?.length ?? 0,
      imageCount: payload.extracted?.images?.length ?? 0,
      backgroundImageCount: payload.extracted?.backgroundImages?.length ?? 0,
      htmlBlockCount: payload.extracted?.htmlBlocks?.length ?? 0,
      uploadedAssetCount: uploadedAssets.length,
    },
  };
}

async function main() {
  await loadEnvFile(path.join(repoRoot, ".env.local"));
  await loadEnvFile(path.join(repoRoot, ".env.branding"));
  const opts = parseArgs(process.argv.slice(2));
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not set. Add it to .env.local or your environment.");
  }

  const snapshotDir = resolveSnapshotDir(opts);
  const manifest = await readJson(path.join(snapshotDir, "manifest.json"));
  const snapshotId = opts.snapshotId || manifest.snapshotId;
  const profile = sanitizeName(opts.profile || manifest.profile || path.basename(snapshotDir));
  const summary = await readJson(path.join(snapshotDir, "summary.json")).catch(() => []);
  const programsDir = path.join(snapshotDir, "programs");
  let programFolders = [];
  try {
    const entries = await fs.readdir(snapshotDir, { withFileTypes: true });
    programFolders = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    programFolders = [];
  }

  const programs = [];
  const rawPayloads = [];
  for (const folder of programFolders) {
    const payloadPath = path.join(snapshotDir, folder, "branding.json");
    let payload;
    try {
      payload = await readJson(payloadPath);
    } catch {
      continue;
    }
    rawPayloads.push(payload);
  }

  for (let index = 0; index < rawPayloads.length; index += 8) {
    const chunk = rawPayloads.slice(index, index + 8);
    const normalized = await Promise.all(
      chunk.map((payload) =>
        normalizeProgram(
          payload,
          snapshotDir,
          snapshotId,
          profile,
          opts.assetAccess,
          opts.uploadAssets
        )
      )
    );
    programs.push(...normalized);
    console.log(`Prepared ${programs.length}/${rawPayloads.length} programs`);
  }

  await fs.writeFile(path.join(snapshotDir, "programs.json"), JSON.stringify(programs, null, 2), "utf8");

  const uploadedManifest = {
    ...manifest,
    snapshotId,
    profile,
    uploadedAt: new Date().toISOString(),
    blobPrefix: `${blobPrefix}/${snapshotId}/${profile}`,
    totalPrograms: manifest.totalPrograms ?? programs.length,
    okPrograms: manifest.okPrograms ?? programs.filter((row) => row.status === "ok").length,
    emptyShellPrograms:
      manifest.emptyShellPrograms ?? programs.filter((row) => row.status === "empty_shell").length,
    errorPrograms: manifest.errorPrograms ?? programs.filter((row) => row.status === "error").length,
    summary,
  };

  await uploadJson(`${blobPrefix}/${snapshotId}/${profile}/manifest.json`, uploadedManifest, opts.jsonAccess);
  await uploadJson(`${blobPrefix}/${snapshotId}/${profile}/programs.json`, programs, opts.jsonAccess);
  await uploadJson(
    `${blobPrefix}/latest/${profile}.json`,
    {
      profile,
      snapshotId,
      uploadedAt: uploadedManifest.uploadedAt,
      manifestPath: `${blobPrefix}/${snapshotId}/${profile}/manifest.json`,
      programsPath: `${blobPrefix}/${snapshotId}/${profile}/programs.json`,
    },
    opts.jsonAccess
  );

  const localProgramsDirExists = await fs
    .access(programsDir)
    .then(() => true)
    .catch(() => false);

  console.log(
    JSON.stringify(
      {
        profile,
        snapshotId,
        uploadedPrograms: programs.length,
        jsonAccess: opts.jsonAccess,
        assetAccess: opts.assetAccess,
        uploadedAssets: opts.uploadAssets,
        blobPrefix: uploadedManifest.blobPrefix,
        legacyProgramsDirExists: localProgramsDirExists,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
