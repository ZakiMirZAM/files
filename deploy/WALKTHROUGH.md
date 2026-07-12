# Go-Live Walkthrough — intrinsicfined.org

The tutorial layer for `DEPLOY.md`. Exact commands, what each does, where a
browser opens, and what to verify before moving on. Do the steps in this order.

Prereqs already true: domain `intrinsicfined.org` is on Cloudflare; the backend
is hardened; `files_local` is your rollback copy.

Dependency map (why this order):
- The frontend build needs the **prod Convex URL** → do Convex first.
- Cloudflare Pages serves the frontend at the root domain; the tunnel serves
  `api.`/`ai.` — both live in the same Cloudflare zone, set up after the build.
- `claude login` can be done anytime; it only affects the RAG service.

---

## Step 0 — Claude login on this PC (AI account side, ~2 min)

The RAG server authenticates through your Claude Code Max session, no API key.

```powershell
# Make sure no API key is set (it would override and break the Max path):
echo $env:ANTHROPIC_API_KEY      # must print nothing
claude login                     # opens a browser; approve
```
Verify: `claude whoami` (or just that `claude` runs). This is the only Claude
account action — I never touched the SDK code.

---

## Step 1 — Convex production deployment (~15 min, has the auth gotcha)

Your dev deployment is `dev:acrobatic-ibex-530`. Production is a **separate**
deployment with its own URL and its own environment variables. Sign-in uses
`@convex-dev/auth`, which needs JWT keys + `SITE_URL` on the prod deployment or
login will fail silently.

```powershell
cd C:\Users\Zaki_Mir\Downloads\files\frontend

# 1a. Log into Convex (browser opens if not already logged in)
npx convex login

# 1b. Push your functions + schema to a PRODUCTION deployment.
#     First run creates it and prints its URL like https://<name>.convex.cloud
npx convex deploy
```

**1c. Configure auth on the prod deployment (the gotcha).** The prod deployment
starts with no auth keys. Easiest reliable path is the Convex dashboard:

1. Open https://dashboard.convex.dev → your project → switch the environment
   selector (top) from Development to **Production**.
2. Settings → **Environment Variables**. You need these three:
   - `JWT_PRIVATE_KEY` and `JWKS` — generate them by running the Convex Auth
     setup against prod from the terminal:
     ```powershell
     npx @convex-dev/auth --prod
     ```
     This writes `JWT_PRIVATE_KEY` + `JWKS` onto the prod deployment (it may open
     a browser to confirm). If it also asks about an auth provider, keep the same
     one dev uses (anonymous/password).
   - `SITE_URL` — set manually to your public site origin:
     ```powershell
     npx convex env set SITE_URL https://intrinsicfined.org --prod
     ```
   `CONVEX_SITE_URL` (used by `auth.config.ts`) is set automatically by Convex to
   the deployment's own `.convex.site` URL — you don't set that one.

Verify:
```powershell
npx convex env list --prod      # must show JWT_PRIVATE_KEY, JWKS, SITE_URL
```

**1d. Note the prod deployment URL** (the `https://<name>.convex.cloud` from 1b;
also visible on the dashboard Production → Settings → "Deployment URL"). You'll
paste it into the build in Step 2.

---

## Step 2 — Build the frontend with the prod Convex URL (~3 min)

The three `VITE_*` vars are baked into the bundle at build time. A local build
must override `.env.local` (which holds the dev Convex URL); `build-prod.ps1`
does that by setting them as process env vars (highest precedence).

```powershell
cd C:\Users\Zaki_Mir\Downloads\files\frontend
./build-prod.ps1 -ConvexUrl "https://<your-prod-name>.convex.cloud"
```
It builds to `dist/` and fails loudly if `localhost` leaked in. You should see
"Build OK - dist/ ready to deploy". (`VITE_API_BASE`/`VITE_AI_BASE` default to
`https://api.intrinsicfined.org` / `https://ai.intrinsicfined.org`.)

---

## Step 3 — Deploy dist/ to Cloudflare Pages + attach the domain (~10 min)

Two ways; **Direct upload** is simplest for a first launch.

**Option A — Direct upload (Wrangler):**
```powershell
cd C:\Users\Zaki_Mir\Downloads\files\frontend
npx wrangler login                                   # browser opens; approve
npx wrangler pages project create intrinsicfined --production-branch main
npx wrangler pages deploy dist --project-name intrinsicfined
```

**Option B — Git-connected (auto-builds on push):** In the Cloudflare dashboard
→ Workers & Pages → Create → Pages → Connect to Git → pick the repo. Set build
command `npm run build`, output dir `frontend/dist`, root dir `frontend`. Under
the project's **Settings → Environment variables** add `VITE_API_BASE`,
`VITE_AI_BASE`, `VITE_CONVEX_URL` (prod). Then you can skip Step 2 — Pages builds
it. (`.env.local` isn't in git, so no dev-URL leak in CI.)

**Attach the domain:** Pages project → **Custom domains** → add
`intrinsicfined.org` and `www.intrinsicfined.org`. Because the zone is already on
Cloudflare, it wires the DNS (CNAME) for you and issues TLS automatically.

Verify: visit `https://intrinsicfined.org`. The app loads and sign-in works
(that proves Convex prod + auth env from Step 1). Analysis pages will show the
"live data unavailable" banner until the tunnel (Step 5) is up — that's expected.

---

## Step 4 — Install nginx, cloudflared, NSSM (~10 min)

```powershell
# cloudflared and nginx via winget (or download the binaries):
winget install --id Cloudflare.cloudflared
winget install --id nginx.nginx           # if not in winget, get nginx/Windows zip from nginx.org
# NSSM: download from https://nssm.cc/download, unzip, put nssm.exe on PATH
```
Confirm each is reachable:
```powershell
cloudflared --version ; nginx -v ; nssm version
```

Validate the proxy config (won't run anything, just checks syntax):
```powershell
nginx -t -c C:\Users\Zaki_Mir\Downloads\files\deploy\nginx.conf
```
Expect "syntax is ok" / "test is successful". (If nginx's default `mime.types`
path differs on your install, point the `include mime.types;` line at the full
path under your nginx `conf\` folder.)

---

## Step 5 — Create the Cloudflare Tunnel (~10 min)

```powershell
cloudflared tunnel login                             # browser opens; pick the intrinsicfined.org zone
cloudflared tunnel create intrinsicfined             # prints a Tunnel ID + writes <ID>.json creds
```
Edit `deploy/cloudflared-config.yml` → set `credentials-file` to the printed
`<ID>.json` path (usually `C:\Users\Zaki_Mir\.cloudflared\<ID>.json`).

Route the two API subdomains to the tunnel (creates the DNS records):
```powershell
cloudflared tunnel route dns intrinsicfined api.intrinsicfined.org
cloudflared tunnel route dns intrinsicfined ai.intrinsicfined.org
```

---

## Step 6 — Bring the stack up + verify (~10 min)

Set the machine-level env vars once (System → Environment Variables, or run
elevated and reboot so services inherit them):
```powershell
setx ENV production /M
setx ADMIN_TOKEN "<long-random-string>" /M
setx ALLOWED_ORIGINS "https://intrinsicfined.org,https://www.intrinsicfined.org" /M
setx FRED_API_KEY "<your-reissued-fred-key>" /M
```

Start everything manually first (5 terminals) to confirm before making services:
```powershell
ollama serve
# new terminal:
cd C:\Users\Zaki_Mir\Downloads\files ; .\start_backend_prod.bat
# new terminal:
cd C:\Users\Zaki_Mir\Downloads\files\rag ; python server.py
# new terminal:
nginx -c C:\Users\Zaki_Mir\Downloads\files\deploy\nginx.conf
# new terminal:
cloudflared tunnel --config C:\Users\Zaki_Mir\Downloads\files\deploy\cloudflared-config.yml run
```

Verify from anywhere:
```powershell
curl https://api.intrinsicfined.org/api/health           # {"ok":true,...}, no db_path
curl https://ai.intrinsicfined.org/health                # {"status":"ok","chunks":131255,...}
```
Then open `https://intrinsicfined.org`, sign in, load an individual stock (real
numbers, no mock banner), and try "Explain using AI" once.

Once verified, register the five processes as NSSM services so they survive
reboots (see `DEPLOY.md` §9) and disable sleep:
```powershell
powercfg /change standby-timeout-ac 0
powercfg /hibernate off
```

---

## Gotchas checklist
- **Sign-in fails in prod** → JWT_PRIVATE_KEY/JWKS/SITE_URL missing on the *prod*
  Convex deployment (Step 1c). Verify with `npx convex env list --prod`.
- **Whole site shows the mock-data banner** → the tunnel isn't up, or the build
  baked a wrong `VITE_API_BASE`. Check `curl https://api.intrinsicfined.org/api/health`.
- **CORS errors in the browser console** → the site origin isn't in the backend's
  `ALLOWED_ORIGINS` env (must be `https://intrinsicfined.org`), or nginx isn't
  fronting the RAG server.
- **RAG returns 5xx / empty** → `claude login` expired, Ollama not running, or an
  `ANTHROPIC_API_KEY` is set in the service environment (it must be empty).
- **429s during normal use** → expected under bursts; per-IP limits are
  intentional. Legit single-user traffic stays well under them.
