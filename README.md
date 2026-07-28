# CAS program viewer

Next.js app for publishing **CAS Excel exports** (`.xlsx`) to a **read-only public page** with program search, a default program, and admin-controlled **summary columns**. Data is stored in **Vercel Blob only** (no database).

Remote repo: [github.com/gcrouch-wsu/wsu-gradschool-cas](https://github.com/gcrouch-wsu/wsu-gradschool-cas).

> Local folder, npm package, and GitHub repo all use `wsu-gradschool-cas`.

## Environment variables (Vercel)

| Variable | Purpose |
|----------|---------|
| **`BLOB_READ_WRITE_TOKEN`** | Added automatically when you **link a Blob store** to the project (**Storage** in the Vercel dashboard). |
| **`ADMIN_USERNAME`** | Admin login name (you choose). |
| **`ADMIN_PASSWORD`** | Admin login password (choose a strong one). |
| **`AUTH_SECRET`** | At least **16 characters**, random. Used only to **sign the session cookie** (not the same as the password). |
| **`CAS_BLOB_ACCESS`** (optional) | `private` (default) or `public`. Must match how blobs are stored — see **Blob public vs private** below. |

You do **not** need `DATABASE_URL` or Supabase.

### First deploy on Vercel (simple order)

1. **Import** the GitHub repo as a new Vercel project.
2. **Storage → Blob** → create a store and **connect it to this project** (confirms `BLOB_READ_WRITE_TOKEN`).
3. **Settings → Environment Variables** → add **`ADMIN_USERNAME`**, **`ADMIN_PASSWORD`**, and **`AUTH_SECRET`** manually for **Production** (and Preview if you use it).
4. **Redeploy** the latest deployment.

Admin UI: **`/admin/login`** → after sign-in, **`/admin`** to upload.

---

## Blob public vs private

Each uploaded file uses an **access mode** in code (`private` by default). That must match what Vercel expects when reading.

- **Recommended:** keep **`CAS_BLOB_ACCESS` unset** (defaults to **`private`**) and use a normal Blob store. New uploads use private blobs; only your server (with the token) reads them.
- If you switched the store to **public** or older objects were uploaded as **public**, **`get` with `private`** can fail. Then either:
  - Set **`CAS_BLOB_ACCESS=public`** in Vercel so reads/writes match your store, **or**
  - Leave the app on **`private`**, create a **new** Blob store (or re-link) so defaults are private, **re-upload** publications.

There is often **no single dashboard toggle** that flips existing blobs to private; matching **`CAS_BLOB_ACCESS`** to reality or re-uploading fixes errors.

---

## Local development

```bash
npm install
npx vercel link
npx vercel env pull .env.local
```

Or copy **`.env.example`** to `.env.local` and fill in values. Then:

```bash
npm run dev
```

- Sign in: [http://localhost:3000/admin/login](http://localhost:3000/admin/login)
- Upload: [http://localhost:3000/admin](http://localhost:3000/admin)
- Public view: `/s/<slug>`

---

## How it works

1. Admin signs in at **`/admin/login`**; the server sets an **HTTP-only cookie** (signed with **`AUTH_SECRET`**).
2. Admin uploads a CAS `.xlsx` on **`/admin`**; the server writes **`cas-publications/<slug>.json`** to Blob.
3. **`/s/[slug]`** and **`GET /api/public/[slug]`** read that JSON with **`BLOB_READ_WRITE_TOKEN`** on the server only.

On **`/admin/[slug]`**, summary columns, default program, and whether to show **organization** questions/answers are edited as **drafts** until you click **Save changes** (then the public page updates). **Open public page** opens in a **new tab**.

`robots` on `/s/[slug]` is **noindex** by default.

---

## Updating one CAS workbook on an existing live cycle

Use the existing publication admin page, not a new publication, when only one CAS source changed.

1. Sign in at **`/admin/login`**.
2. Open **`/admin/<slug>`** for the live cycle, for example **`/admin/r7msqnw6dwfm`**.
3. In **Workbook data**, choose the refreshed **GradCAS** or **EngineeringCAS** `.xlsx`.
4. Click **Update publication workbook**.

The upload replaces the matching CAS source inside that publication and preserves the other source, the live slug, public display settings, and existing branding captures. Branding is matched by **CAS Program ID**; rerun branding capture only when the refreshed workbook introduces Program IDs that do not already have captures or when branding content changed in CAS.

To edit what appears publicly, use the checkbox sections on the same admin page and click **Save changes**. For example, uncheck **Answer Display** or **Answer Value** under **Answers table (public columns)** to hide those fields on `/s/<slug>` without reuploading workbooks or branding.

---

## Security

- **`ADMIN_PASSWORD`** and **`AUTH_SECRET`** are sensitive; keep them in Vercel env only.
- **`BLOB_READ_WRITE_TOKEN`** must never be exposed to browsers.
- Treat public program URLs as **unlisted links**.

## CAS parser

Uses [`xlsx`](https://www.npmjs.com/package/xlsx). Only **trusted** CAS files should be uploaded.
