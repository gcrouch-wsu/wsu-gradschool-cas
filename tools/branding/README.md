# Branding scraper

Local Playwright utility for collecting branding data from Liaison's Configuration Portal after a one-time interactive login.

## What it does

- opens the branding portal in a real browser
- lets you log in manually once
- saves browser auth state locally
- revisits branding URLs without asking you to log in each run
- can read program IDs directly from your CAS Excel exports
- exports, per program ID:
  - a screenshot
  - raw HTML
  - a JSON extraction of visible form values and image URLs
  - any branding images it can download with your current session

## Setup

1. Copy `.env.branding.example` to `.env.branding` if you want overrides.
2. Run the guided login step:

```powershell
npm run branding:login
```

When the browser opens:

1. log in fully
2. finish MFA if required
3. click through the portal exactly as you normally do
4. open two or three branding pages that work correctly
5. return to the terminal and press Enter once

The script saves:

- auth state to `tools/branding/.auth/user.json`
- navigation trail to `tools/branding/.auth/trail.json`

Default login page:

```text
https://prelaunch.webadmit.org/
```

## Record your manual portal path separately

If the portal only works after you click through organization/cycle pages, record that path once:

```powershell
npm run branding:record
```

When the browser opens:

1. log in if needed
2. click through the portal exactly as you normally do
3. open two or three branding pages that work correctly
4. return to the terminal and press Enter

This saves:

- refreshed auth state in `tools/branding/.auth/user.json`
- a navigation trail in `tools/branding/.auth/trail.json`

Later export runs will replay the recent non-branding URLs from that trail before opening each branding page.

You usually do not need this if you already used `npm run branding:login`, because that command now performs the guided login + trail capture together.

## Export branding

One program:

```powershell
npm run branding:export -- --id 547960
```

Several programs:

```powershell
npm run branding:export -- --ids 547960,547961,547962
```

Program IDs from a file:

```powershell
npm run branding:export -- --id-file tools/branding/program-ids.txt
```

Program IDs directly from the existing workbook exports:

```powershell
npm run branding:export -- --xlsx GradCAS.xlsx --xlsx EngCAS.xlsx
```

Slower run with an extra pause after each page loads:

```powershell
npm run branding:export -- --xlsx GradCAS.xlsx --xlsx EngCAS.xlsx --delay-ms 4000
```

By default, the scraper reads the `Program Attributes` sheet and extracts the `Program ID` column that matches branding URLs such as:

```text
https://configuration.prelaunch.cas.myliaison.com/configuration/assets/index.html#!/programBranding/547960
```

Each run writes output under `tools/branding/output/<programId>/`.

## Notes

- The script uses your local Edge install by default via Playwright channel `msedge`.
- If the saved session expires, run `npm run branding:login` again.
- If the portal needs extra organization/cycle clicks to establish context, run `npm run branding:record` and click through those pages once. Export runs will replay that trail.
- By default, each program run clicks `Back to Organization` first when that link is available, then opens the next branding page. Use `--no-reset` if that turns out to be worse for your tenant.
- The extraction is intentionally generic because the portal is login-protected and the field markup may vary. Inspect `branding.json` plus `page.html` to refine selectors later.
- Saved auth and scraped output are gitignored.
