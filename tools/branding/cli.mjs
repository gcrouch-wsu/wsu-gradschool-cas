import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const defaultEnvFile = path.join(repoRoot, ".env.branding");
const defaultAuthFile = path.join(repoRoot, "tools", "branding", ".auth", "user.json");
const defaultTrailFile = path.join(repoRoot, "tools", "branding", ".auth", "trail.json");
const defaultOutputDir = path.join(repoRoot, "tools", "branding", "output");
const defaultBrandingDataRoot = path.join(repoRoot, ".branding-data");
const defaultBaseUrl =
  "https://configuration.prelaunch.cas.myliaison.com/configuration/assets/index.html#!/programBranding";
const defaultLoginUrl = "https://prelaunch.webadmit.org/";
const defaultChannel = "msedge";

function loadEnvFile(filePath) {
  return fs
    .readFile(filePath, "utf8")
    .then((text) => {
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        const value = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
        if (!(key in process.env)) process.env[key] = value;
      }
    })
    .catch(() => {});
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const opts = {
    command,
    ids: [],
    idFile: "",
    xlsxFiles: [],
    sheetName: "Program Attributes",
    outputDir: "",
    authFile: "",
    trailFile: "",
    statusFile: "",
    profile: "",
    nonInteractive: false,
    baseUrl: "",
    loginUrl: "",
    channel: "",
    timeoutMs: 60000,
    delayMs: 2500,
    resetEach: true,
    loginOnly: false,
  };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    const next = rest[i + 1];
    switch (arg) {
      case "--id":
        if (!next) throw new Error("Missing value for --id");
        opts.ids.push(next);
        i += 1;
        break;
      case "--ids":
        if (!next) throw new Error("Missing value for --ids");
        opts.ids.push(...next.split(",").map((s) => s.trim()).filter(Boolean));
        i += 1;
        break;
      case "--id-file":
        if (!next) throw new Error("Missing value for --id-file");
        opts.idFile = next;
        i += 1;
        break;
      case "--xlsx":
        if (!next) throw new Error("Missing value for --xlsx");
        opts.xlsxFiles.push(next);
        i += 1;
        break;
      case "--sheet":
        if (!next) throw new Error("Missing value for --sheet");
        opts.sheetName = next;
        i += 1;
        break;
      case "--output-dir":
        if (!next) throw new Error("Missing value for --output-dir");
        opts.outputDir = next;
        i += 1;
        break;
      case "--auth-file":
        if (!next) throw new Error("Missing value for --auth-file");
        opts.authFile = next;
        i += 1;
        break;
      case "--trail-file":
        if (!next) throw new Error("Missing value for --trail-file");
        opts.trailFile = next;
        i += 1;
        break;
      case "--status-file":
        if (!next) throw new Error("Missing value for --status-file");
        opts.statusFile = next;
        i += 1;
        break;
      case "--profile":
        if (!next) throw new Error("Missing value for --profile");
        opts.profile = next;
        i += 1;
        break;
      case "--base-url":
        if (!next) throw new Error("Missing value for --base-url");
        opts.baseUrl = next;
        i += 1;
        break;
      case "--login-url":
        if (!next) throw new Error("Missing value for --login-url");
        opts.loginUrl = next;
        i += 1;
        break;
      case "--channel":
        if (!next) throw new Error("Missing value for --channel");
        opts.channel = next;
        i += 1;
        break;
      case "--timeout-ms":
        if (!next) throw new Error("Missing value for --timeout-ms");
        opts.timeoutMs = Number(next);
        i += 1;
        break;
      case "--delay-ms":
        if (!next) throw new Error("Missing value for --delay-ms");
        opts.delayMs = Number(next);
        i += 1;
        break;
      case "--no-reset":
        opts.resetEach = false;
        break;
      case "--login-only":
        opts.loginOnly = true;
        break;
      case "--non-interactive":
        opts.nonInteractive = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

function usage() {
  console.log(`Usage:
  npm run branding:login
  npm run branding:login -- --login-only
  npm run branding:record
  npm run branding:export -- --id 547960
  npm run branding:export -- --ids 547960,547961
  npm run branding:export -- --id-file tools/branding/program-ids.txt
  npm run branding:export -- --xlsx GradCAS.xlsx --xlsx EngCAS.xlsx

Optional flags:
  --login-url <url>
  --auth-file <path>
  --trail-file <path>
  --status-file <path>
  --profile <name>
  --xlsx <workbook path>
  --sheet <sheet name>
  --output-dir <dir>
  --base-url <url>
  --channel <browser channel>
  --timeout-ms <number>
  --delay-ms <number>
  --no-reset
  --non-interactive`);
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function resolveFilePath(filePath, fallback) {
  const target = filePath || fallback;
  return path.isAbsolute(target) ? target : path.join(repoRoot, target);
}

function sanitizeName(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function profileRoot(profile) {
  return path.join(defaultBrandingDataRoot, "profiles", sanitizeName(profile));
}

function snapshotRoot(profile) {
  return path.join(defaultBrandingDataRoot, "snapshots");
}

function currentSnapshotId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function buildSettings(opts) {
  const profile = opts.profile.trim();
  const authFallback = profile ? path.join(profileRoot(profile), "user.json") : defaultAuthFile;
  const trailFallback = profile ? path.join(profileRoot(profile), "trail.json") : defaultTrailFile;
  const outputFallback = profile
    ? path.join(snapshotRoot(profile), currentSnapshotId(), sanitizeName(profile))
    : defaultOutputDir;
  const statusFallback = profile ? path.join(profileRoot(profile), "status.json") : "";
  return {
    command: opts.command,
    profile,
    baseUrl: opts.baseUrl || process.env.BRANDING_BASE_URL || defaultBaseUrl,
    loginUrl: opts.loginUrl || process.env.BRANDING_LOGIN_URL || defaultLoginUrl,
    authFile: resolveFilePath(
      opts.authFile || process.env.BRANDING_AUTH_FILE || "",
      authFallback
    ),
    trailFile: resolveFilePath(
      opts.trailFile || process.env.BRANDING_TRAIL_FILE || "",
      trailFallback
    ),
    outputDir: resolveFilePath(opts.outputDir || "", outputFallback),
    statusFile: resolveFilePath(opts.statusFile || "", statusFallback),
    channel: opts.channel || process.env.BRANDING_BROWSER_CHANNEL || defaultChannel,
    timeoutMs: Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 60000,
    delayMs: Number.isFinite(opts.delayMs) ? opts.delayMs : 2500,
    resetEach: opts.resetEach !== false,
    nonInteractive: opts.nonInteractive === true,
  };
}

async function openBrowser(settings, storageState) {
  const browser = await chromium.launch({
    channel: settings.channel,
    headless: false,
  });
  const context = await browser.newContext(
    storageState ? { storageState, viewport: { width: 1440, height: 1100 } } : {}
  );
  context.setDefaultTimeout(settings.timeoutMs);
  const page = await context.newPage();
  return { browser, context, page };
}

async function prompt(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    await rl.question(message);
  } finally {
    rl.close();
  }
}

async function awaitUserCompletion(message, page, settings) {
  if (!settings.nonInteractive && process.stdin.isTTY) {
    await prompt(message);
    return;
  }
  console.log("Close the browser window when you are done.");
  const browser = page.context().browser();
  await Promise.race([
    new Promise((resolve) => page.once("close", resolve)),
    new Promise((resolve) => browser.once("disconnected", resolve)),
  ]);
}

async function updateStatus(settings, patch) {
  if (!settings.statusFile) return;
  const next = {
    profile: settings.profile || null,
    updatedAt: new Date().toISOString(),
    ...patch,
  };
  await ensureDir(path.dirname(settings.statusFile));
  let merged = next;
  try {
    const prior = JSON.parse(await fs.readFile(settings.statusFile, "utf8"));
    merged = { ...prior, ...next };
  } catch {
    merged = next;
  }
  await fs.writeFile(settings.statusFile, JSON.stringify(merged, null, 2), "utf8");
}

async function login(settings) {
  await ensureDir(path.dirname(settings.authFile));
  const { browser, context, page } = await openBrowser(settings);
  try {
    await updateStatus(settings, { mode: "login", status: "running", startedAt: new Date().toISOString() });
    await page.goto(settings.loginUrl, { waitUntil: "domcontentloaded" });
    console.log(`Opened login page ${settings.loginUrl}`);
    console.log("Complete login, MFA, and any prompts in the browser window.");
    console.log(`After login, make sure you can open a branding page such as ${settings.baseUrl}/547960.`);
    await awaitUserCompletion(
      "Press Enter here after you are fully logged in and the portal is working...",
      page,
      settings
    );
    await context.storageState({ path: settings.authFile });
    console.log(`Saved auth state to ${settings.authFile}`);
    await updateStatus(settings, { mode: "login", status: "completed", completedAt: new Date().toISOString(), message: "Auth state saved." });
  } finally {
    await browser.close().catch(() => {});
  }
}

async function collectTrailWhileBrowsing(page, promptText, settings) {
  const visited = [];
  const capture = (url) => {
    if (!url || !isRelevantTrailUrl(url)) return;
    if (visited.some((entry) => entry.url === url)) return;
    visited.push({
      url,
      capturedAt: new Date().toISOString(),
    });
    console.log(`Captured: ${url}`);
  };
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) capture(frame.url());
  });
  page.on("load", () => capture(page.url()));
  capture(page.url());
  await awaitUserCompletion(promptText, page, settings);
  return visited;
}

async function saveJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function loadJson(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return JSON.parse(text);
}

function isRelevantTrailUrl(url) {
  return (
    url.includes("configuration.prelaunch.cas.myliaison.com") ||
    url.includes("prelaunch.webadmit.org")
  );
}

async function recordTrail(settings) {
  await fs.access(settings.authFile).catch(() => {
    throw new Error(
      `Missing saved auth at ${settings.authFile}. Run 'npm run branding:login' first.`
    );
  });
  const { browser, context, page } = await openBrowser(settings, settings.authFile);
  try {
    await updateStatus(settings, { mode: "record", status: "running", startedAt: new Date().toISOString() });
    await page.goto(settings.loginUrl, { waitUntil: "domcontentloaded" });
    console.log("Use the browser normally now.");
    console.log("After login, click through the portal exactly as you normally do.");
    console.log("Open two or three working branding pages, then return here.");
    const visited = await collectTrailWhileBrowsing(page, "Press Enter after you have clicked through the portal and loaded a few good branding pages...", settings);
    const trail = {
      loginUrl: settings.loginUrl,
      baseUrl: settings.baseUrl,
      recordedAt: new Date().toISOString(),
      entries: visited.slice(-20),
    };
    await context.storageState({ path: settings.authFile });
    await saveJson(settings.trailFile, trail);
    console.log(`Saved updated auth state to ${settings.authFile}`);
    console.log(`Saved navigation trail to ${settings.trailFile}`);
    await updateStatus(settings, { mode: "record", status: "completed", completedAt: new Date().toISOString(), message: "Trail saved." });
  } finally {
    await browser.close().catch(() => {});
  }
}

async function guideLogin(settings) {
  await ensureDir(path.dirname(settings.authFile));
  await ensureDir(path.dirname(settings.trailFile));
  const { browser, context, page } = await openBrowser(settings);
  try {
    await updateStatus(settings, { mode: "guide", status: "running", startedAt: new Date().toISOString() });
    await page.goto(settings.loginUrl, { waitUntil: "domcontentloaded" });
    console.log(`Opened login page ${settings.loginUrl}`);
    console.log("Sign in, complete MFA, then click through the portal exactly as you normally do.");
    console.log("Go to CAS Configuration Portal, choose the correct organization/cycle, and open two or three working branding pages.");
    const visited = await collectTrailWhileBrowsing(page, "Press Enter after login is complete and you have opened a few good branding pages...", settings);
    const trail = {
      loginUrl: settings.loginUrl,
      baseUrl: settings.baseUrl,
      recordedAt: new Date().toISOString(),
      entries: visited.slice(-20),
    };
    await context.storageState({ path: settings.authFile });
    await saveJson(settings.trailFile, trail);
    console.log(`Saved auth state to ${settings.authFile}`);
    console.log(`Saved navigation trail to ${settings.trailFile}`);
    await updateStatus(settings, { mode: "guide", status: "completed", completedAt: new Date().toISOString(), message: "Auth state and trail saved." });
  } finally {
    await browser.close().catch(() => {});
  }
}

async function waitForBrandingReady(page, settings) {
  await page.waitForSelector("section.branding", {
    state: "attached",
    timeout: settings.timeoutMs,
  });
  await page
    .waitForSelector(
      "section.branding .brand-edit-btn, section.branding [data-ng-bind-html], section.branding [style*='background-image']",
      {
        state: "attached",
        timeout: settings.timeoutMs,
      }
    )
    .catch(() => {});
  await page.waitForTimeout(settings.delayMs);
}

async function resetToOrganization(page, settings) {
  const backLink = page.locator("a", { hasText: "Back to Organization" }).first();
  if ((await backLink.count()) === 0) return;
  await backLink.click().catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(settings.delayMs);
}

async function followRecordedTrail(page, settings) {
  try {
    const trail = await loadJson(settings.trailFile);
    const entries = Array.isArray(trail.entries) ? trail.entries : [];
    const usable = entries
      .map((entry) => (entry && typeof entry.url === "string" ? entry.url : ""))
      .filter(Boolean)
      .filter((url) => !url.includes("/programBranding/"))
      .slice(-5);
    for (const url of usable) {
      console.log(`Replaying trail: ${url}`);
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(settings.delayMs);
    }
  } catch {
    // Trail is optional.
  }
}

function readWorkbookProgramIds(filePath, sheetName) {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Workbook ${filePath} is missing sheet '${sheetName}'.`);
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  return rows
    .map((row) => {
      if (!row || typeof row !== "object") return "";
      const value = row["Program ID"] ?? row["ProgramId"] ?? row["program id"] ?? "";
      return String(value).trim();
    })
    .filter(Boolean);
}

async function readProgramIds(opts) {
  const ids = [...opts.ids];
  if (opts.idFile) {
    const idFile = path.isAbsolute(opts.idFile) ? opts.idFile : path.join(repoRoot, opts.idFile);
    const fileText = await fs.readFile(idFile, "utf8");
    ids.push(
      ...fileText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    );
  }
  for (const xlsxFile of opts.xlsxFiles) {
    const resolved = path.isAbsolute(xlsxFile) ? xlsxFile : path.join(repoRoot, xlsxFile);
    ids.push(...readWorkbookProgramIds(resolved, opts.sheetName));
  }
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) {
    throw new Error("No program IDs provided. Use --id, --ids, --id-file, or --xlsx.");
  }
  return unique;
}

async function saveText(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, value, "utf8");
}

function absolutizeUrl(value, currentUrl) {
  if (!value) return "";
  try {
    return new URL(value, currentUrl).toString();
  } catch {
    return value;
  }
}

async function downloadImageAssets(context, pageUrl, imageUrls, targetDir) {
  const cookies = await context.cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const downloaded = [];
  for (const imageUrl of imageUrls) {
    if (!/^https?:/i.test(imageUrl)) continue;
    try {
      const res = await fetch(imageUrl, {
        headers: {
          cookie: cookieHeader,
          referer: pageUrl,
        },
      });
      if (!res.ok) continue;
      const type = res.headers.get("content-type") || "";
      if (!type.startsWith("image/")) continue;
      const extension = type.split("/")[1]?.split(";")[0] || "bin";
      const baseName = path.basename(new URL(imageUrl).pathname) || "branding-image";
      const safeName = sanitizeName(baseName.replace(/\.[^.]+$/, "")) || "branding-image";
      const filePath = path.join(targetDir, `${safeName}.${extension}`);
      const arrayBuffer = await res.arrayBuffer();
      await fs.writeFile(filePath, Buffer.from(arrayBuffer));
      downloaded.push(filePath);
    } catch {
      // Some assets may require more request context than cookie + referer.
    }
  }
  return downloaded;
}

async function extractBranding(page) {
  return page.evaluate(() => {
    const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const brandingRoot = document.querySelector("section.branding") || document.body;
    const controls = [];
    const elements = Array.from(
      brandingRoot.querySelectorAll("input, textarea, select, [contenteditable='true']")
    );
    for (const el of elements) {
      const input = el;
      const id = input.getAttribute("id") || "";
      let label =
        input.getAttribute("aria-label") ||
        input.getAttribute("placeholder") ||
        input.getAttribute("name") ||
        "";
      if (!label && id) {
        const labelEl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        label = labelEl?.textContent || "";
      }
      const row =
        input.closest(".form-group, .field, .row, .control-group, .ng-scope") || input.parentElement;
      if (!label) {
        const nearby = row?.querySelector("label, .control-label, .field-label, .label");
        label = nearby?.textContent || "";
      }
      const tag = input.tagName.toLowerCase();
      let value = "";
      if (tag === "input" || tag === "textarea" || tag === "select") {
        value = "value" in input ? input.value : input.textContent || "";
      } else {
        value = input.textContent || "";
      }
      const checked = tag === "input" && "checked" in input ? Boolean(input.checked) : undefined;
      if (!clean(label) && !clean(value)) continue;
      controls.push({
        label: clean(label),
        value: clean(value),
        type: input.getAttribute("type") || tag,
        checked,
      });
    }

    const headingsAndPanels = Array.from(
      brandingRoot.querySelectorAll("h1, h2, h3, h4, .tab-pane, .panel, .card")
    )
      .map((el) => clean(el.textContent))
      .filter(Boolean)
      .slice(0, 200);

    const images = Array.from(brandingRoot.querySelectorAll("img"))
      .map((img) => ({
        alt: clean(img.alt),
        src: img.currentSrc || img.src || "",
        width: img.naturalWidth || img.width || 0,
        height: img.naturalHeight || img.height || 0,
      }))
      .filter((img) => img.src);

    const backgroundImages = Array.from(brandingRoot.querySelectorAll("*"))
      .map((el) => {
        const style = el.getAttribute("style") || "";
        const title = el.getAttribute("title") || "";
        const alt = el.getAttribute("alt") || "";
        const match = /background-image:\s*url\((['"]?)(.*?)\1\)/i.exec(style);
        const url = match?.[2] || title || alt;
        if (!url || !/^https?:|^\//i.test(url)) return null;
        return {
          url,
          text: clean(el.textContent).slice(0, 200),
        };
      })
      .filter(Boolean);

    const htmlBlocks = Array.from(
      brandingRoot.querySelectorAll("[data-ng-bind-html], .ql-editor, .note-editable, .fr-view")
    )
      .map((el) => ({
        text: clean(el.textContent),
        html: el.innerHTML,
      }))
      .filter((block) => block.text || clean(block.html))
      .slice(0, 20);

    const links = Array.from(brandingRoot.querySelectorAll("a[href]"))
      .map((a) => ({
        text: clean(a.textContent),
        href: a.getAttribute("href") || "",
      }))
      .filter((link) => link.href)
      .slice(0, 200);

    return {
      title: document.title,
      url: window.location.href,
      controls,
      headingsAndPanels,
      images,
      backgroundImages,
      htmlBlocks,
      links,
      textSnapshot: clean(brandingRoot.textContent),
    };
  });
}

async function exportBranding(settings, opts) {
  const ids = await readProgramIds(opts);
  await fs.access(settings.authFile).catch(() => {
    throw new Error(
      `Missing saved auth at ${settings.authFile}. Run 'npm run branding:login' first.`
    );
  });
  await ensureDir(settings.outputDir);
  const { browser, context, page } = await openBrowser(settings, settings.authFile);
  const summary = [];
  const snapshotId = path.basename(path.dirname(settings.outputDir)) === sanitizeName(settings.profile)
    ? path.basename(path.dirname(path.dirname(settings.outputDir)))
    : path.basename(path.dirname(settings.outputDir));
  const manifest = {
    snapshotId,
    profile: settings.profile || "default",
    createdAt: new Date().toISOString(),
    status: "running",
    outputDir: path.relative(repoRoot, settings.outputDir),
  };
  await saveJson(path.join(settings.outputDir, "manifest.json"), manifest);
  await updateStatus(settings, {
    mode: "export",
    status: "running",
    startedAt: manifest.createdAt,
    message: `Exporting ${ids.length} Program IDs`,
    snapshotId,
    totalPrograms: ids.length,
    completedPrograms: 0,
  });
  try {
    await followRecordedTrail(page, settings);
    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index];
      if (settings.resetEach) {
        await resetToOrganization(page, settings);
      }
      const url = `${settings.baseUrl.replace(/\/$/, "")}/${encodeURIComponent(id)}`;
      const targetDir = path.join(settings.outputDir, sanitizeName(id));
      await ensureDir(targetDir);
      console.log(`Visiting ${url}`);
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      await waitForBrandingReady(page, settings);
      await page.screenshot({
        path: path.join(targetDir, "page.png"),
        fullPage: true,
      });
      await saveText(path.join(targetDir, "page.html"), await page.content());
      const extracted = await extractBranding(page);
      const imageUrls = [
        ...extracted.images.map((img) => absolutizeUrl(img.src, page.url())),
        ...extracted.backgroundImages.map((img) => absolutizeUrl(img.url, page.url())),
      ];
      const downloadedImages = await downloadImageAssets(context, page.url(), imageUrls, targetDir);
      const payload = {
        programId: id,
        snapshotId,
        sourceProfile: settings.profile || "default",
        fetchedAt: new Date().toISOString(),
        pageUrl: page.url(),
        extracted: {
          ...extracted,
          images: extracted.images.map((img) => ({
            ...img,
            src: absolutizeUrl(img.src, page.url()),
          })),
        },
        downloadedImages: downloadedImages.map((filePath) => path.relative(repoRoot, filePath)),
      };
      payload.status =
        payload.extracted.backgroundImages.length > 0 ||
        payload.extracted.htmlBlocks.length > 0 ||
        payload.extracted.textSnapshot.length > 200
          ? "ok"
          : payload.extracted.textSnapshot.length > 0
            ? "empty_shell"
            : "error";
      await saveJson(path.join(targetDir, "branding.json"), payload);
      summary.push({
        programId: id,
        pageUrl: page.url(),
        status: payload.status,
        controlCount: extracted.controls.length,
        imageCount: extracted.images.length,
        backgroundImageCount: extracted.backgroundImages.length,
        htmlBlockCount: extracted.htmlBlocks.length,
        downloadedImageCount: downloadedImages.length,
        folder: path.relative(repoRoot, targetDir),
      });
      await updateStatus(settings, {
        mode: "export",
        status: "running",
        snapshotId,
        completedPrograms: index + 1,
        totalPrograms: ids.length,
        message: `Processed ${index + 1} of ${ids.length} Program IDs`,
      });
    }
  } finally {
    await browser.close().catch(() => {});
  }
  const summaryPath = path.join(settings.outputDir, "summary.json");
  await saveJson(summaryPath, summary);
  const okPrograms = summary.filter((row) => row.status === "ok").length;
  const emptyShellPrograms = summary.filter((row) => row.status === "empty_shell").length;
  const errorPrograms = summary.filter((row) => row.status === "error").length;
  await saveJson(path.join(settings.outputDir, "manifest.json"), {
    ...manifest,
    completedAt: new Date().toISOString(),
    status: "completed",
    totalPrograms: ids.length,
    okPrograms,
    emptyShellPrograms,
    errorPrograms,
  });
  await updateStatus(settings, {
    mode: "export",
    status: "completed",
    completedAt: new Date().toISOString(),
    snapshotId,
    totalPrograms: ids.length,
    completedPrograms: ids.length,
    okPrograms,
    emptyShellPrograms,
    errorPrograms,
    message: `Completed export for ${ids.length} Program IDs`,
  });
  console.log(`Saved summary to ${summaryPath}`);
}

async function main() {
  await loadEnvFile(defaultEnvFile);
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.command || opts.command === "--help" || opts.command === "-h") {
    usage();
    process.exit(0);
  }
  const settings = buildSettings(opts);
  if (opts.command === "guide" && opts.loginOnly) {
    await login(settings);
    return;
  }
  if (opts.command === "guide") {
    await guideLogin(settings);
    return;
  }
  if (opts.command === "login") {
    await login(settings);
    return;
  }
  if (opts.command === "record") {
    await recordTrail(settings);
    return;
  }
  if (opts.command === "export") {
    await exportBranding(settings, opts);
    return;
  }
  throw new Error(`Unknown command: ${opts.command}`);
}

main().catch(async (error) => {
  try {
    const opts = parseArgs(process.argv.slice(2));
    const settings = buildSettings(opts);
    await updateStatus(settings, {
      mode: opts.command || "unknown",
      status: "error",
      completedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
    });
  } catch {
    // ignore secondary status failures
  }
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
