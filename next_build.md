# Next Build: CAS Branding & Capture Integration

This document reflects what is implemented today and remaining follow-up.

## Guiding Principle

Vercel decides what needs to be captured from the merged publication data and capture manifest. The local app runs browser automation because WebAdMIT requires an interactive login/session. Serverless routes are not a substitute for that.

## Proposed Workflow

1. In Vercel admin, upload or merge the latest CAS Excel exports.
2. Import or adjust the admin settings JSON if needed.
3. Save the publication (updates `/s/{slug}` only).
4. Click **Set as live home page** when this publication should drive `/` and `/view`.
5. Saving also writes capture manifests to `cas-branding-capture/{slug}.json` and `cas-branding-capture/current.json`.
6. Admin shows branding status for GradCAS and EngineeringCAS: `current`, `stale`, `missing`, or `not applicable`, with separate **any capture** vs **OK branding** counts.
7. Open the local Flask branding capture app at `http://127.0.0.1:5050`.
8. Load the latest publication from Vercel, confirm slug/title, run guided login and capture.
9. Refresh Vercel admin and the public page to confirm branding.

## Recently completed

- Stopped auto-promoting publications to live home on every save/merge; explicit **Set as live**.
- Admin compare banner when editing a non-live publication; bookmarks; friendlier settings filenames.
- Editable publication title; cycle/secondary header line; Cycle summary override.
- Default public header title: **GradCAS and EngineeringCAS Applications** (legacy titles remapped on read).
- Login open-redirect fix; stronger HTML/URL sanitization; login rate limit; timing-safe credential compare with role claim check.
- Merge updates existing Program IDs and recomputes shared/varying.
- Per-publication capture manifest path plus `current.json` pointer; server branding POST gated (`ALLOW_SERVER_BRANDING_CAPTURE=1`).
- Public APIs: Cache-Control; storage errors vs 404; hide capture metadata from students.
- Settings import warns on version/sourceSlug mismatch; Flask `delay_ms` hardened; explicit Blob token in `readBlobJson`.

## Remaining notes

- Settings-only saves can still mark branding **stale** (timestamp comparison); `statusDetail` explains this.
- Branding-diff unit tests still optional if a test runner is added.
- Optional: URL sync for public dept/program selection.
