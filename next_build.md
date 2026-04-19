# Next Build: CAS Branding & Capture Integration

This document reflects what is implemented today, the intended coordinator workflow, review findings, recommended follow-up work, and **planned admin UX** (navigation, live metadata, bookmark files).

## Guiding Principle

Vercel decides what needs to be captured from the merged publication data and capture manifest. The local app runs browser automation because WebAdMIT requires an interactive login/session. Serverless routes are not a substitute for that.

## Proposed Workflow

1. In Vercel admin, upload or merge the latest CAS Excel exports.
2. Import or adjust the admin settings JSON if needed.
3. Save the publication.
4. Saving writes the public publication blob and the capture manifest to Vercel Blob at `cas-branding-capture/current.json`.
5. Admin shows branding status for GradCAS and EngineeringCAS: `current`, `stale`, `missing`, or `not applicable`.
6. Open the local Flask branding capture app at `http://127.0.0.1:5050`.
7. In the local app, click `Load latest publication from Vercel`.
8. Confirm the manifest shows the expected publication title/slug and Program ID counts per profile.
9. Select the profile that is stale or missing.
10. Run guided login if needed.
11. In Edge, log in, navigate to CAS Configuration Portal, choose the correct CAS/cycle, open branding for a few programs, then close Edge.
12. Back in the local app, click `Capture and upload`.
13. The local app uses manifest Program IDs when the manifest is loaded and lists IDs for that profile; otherwise it falls back to the selected Excel report.
14. Capture runs visibly in Edge, saves a local snapshot, then uploads it to Vercel Blob.
15. Refresh Vercel admin to confirm the profile status.
16. Refresh the public page to confirm student-facing branding appears.

## Implemented

| Area | Status |
|------|--------|
| Per-offering branding in publication data | Implemented in `src/lib/types.ts` |
| Merge branding from Blob/local snapshots by Program ID | Implemented in `src/lib/branding-store.ts` |
| Public page shows branding with merged data | Implemented via `getPublicationBySlug` |
| Named profiles `gradcas`, `engineeringcas` | Implemented |
| Shared GradCAS/EngineeringCAS inference | Implemented in `src/lib/cas-profile.ts` (`inferCasProfile`) |
| Local Node CLI + Flask app for guided login/capture/upload | Implemented in `tools/branding/` and `tools/branding_flask/app.py` |
| Capture manifest written on create/update/merge | Implemented in `src/lib/cas-store.ts` |
| Flask loads manifest from Blob | Implemented via `tools/branding/read-capture-manifest.mjs` |
| Admin branding coverage, manifest pointer, local app link | Implemented in `src/app/(site)/admin/[slug]/page.tsx` and `src/app/api/admin/publications/[slug]/branding/route.ts` |
| Admin status: `missing` vs `stale` (timestamp) with `statusDetail` | Implemented in branding route; client types include `hasMissingIds`, `dataNewerThanSnapshot` |
| Public viewer: Department → Program → Search | Implemented in `src/app/s/[slug]/PublicCasView.tsx` |
| Branding diff UI: two-column layout when two windows; block-level left accent for differing HTML | Implemented in `PublicCasView.tsx` |

## Current Architecture

### Blob layout

- **Publications:** `cas-publications/{slug}.json`
- **Which publication the home page shows:** `cas-publications/_current-view.json` (pointer). Resolved by `getCurrentViewSlug()` / `getCurrentViewPublication()` in `src/lib/cas-store.ts`.
- **Home and `/view`:** Both use `getCurrentViewPublication()` (`src/app/page.tsx`, `src/app/view/page.tsx`).
- **Per-slug public URLs:** `/s/[slug]` uses `getPublicationBySlug(slug)`.
- **Capture manifest:** `cas-branding-capture/current.json` — overwritten on publication create, update, or merge; last writer wins across publications (see Review Findings).
- **Branding snapshots:** `cas-branding-snapshots/` — latest pointers and uploaded snapshot data; merged on read via `branding-store.ts`.

### Settings export

- **Route:** `GET /api/admin/publications/[slug]/settings-export` (`src/app/api/admin/publications/[slug]/settings-export/route.ts`).
- **Download filename today:** `cas-publication-settings-{slug}.json` (slug is opaque, e.g. `l69576ya2z1k`, so filenames are hard to recognize in Explorer).

### Admin vs “pull from public” (without reloading workbooks)

- **Today:** Admin edits **whatever publication is already stored in Blob** for that slug. Merged CAS data and settings live in `cas-publications/{slug}.json`. You do **not** need to re-upload Excel on every visit if nothing changed—only when you need to refresh export data.
- **Not implemented yet:** A one-click **“open admin for the publication currently on the home page”** or **“import settings JSON from live Blob”** without downloading a file first. Coordinators still use **settings export/import** (JSON files) to copy display settings between environments. See **Planned: Admin Navigation** below.

### Local Flask

Loads `.env.local` / `.env.branding` (`BLOB_READ_WRITE_TOKEN`, optional `CAS_BLOB_ACCESS`, `BRANDING_LOGIN_URL`). Capture prefers manifest Program IDs when loaded; otherwise uses the selected Excel report.

## Planned: Admin Navigation, Live Publication Metadata, and Bookmark Files

These items are **not implemented yet**; they address coordinators losing the admin context after visiting the public site and hard-to-read export filenames.

### Problems to solve

1. **No obvious return to admin** after opening the public home page or `/s/[slug]` — bookmarks and opaque slugs make it easy to lose `/admin/{slug}`.
2. **“Pull metadata from the latest site”** should mean reading the **same Blob source** the home page uses (`_current-view.json` → publication), **not** scraping HTML from the deployed homepage.
3. **Settings downloads** use filenames that only include the slug; adding a **human-readable segment** (sanitized title) would help without replacing the slug as the stable key.

### Recommended implementation (priority order)

1. **“Edit the publication currently shown on the home page”** (after login at `/admin`)  
   - Server: use `getCurrentViewSlug()` (already in `cas-store.ts`).  
   - Client: navigate to `/admin/{slug}` for that slug.  
   - Copy should say **current public view**, not “newest upload,” since those can differ.

2. **Optional read-only panel on `/admin/[slug]`**  
   - If the opened publication slug ≠ current-view slug, show a short comparison (title, `updated_at`) so editors notice they are not editing what the home page shows.

3. **Admin bookmark file (download / upload)** — *not* an auth session  
   - **Do not** store cookies, tokens, or passwords. Treat like a portable bookmark.  
   - **Suggested JSON fields:** `version`, `origin` (e.g. `https://wsu-gradschool-cas.vercel.app`), `slug`, `title`, `adminUrl` or `adminPath`, `exportedAt`, optional `notes`.  
   - **Upload:** parse JSON, validate `origin` matches the current deploy (or confirm before navigating), then `router.push` to `/admin/{slug}`.  
   - **Use cases:** handoff between coordinators, switching browsers, recording which deploy + publication pair to open.  
   - **Overlap:** complements “go to live publication”; does not replace **settings export/import** (which moves full configuration).

4. **Friendlier settings export filename**  
   - Keep slug in the name for uniqueness and imports: e.g. `cas-publication-settings-{slug}-{sanitized-short-title}.json`.  
   - Sanitize for `Content-Disposition` (length limit, filesystem-safe characters).  
   - Import logic should continue to rely on **slug inside the JSON**, not the filename alone.

### What to avoid

- Scraping the live site HTML for “metadata.”
- Naming the bookmark feature **“session”** in UI if it confuses users into expecting logged-in state to transfer (it does not).
- Blind “sync everything from live” without confirmation when merging into another publication.

## Review Findings

### High: Global Manifest Path

The manifest is always `cas-branding-capture/current.json`. Last save wins across all publications. If multiple publications become active, the safer future design is a per-publication manifest path or a Flask-side slug verification step before capture.

**Mitigation today:** save the publication you are about to capture immediately before loading the manifest in the local app.

### Medium: Stale After Settings-Only Saves

Admin status separates missing Program IDs from timestamp-only stale status.

- **`missing`:** expected Program IDs do not all have capture records (or none captured when IDs exist).
- **`stale`:** all expected Program IDs have captures, but the latest completed branding snapshot predates the latest publication save.

A harmless settings-only save can still show `stale`; `statusDetail` explains that all IDs are present and the snapshot predates the save.

### Medium: Captured Count vs Offerings With Branding

Per-profile captured counts use any stored branding record, including error or empty-shell records. The summary branded-offerings count only includes `branding.status === "ok"`.

**Improvement:** rename or split the metric later into “IDs with any capture” and “IDs with OK branding.”

### Medium: Server-Side Branding Actions Still Exist

The admin page points users to the local app, but `POST /api/admin/publications/[slug]/branding` (`guide` / `export`) still exists, and hidden buttons still call `runBrandingAction`.

**Improvement:** remove or dev-gate once the Flask-only workflow is fully proven.

### Low: Blob Access Mode Alignment

The app and local manifest reader both use the same `CAS_BLOB_ACCESS` rule: private unless `CAS_BLOB_ACCESS=public`. Local `.env` should match production.

### Low: Blob Token Assumption

`readBlobJson` in `branding-store.ts` relies on `@vercel/blob` reading `BLOB_READ_WRITE_TOKEN` from the environment. Verify SDK behavior or add explicit token passing if needed.

### Low: Flask Delay Input

`delay_ms` parsing can throw on invalid form input; low risk with the stock form.

## Recommended Next Steps

### Admin UX (this document’s planned section)

1. Implement **“Edit publication shown on home page”** using `getCurrentViewSlug()`.
2. Optional **compare** when `slug !== current view slug`.
3. Implement **admin bookmark** JSON download/upload (no secrets).
4. **Sanitized title** in settings export filename; keep slug embedded.

### Branding / Blob

5. Per-publication manifest paths or Flask slug verification if multiple active publications become real.
6. Align per-profile metrics with OK branding vs any capture, or rename labels.
7. Remove or dev-gate hidden server-side capture controls after the Flask workflow is proven.
8. Confirm `@vercel/blob` token behavior in `readBlobJson` and add explicit token passing if needed.

## Acceptance Criteria

1. Upload/merge plus save on Vercel produces a manifest listing the Program IDs the public site expects per profile.
2. Local Flask can load that manifest and capture those IDs, or fall back to Excel when manifest IDs are absent.
3. Upload updates Blob so the deployed app shows merged branding on refresh.
4. Admin status is actionable and distinguishes missing IDs from stale snapshot timestamps.
5. HTML branding remains visible to students and coordinators as sanitized HTML, not plain text only.

**Future (admin UX plan):** Coordinators can return to admin for the **current live** publication without hunting opaque URLs; optional bookmark file supports handoff without storing credentials.
