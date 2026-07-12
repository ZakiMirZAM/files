# IntrinsicFinEd — Publishing Runbook (free, self-hosted, public)

Domain: **intrinsicfined.org** (Cloudflare Registrar). Everything below is free
except the domain.

## Topology

```
                          Cloudflare (free plan: TLS, WAF, Bot Fight, rate-limit rule)
                          │
   intrinsicfined.org ────┼──► Cloudflare Pages  (static Vite build of frontend/dist)
   www.intrinsicfined.org │
                          │
   api.intrinsicfined.org ┼──► cloudflared tunnel ──► nginx :8080 ──► FastAPI 127.0.0.1:8000
   ai.intrinsicfined.org  ┘                                        └─► RAG    127.0.0.1:3001

   Convex Cloud (free) ── auth + user data (qualitative answers, reports, notes, simulator)
```

Five always-on processes on this PC: **uvicorn** (backend), **rag/server.py**,
**ollama serve**, **nginx**, **cloudflared**. Register them as Windows services
with NSSM (below); disable sleep/hibernate.

---

## One-time setup

### 1. Rotate the leaked keys (do first)
- Moonshot/Kimi key in `data/notegenerator.py` — revoke + reissue at platform.moonshot.ai.
- FRED key — reissue at fred.stlouisfed.org (free). Both are excluded from the
  deploy artifact via `.dockerignore`, but they remain in git history, so rotation
  is the real fix. If the repo will ever be public, scrub history with `git filter-repo`.

### 2. Environment variables (machine-level: System → Environment Variables)
```
ENV=production
ADMIN_TOKEN=<long random string>          # guards /api/cache/clear + /api/daily-update
ALLOWED_ORIGINS=https://intrinsicfined.org,https://www.intrinsicfined.org
FRED_API_KEY=<your reissued FRED key>
```

### 3. Convex production deployment
```
cd frontend
npx convex deploy            # creates a PROD deployment; note its https URL
```
Use that URL as `VITE_CONVEX_URL` in the frontend build (step 5) and set the
same auth env (`CONVEX_SITE_URL`) the dev deployment used.

### 4. Backend + RAG prerequisites on this PC
```
pip install -r backend/requirements.txt      # now includes slowapi
pip install -r rag/requirements.txt
ollama serve                                  # + one-time: ollama pull nomic-embed-text
claude login                                  # RAG uses the Max session; NO ANTHROPIC_API_KEY
```
Data files stay in place: financials.db (root), backend/market_data.db,
rag/vault.db. Nothing ships to the cloud.

### 5. Frontend production build → Cloudflare Pages
Option A (recommended) — connect the GitHub repo in the Pages dashboard, set
build command `npm run build`, output dir `frontend/dist`, and add env vars
`VITE_API_BASE`, `VITE_AI_BASE`, `VITE_CONVEX_URL` in the Pages project settings.
Add `intrinsicfined.org` + `www` as custom domains.

Option B — build locally and upload:
```
cd frontend
./build-prod.ps1 -ConvexUrl "https://<prod>.convex.cloud"   # sets vars inline, guards against localhost leak
npx wrangler pages deploy dist --project-name intrinsicfined
```

### 6. nginx (Windows)
Install nginx for Windows, then:
```
nginx -t -c C:\Users\Zaki_Mir\Downloads\files\deploy\nginx.conf   # validate
nginx   -c C:\Users\Zaki_Mir\Downloads\files\deploy\nginx.conf    # run
```
It listens on 127.0.0.1:8080 and routes by Host to the backend/RAG. All RAG
protection (origin pinning, per-IP rate limits, 64k body cap, wildcard-CORS
strip, path allowlist) lives here — rag/server.py is never modified.

### 7. Cloudflare Tunnel
```
cloudflared tunnel login
cloudflared tunnel create intrinsicfined
# put the generated <ID>.json path into deploy/cloudflared-config.yml
cloudflared tunnel route dns intrinsicfined api.intrinsicfined.org
cloudflared tunnel route dns intrinsicfined ai.intrinsicfined.org
cloudflared tunnel --config deploy/cloudflared-config.yml run
```

### 8. Cloudflare dashboard hardening (free plan)
- SSL/TLS mode: Full (strict).
- Bot Fight Mode: on.
- One rate-limiting rule on `ai.intrinsicfined.org/*` as a second layer over nginx.
- WAF managed ruleset: on.

### 9. Windows services (NSSM) — always-on
Run each under `nssm install <name>`; set AppDirectory to the repo root and
restart-on-exit. Suggested order/names:
```
nssm install ifed-ollama     "ollama" "serve"
nssm install ifed-backend    "cmd" "/c C:\Users\Zaki_Mir\Downloads\files\start_backend_prod.bat"
nssm install ifed-rag        "python" "C:\Users\Zaki_Mir\Downloads\files\rag\server.py"
nssm install ifed-nginx      "<nginx path>\nginx.exe" "-c C:\Users\Zaki_Mir\Downloads\files\deploy\nginx.conf"
nssm install ifed-cloudflared "cloudflared" "tunnel --config C:\Users\Zaki_Mir\Downloads\files\deploy\cloudflared-config.yml run"
```
Set the machine env vars (step 2) so services inherit them. Disable sleep:
`powercfg /change standby-timeout-ac 0` and `powercfg /hibernate off`.

### 10. Backups
- Weekly copy of `financials.db` off-machine.
- `npx convex export` for user data.

---

## Accepted risks at launch (documented, not blockers)
- **RAG per-user auth**: AI calls are gated by per-IP rate limits + origin
  checks, not per-account auth (fixing that needs rag/server.py edits, which are
  off-limits). Fast-follow: nginx `auth_request` validating the Convex JWT — the
  frontend's aiApi.ts (editable) sends the header; server.py never changes.
- **/define glossary cache** is world-writable within rate limits.
- The RAG server spends real Claude tokens per request; the `/ask` budget is
  capped at $2/call in server.py and rate-limited to 3/min + burst 2 per IP.

## Rollback
- `files_local/` is a pristine pre-change copy of the whole app. To revert the
  hardening/debug work, run from that copy.
- Backend cache: `POST /api/cache/clear` with the `X-Admin-Token` header, or
  restart the backend service.
