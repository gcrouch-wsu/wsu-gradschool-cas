# Local CAS Branding Capture App

This is a local-only Flask control panel for capturing WebAdMIT/CAS branding and publishing it to Vercel Blob.

The deployed Next app cannot read files from your computer. This app solves that by:

1. Opening a local browser session where you log into WebAdMIT.
2. Recording the navigation path into the CAS Configuration Portal.
3. Capturing branding for each `Program ID` in the selected Excel export.
4. Uploading a normalized branding snapshot to Vercel Blob.
5. Updating `cas-branding-snapshots/latest/<profile>.json`, which the deployed app reads.

## One-Time Setup

From the repository root, either double-click `launch_branding_app.py` or run:

```powershell
python -m venv .venv
.\.venv\Scripts\pip install -r tools\branding_flask\requirements.txt
.\.venv\Scripts\python launch_branding_app.py
```

You can paste `BLOB_READ_WRITE_TOKEN` into the dashboard. It saves to `.env.local`, which is ignored by git. Keep `CAS_BLOB_ACCESS=private` unless your Blob store was created as public-only.

## Run

Double-click `launch_branding_app.py` or run `.\.venv\Scripts\python launch_branding_app.py`.

Open:

```text
http://127.0.0.1:5050
```

## Workflow

Use the profile switcher to choose either GradCAS or EngineeringCAS. Run one profile at a time.

1. Select the Excel report and save it in the local app.
2. Confirm the saved file path appears as the current Excel report.
3. Enter the WebAdMIT/CAS start URL for the environment you want to capture and save it.
4. Click `Open guided login`.
5. In the browser that opens, log into WebAdMIT.
6. Navigate to `CAS Configuration Portal`, then the correct CAS and live cycle.
7. Click `Details` for a program, then click `Branding`, and wait until the Branding page is visible.
8. Repeat that Details -> Branding path for 2 or 3 programs if possible.
9. Close the browser window while it is still on a Branding page. This saves your login, live-cycle route, and Program ID URL pattern.
10. Click `Capture and upload`.

Only use `Upload latest completed snapshot` if capture finished locally but the automatic Blob upload did not complete.

When capture finishes, the latest snapshot is available to the deployed app through Vercel Blob. The public app reads the newest completed profile snapshots and joins branding back to flattened application data by `Program ID`.

## Notes

- Run `gradcas` and `engineeringcas` separately because the login trail has to land in the correct CAS portal context.
- Run guided login again whenever you change the saved start URL, because each environment needs its own saved route.
- Branding image asset upload is optional; the primary output is normalized private JSON.
- Branding JSON is uploaded using `CAS_BLOB_ACCESS`, which defaults to private.
- Empty shell captures are retained and marked as `empty_shell`; they do not stop the run.
