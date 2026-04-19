# Next Build: Branding Integration Plan

## Goal

Extend this app so an academic coordinator can see the **student-facing branding HTML as it appears to the applicant**, alongside the existing CAS flattened export data already shown in the app.

This needs to work for at least:

- GradCAS
- EngineeringCAS

The app already supports uploading and merging workbook exports from multiple CAS instances. The branding workflow should follow the same merged model.

## Core Requirement

The coordinator must be able to see the **branding content itself**, not just extracted text fields.

That means the app should preserve and render:

- the branding header image/background image
- deadline/header text
- instructions / rich HTML body
- student-facing links embedded in the HTML

The coordinator view should be as close as practical to the branding page a student sees, while still fitting inside this app.

## Current State

### What the app already does well

The app already ingests workbook exports and renders, per grouped program:

- summary data
- application windows
- recommendations
- questions
- answers
- documents

The grouping model already preserves `Program ID` at the offering level, which is the key needed to join branding data.

### What is missing

The current internal model does **not** include per-program/per-offering branding.

Branding currently exists outside the app:

- in the Liaison Configuration Portal
- partially collectible through the Playwright scraper

### What we learned from the scraper

- `Program ID` is the correct join key between workbook/export data and branding pages.
- GradCAS and EngineeringCAS likely require **separate collection contexts**.
- The recorded click trail did not capture enough portal context; simple top-level URL recording is not sufficient.
- The scraper can capture useful branding HTML when the page is fully loaded.

## Target Architecture

### 1. Branding should be versioned as snapshots

Add timestamped branding snapshot folders, for example:

```text
branding-snapshots/
  2026-04-19T10-15-00Z/
    manifest.json
    profiles/
      gradcas/
        programs/
          547733.json
      engineeringcas/
        programs/
          600001.json
  latest.json
```

`latest.json` should point to the most recent successful snapshot the app should use by default.

### 2. Separate named collection profiles

Add named branding collection profiles, at minimum:

- `gradcas`
- `engineeringcas`

Each profile should maintain its own:

- auth state
- recorded context/navigation state
- run history

Examples:

```text
tools/branding/.auth/gradcas-user.json
tools/branding/.auth/gradcas-context.json
tools/branding/.auth/engineeringcas-user.json
tools/branding/.auth/engineeringcas-context.json
```

This is necessary because the collector likely has to enter different CAS/cycle contexts before branding pages work correctly.

### 3. Branding should join on Program ID

Branding must attach to the app’s **offering/program ID level**, not only to the broader grouped program.

Reason:

- one displayed program group can contain multiple `Program ID`s
- term/cycle offerings can differ
- branding may differ per `Program ID`

So branding should be modeled per offering first, then optionally collapsed in the UI if multiple offerings share identical branding.

## Data Model Changes Needed

### Add branding to offerings

Likely new type shape:

```ts
type ProgramBranding = {
  programId: string;
  sourceProfile: "gradcas" | "engineeringcas" | string;
  capturedAt: string;
  status: "ok" | "empty_shell" | "error";
  studentFacingTitle: string;
  deadlineText: string;
  headerImageUrl: string | null;
  instructionsHtml: string;
  instructionsText: string;
  links: { text: string; href: string }[];
};
```

Then extend `CasOffering` or related publication data to include:

```ts
branding?: ProgramBranding | null
```

This is better than storing branding only on `CasProgramGroup`.

### Add branding snapshot metadata

The publication should also know which branding snapshot it is using, for example:

- snapshot id
- snapshot timestamp
- number of offerings with branding
- number of failed / missing offerings

## Collector Changes Needed

### 1. Make context capture profile-aware

The collector needs to support:

```text
branding:login --profile gradcas
branding:login --profile engineeringcas
branding:collect --profile gradcas
branding:collect --profile engineeringcas
```

Each profile needs isolated saved state.

### 2. Record richer portal context

The current recorder only captured the WebAdMIT login URL. That is not enough.

We need to capture:

- meaningful clicks
- hash-route changes
- possibly selected CAS/cycle labels
- enough state to re-enter the correct portal context before visiting branding pages

Simple top-level navigation recording is insufficient for this portal.

### 3. Continue on empty shell, do not stop the batch

The collector should:

1. detect empty shell pages
2. save HTML/screenshot anyway
3. mark the program as `empty_shell`
4. retry once after re-establishing context
5. continue to the next program

This should produce a complete manifest of:

- successes
- empty shells
- hard failures

### 4. Normalize scraper output into app-ready JSON

Do not make the app consume raw ad hoc scraper output directly.

Instead, normalize each collected page into a stable JSON schema per `Program ID`.

## App Changes Needed

### 1. Add a branding preview section in the coordinator view

For each selected program/offering, show a new section such as:

- `Student-facing branding preview`

It should render:

- the branding image/header
- deadline text
- instructions HTML

This preview should sit alongside the existing flattened export content.

### 2. Render the branding HTML as HTML

This is critical.

The coordinator must see the HTML branding **as shown to the student**, not as plain text only.

That means:

- preserve the original HTML body from the collector
- sanitize it server-side before rendering
- render it with `dangerouslySetInnerHTML` only after sanitization

A sanitizer is required because this HTML is external content.

Likely need:

- `sanitize-html` or similar

The rendered preview should preserve:

- paragraphs
- bold/italic
- lists
- links
- line breaks

### 3. Show per-offering differences clearly

If multiple `Program ID`s in the same program group have different branding:

- show them as separate branding previews aligned with each application window / offering

If multiple offerings share identical branding:

- optionally collapse them into one shared preview block

This should mirror the app’s current behavior for term-specific questions/documents.

### 4. Add branding status to admin

Add a branding section to the admin page that shows:

- current snapshot in use
- branding coverage counts
- missing branding count
- failed/empty-shell count
- last sync time

Eventually add actions like:

- `Connect GradCAS branding`
- `Connect EngineeringCAS branding`
- `Sync branding`
- `Retry failed`
- `Use latest snapshot`

## Suggested Storage/Runtime Approach

### Short term

Keep the collector as a local Node/Playwright process and write branding snapshots to local disk.

Then have the app read the latest snapshot locally.

This is the fastest path to working software.

### Longer term

Move snapshot storage to a shared store the app can read in production, for example:

- Blob storage
- checked-in JSON only if very small and intentionally versioned
- another secure storage layer

Playwright/browser automation itself is probably better as:

- a local admin-run task
- or a separate Node worker

not as a standard Vercel/serverless route.

## Recommended Implementation Order

1. Add branding types to the app model, keyed by `Program ID`.
2. Add a normalized snapshot format and `latest.json` pointer.
3. Make the collector support named profiles: `gradcas`, `engineeringcas`.
4. Improve context recording so profile capture actually follows the needed portal path.
5. Add empty-shell retry-and-continue behavior.
6. Add an importer/loader that merges branding snapshots into publication data by `Program ID`.
7. Add coordinator-facing branding preview UI.
8. Sanitize and render branding HTML faithfully.
9. Add admin branding status and sync controls.

## Acceptance Criteria

This build is successful when:

1. A coordinator uploads/merges GradCAS and EngineeringCAS workbook exports as they do now.
2. Branding is collected separately for GradCAS and EngineeringCAS.
3. The app merges branding by `Program ID`.
4. The coordinator can open a program in the app and see:
   - the current flattened export data
   - the student-facing branding preview
5. The preview preserves the original HTML structure in a safe sanitized form.
6. Missing branding does not break the app; it is shown as missing with status.
7. The app can use the latest successful branding snapshot automatically.

## Most Important Constraint

Do not reduce the branding to plain text only.

The core requirement is that the coordinator sees the **HTML branding as it is shown to the student**. That should drive both the snapshot schema and the eventual UI design.
