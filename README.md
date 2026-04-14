# CAS program viewer

Next.js app for publishing **CAS Excel exports** (`.xlsx`) to a **read-only public page** with program search, a default program, and admin-controlled **summary columns**. Data is stored in **Vercel Blob only** (no database).

Remote repo: [github.com/gcrouch-wsu/CAS](https://github.com/gcrouch-wsu/CAS).

> Local folder name is `cas` (npm naming). Your GitHub repo can stay `CAS`.

## What you need from Vercel

| Variable | How you get it |
|----------|----------------|
| **`BLOB_READ_WRITE_TOKEN`** | Create a **Blob** store and **link it to this project**. Vercel injects this variable automatically (check **Project → Settings → Environment Variables**). |
| **`ADMIN_SECRET`** | You create it: a long random string. Add it manually under **Environment Variables** for Production (and Preview if you want). |

You do **not** need `DATABASE_URL` or Supabase for this app.

---

## Recommended order (first time on Vercel)

1. **Push this repo to GitHub** (if it is not already).
2. In **[vercel.com](https://vercel.com)** → **Add New… → Project** → **Import** the `CAS` repo.
3. **Before or after the first deploy**, open the **project** (not the team root):
   - Go to **Storage** (or **Create** → **Blob**).
   - **Create** a Blob store (any name, e.g. `cas-blob`) and **connect** it to **this** project.
4. Confirm **Settings → Environment Variables** includes **`BLOB_READ_WRITE_TOKEN`** for **Production**.
5. Add **`ADMIN_SECRET`** yourself (same Environment Variables screen). Save.
6. **Deployments → … on the latest deployment → Redeploy** so a build runs with both variables set.

**Answer to “Blob or project first?”**  
Either works, but the path that causes the least confusion is: **import the GitHub project first** → then **attach Blob to that project** so the token appears on the right app → then add **`ADMIN_SECRET`** → redeploy.

---

## Local development

```bash
npm install
```

1. Link and pull env from Vercel (easiest):

   ```bash
   npx vercel link
   npx vercel env pull .env.local
   ```

2. Or create `.env.local` by hand:

   ```env
   BLOB_READ_WRITE_TOKEN=...   # from Vercel project settings
   ADMIN_SECRET=...            # same value you use in production
   ```

3. Run:

   ```bash
   npm run dev
   ```

- Home: [http://localhost:3000](http://localhost:3000)
- Admin: [http://localhost:3000/admin](http://localhost:3000/admin)
- Public: `/s/<slug>` after an upload

---

## How it works

1. Admin uploads a CAS `.xlsx` with `Authorization: Bearer <ADMIN_SECRET>`.
2. The server parses sheets and writes **one private JSON object** per publication to Blob at  
   `cas-publications/<slug>.json`.
3. The public page and `GET /api/public/[slug]` read that object using **`BLOB_READ_WRITE_TOKEN`** on the server only.
4. Admin can **PATCH** column visibility and default program; the JSON file is overwritten.

`robots` on `/s/[slug]` is **noindex** by default.

---

## Security

- **`ADMIN_SECRET`** protects uploads and admin settings.
- **`BLOB_READ_WRITE_TOKEN`** must stay server-side (never commit to git). Public users never see it.
- Publication URLs are unlisted slugs; treat links as capability URLs.

## CAS parser

Uses the [`xlsx`](https://www.npmjs.com/package/xlsx) package. Only **trusted** CAS files should be uploaded (admin-only).

