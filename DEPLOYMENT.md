# IBRAHIM VIP ZONE — Production Deployment Guide (Render)

This project is a production-ready Next.js application backed by PostgreSQL.
Everything (customers, orders, payments, chat history, Multi Vault, uploaded
screenshots) is stored in the database — nothing depends on the sandbox
filesystem or any temporary URL.

---

## 1. Export / Push the Code to a GitHub repository

```bash
# From the project root (remove any existing git if present)
rm -rf .git
git init
git add .
git commit -m "IBRAHIM VIP ZONE production build"

# Create a new *private* repo on GitHub linked to your Render account, then:
git remote add origin https://github.com/<YOUR_USERNAME>/ibrahimvipzone.git
git branch -M main
git push -u origin main
```

> The `.gitignore` file already excludes `.env`, `.env.local`, `.next`,
> `node_modules` — so **no secrets are committed**.

---

## 2. Environment Variables (set in Render dashboard, NOT in code)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Render "Internal Database URL" from the Postgres service (auto-injected) |
| `ADMIN_EMAIL` | ✅ | Admin login email |
| `ADMIN_PASSWORD` | ✅ | Admin login password (used only on first seed) |
| `ADMIN_NAME` | ✅ | Admin display name |
| `ADMIN_PHONE` | — | Admin phone |
| `COOKIE_SECURE` | ✅ | Set to `true` (Render serves HTTPS) |
| `OPENAI_API_KEY` | — | Optional; if empty, the built-in rule AI answers everything |
| `OPENAI_MODEL` | — | e.g. `gpt-4o-mini` |
| `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` | — | Optional OpenAI-compatible override |

Render's Blueprint (`render.yaml`) already declares these — you only need to
fill in the secret values (marked `sync: false`) in the dashboard.

---

## 3. Render Deployment Configuration

### Option A — Blueprint (recommended, one-click)
1. In Render: **New → Blueprint** → connect the GitHub repo.
2. Render detects `render.yaml` and creates **two services**:
   - `ibrahimvipzone` (web service)
   - `ibrahimvipzone-db` (persistent Postgres)
3. Fill in the secret env vars, then **Apply**.

### Exact settings (if creating the web service manually)
| Field | Value |
|---|---|
| Runtime | Node |
| Build Command | `npm install && npm run build` |
| Start Command | `npm run db:push && npm start` |
| Health Check Path | `/api/health` |
| Region | Singapore (closest to Bangladesh) |
| Node Version | 20 |

### Database configuration
- Add a **PostgreSQL** service (or use the one from the Blueprint).
- `DATABASE_URL` is injected automatically as the **internal** URL.
- Tables are created automatically on first start via `drizzle-kit push`
  (idempotent) and seeded on first request.

### Persistent storage configuration
- Uploaded images/screenshots are stored as base64 in the **Postgres `files`
  table** — persistent with the database, no disk needed.
- A 1 GB **persistent disk** is also declared in `render.yaml` for future use.

---

## 4. Post-Deploy Verification Checklist

- [ ] `/api/health` returns `{"ok":true}`
- [ ] Customer signup + login → lands on **Homepage** (not chat)
- [ ] Tapping **Chat** opens chat; AI answers `"বিকাশ নাম্বার দেন"` etc.
- [ ] Order → payment screenshot upload → TrxID → Sender Number → PENDING
- [ ] Admin login → see payment → APPROVE → customer gets approval message
- [ ] Source Commission → APPROVE → protected Multi delivered
- [ ] HTTPS is active (padlock in browser)

---

## 5. What is NOT provided by this file / Render

- A final bound custom domain (e.g. `ibrahimvipzone.pages.dev`) requires that
  you connect the platform and set the env vars yourself. Render provides an
  `onrender.com` URL automatically; you can add a custom domain in Render's
  **Settings → Custom Domains**.

> No fake URLs are given. The code here is build-verified and deployment-ready;
> the public URL materializes only after you connect the repo on Render (or
> Cloudflare Pages / Vercel / Netlify).
