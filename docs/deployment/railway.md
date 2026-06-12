# Railway Deployment

Deploy AI Health Coach as separate Railway services from this monorepo. Each service uses an explicit Dockerfile with the **repository root** as the Docker build context.

## Architecture

| Service       | Railway name  | Dockerfile            | Purpose                          |
|---------------|---------------|-----------------------|----------------------------------|
| PostgreSQL    | (Railway addon) | —                   | Primary database                 |
| API           | `health-api`  | `apps/api/Dockerfile` | NestJS backend                 |
| Web           | `health-web`  | `apps/web/Dockerfile` | Next.js frontend               |

```text
Browser → health-web (Next.js) → health-api (NestJS) → Railway Postgres
                ↓                        ↓
              Clerk                  Clerk JWKS / OpenAI
```

## Prerequisites

- Railway account and CLI (`npm i -g @railway/cli` or see [Railway docs](https://docs.railway.com/))
- Clerk application (publishable key, secret key, JWKS URL)
- OpenAI API key (if `AI_COACH_PROVIDER=openai`)
- GitHub repo connected to Railway (recommended)

## Local Docker build (optional)

From the repo root:

```bash
docker build -f apps/api/Dockerfile -t health-api .
docker build -f apps/web/Dockerfile -t health-web .
```

Run locally (example):

```bash
docker run --rm -p 3000:3000 -e PORT=3000 -e DATABASE_URL=postgres://... health-api
docker run --rm -p 3001:3001 -e PORT=3001 health-web
```

## Railway project setup

### 1. Create project and Postgres

1. Create a new Railway project.
2. Add a **PostgreSQL** service.
3. Note the generated `DATABASE_URL` (or use Railway variable references).

### 2. Deploy `health-api`

Create a new service from the GitHub repo (or empty service + connect repo).

| Setting            | Value                          |
|--------------------|--------------------------------|
| Service name       | `health-api`                   |
| Builder            | Dockerfile                     |
| Dockerfile path    | `apps/api/Dockerfile`          |
| Root directory     | `/` (repo root)                |
| Watch paths        | `apps/api/**`, `packages/**`   |

**Environment variables**

| Variable                 | Source / value                                      | Notes                                      |
|--------------------------|-----------------------------------------------------|--------------------------------------------|
| `PORT`                   | Railway (automatic)                                 | Mapped to `API_PORT` in API env loader     |
| `DATABASE_URL`           | `${{Postgres.DATABASE_URL}}`                      | Reference linked Postgres service          |
| `CLERK_JWKS_URL`         | Clerk dashboard → JWKS URL                          | Required for authenticated API requests  |
| `AI_COACH_PROVIDER`      | `openai` or `stub`                                  | Use `stub` for non-AI smoke tests          |
| `OPENAI_API_KEY`         | Railway secret                                      | Required when `AI_COACH_PROVIDER=openai`   |
| `OPENAI_MODEL`           | `gpt-4o-mini` (or chosen model)                     | Optional; defaults in code                 |
| `OPENAI_MODEL_LAB_EXTRACTION` | `gpt-4o-mini` (or chosen model)                | Optional; overrides the model for the out-of-band lab-report biomarker extraction stage. Falls back to `OPENAI_MODEL` |
| `LAB_REPORT_STORAGE_PATH` | `/app/.data/lab-reports`                           | Local container path for uploaded lab-report bytes; see storage note |
| `CHAT_ATTACHMENT_STORAGE_PATH` | `/app/.data/chat-attachments`                 | Local container path for chat attachment bytes; see storage note |
| `CORS_ORIGINS`           | `https://<web-service-public-domain>`               | **Required in production.** API startup fails closed (no CORS) when unset. Safari also requires explicit origins for Bearer auth. |
| `STORAGE_ALLOW_LOCAL_IN_PRODUCTION` | `true`                               | **Required** when using local-volume lab-report/attachment storage on Railway. Omit or set to `false` when object storage is used instead. |
| `STRIPE_SECRET_KEY`      | Stripe → Developers → API keys → **Secret key**     | Billing. `sk_live_...` (prod) / `sk_test_...` (test). Without it checkout/portal fail closed |
| `STRIPE_PRICE_PRO`       | Stripe → Products → Pro price → **Price ID**        | Billing. `price_...` (the recurring price, **not** the `prod_...` id) |
| `STRIPE_WEBHOOK_SECRET`  | Stripe → Developers → Webhooks → endpoint signing secret | Billing. `whsec_...`; see "Stripe billing setup" below |
| `WEB_APP_BASE_URL`       | `https://<web-service-public-domain>`               | Billing. Used for checkout success/cancel and portal return URLs |

Store secrets (`OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `DATABASE_URL` if not referenced) in Railway **Variables** marked as secrets. Do not commit them.

**Stripe billing setup**

The billing feature (Free vs Pro, AI-chat quota; migration `0031_billing_subscriptions`) needs the four `STRIPE_*` / `WEB_APP_BASE_URL` vars above. The app **fails closed** without them — the `/billing` screen (plan + quota) still renders, but checkout/portal return an error until they are set. Keep all values in the **same mode**: live keys with a live price, or test keys with a test price.

1. **Secret key** (`STRIPE_SECRET_KEY`): Stripe Dashboard → toggle **Test/Live** mode (top-right) → **Developers → API keys** → reveal/copy the **Secret key** (`sk_live_...` / `sk_test_...`). Not the publishable (`pk_`) or restricted (`rk_`) key. A rolled key invalidates the old one.
2. **Price ID** (`STRIPE_PRICE_PRO`): **Products** → create/open the **Pro** product with a recurring price → copy its **Price ID** (`price_...`).
3. **Webhook** (`STRIPE_WEBHOOK_SECRET`): **Developers → Webhooks → Add endpoint** → URL `https://<api-domain>/webhooks/stripe` → subscribe to at least `checkout.session.completed` and `customer.subscription.created|updated|deleted` → copy the endpoint **Signing secret** (`whsec_...`). The Pro upgrade is persisted to the DB only when this webhook is delivered and verified.
4. **`WEB_APP_BASE_URL`**: the public web domain (no trailing slash) — Stripe redirects back to `…/billing?checkout=success|cancel` and the customer portal returns to `…/billing`.

**Generate a public domain** for the API service, then use it as `https://<api-domain>`.

**Verify**

```bash
curl -sS https://<api-domain>/health
# Expected: {"service":"api","status":"ok"}

curl -sS https://<api-domain>/health/ready
# Expected: {"service":"api","status":"ok","checks":[...]}
```

### 3. Run database migrations (MVP: manual)

Do **not** run migrations automatically on every API start for MVP. Apply them explicitly after Postgres is available and before or after the first API deploy.

> **Pending migration — `0038_biomarkers_replace_documents`.** This migration replaces the
> health-documents tables with the biomarkers model: it **drops** `health_documents`,
> `health_document_summaries`, `document_signals` (and their six `document_*` enums) plus
> `chat_attachments.linked_document_id`, and creates `lab_reports` + `biomarker_readings`.
> Like every Drizzle migration under `packages/db/drizzle`, the Railway deploy is **not
> complete until `0038` is applied manually via the Railway CLI** (Option A below). Because it
> drops tables, take a backup first.

**Option A — Railway CLI one-off (recommended)**

Link the project and run migrations with the production `DATABASE_URL`:

```bash
railway link
railway run --service health-api pnpm --dir packages/db db:migrate
```

If API runtime `DATABASE_URL` uses Railway private networking, keep it private and run migrations with an explicit one-off command that maps the public migration URL into `DATABASE_URL` only for that process:

```bash
railway.cmd run --service health-api powershell -NoProfile -Command '$env:DATABASE_URL=$env:MIGRATION_DATABASE_URL; pnpm --dir packages/db db:migrate'
```

If migrations must run without the API service context, set `DATABASE_URL` on a shell service or use `railway variables` and run from a local machine with the remote URL (handle credentials securely).

**Option B — Local against Railway Postgres**

```bash
DATABASE_URL="postgres://..." pnpm --dir packages/db db:migrate
```

**Seeds (non-production only)**

```bash
# All reference data at once (exercises + recipes + habit templates):
railway run --service health-api pnpm db:seed
# Or individually:
railway run --service health-api pnpm --dir packages/db db:seed:exercises
railway run --service health-api pnpm --dir packages/db db:seed:recipes
railway run --service health-api pnpm --dir packages/db db:seed:habit-templates
```

Only run seeds in staging or with explicit approval. Do not seed production unless intended.

**Later hardening**

- Add a dedicated migration job service or Railway pre-deploy command once migrations are proven idempotent.
- Keep migration SQL in `packages/db/drizzle/` under version control.

### 4. Deploy `health-web`

Create a second service from the same repo.

| Setting            | Value                          |
|--------------------|--------------------------------|
| Service name       | `health-web`                   |
| Builder            | Dockerfile                     |
| Dockerfile path    | `apps/web/Dockerfile`          |
| Root directory     | `/` (repo root)                |
| Watch paths        | `apps/web/**`, `packages/**`   |

**Environment variables**

| Variable                              | Value                                      |
|---------------------------------------|--------------------------------------------|
| `PORT`                                | Railway (automatic)                        |
| `NEXT_PUBLIC_API_BASE_URL`            | `https://<api-service-public-domain>`      | No trailing slash |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`   | Clerk publishable key                      |
| `CLERK_SECRET_KEY`                    | Clerk secret (Railway secret)              |

`NEXT_PUBLIC_*` values are embedded at **build time**. Set them on the `health-web` service **before** the first deploy (Railway exposes service variables during Docker builds). After changing them, trigger a **redeploy/rebuild** of `health-web`.

The Web Dockerfile uses Next.js `output: "standalone"`. The container runs `node apps/web/server.js` and listens on Railway `PORT`.

**Generate a public domain** for the web service and open it in a browser.

## Domains and CORS

- Assign Railway public domains (or custom domains) to both services.
- Set `NEXT_PUBLIC_API_BASE_URL` on `health-web` to the API public URL (no trailing slash), then **rebuild** the web service. The web app calls the API through a same-origin `/api-proxy` route handler proxy, which avoids Safari cross-origin `Authorization` issues.
- Set `CORS_ORIGINS` on `health-api` to the web public URL (comma-separated if you have staging + production). This variable is **required in production** — the API fails closed (no CORS at all) when it is unset.
- The API allows only the origins listed in `CORS_ORIGINS`. This is required for Safari on iOS, which blocks cross-origin `fetch()` calls that send `Authorization: Bearer ...` when the API responds with a wildcard origin.
- If mobile shows `... could not be loaded` while `GET /health` works in the phone browser, check both `NEXT_PUBLIC_API_BASE_URL` (web rebuild) and `CORS_ORIGINS` (api redeploy).

## Lab-report / attachment storage caveat

The API stores uploaded lab-report bytes on the local filesystem at `LAB_REPORT_STORAGE_PATH` (default `/app/.data/lab-reports`) and chat attachment bytes at `CHAT_ATTACHMENT_STORAGE_PATH` (default `/app/.data/chat-attachments`).

Railway container filesystem is **ephemeral** unless a volume is attached. Uploads are lost on redeploy or restart unless you:

- Attach a Railway volume mounted at `/app/.data` (covering both paths), or
- Move storage to an access-controlled, encrypted object store (S3/R2) in a future slice.

For MVP, treat upload persistence as a known limitation unless a volume is configured. (Extracted lab-report text is never persisted — only the structured biomarker readings and the raw file bytes are stored.)

## Logs and incident runbook

Railway captures stdout/stderr from each service. `health-api` and `health-web` write structured JSON logs so support can filter by service, event, request id, route, status, and duration.

| Channel              | How to view                                      |
|----------------------|--------------------------------------------------|
| Dashboard            | Service → Deployments / Observability / Logs     |
| Build logs           | Deployment details or `railway logs --service health-api --build` |
| Runtime logs         | `railway logs --service health-api`              |
| Recent JSON tail     | `railway logs --service health-api --json --lines 200` |
| Web proxy logs       | `railway logs --service health-web --json --lines 200` |
| HTTP/edge logs       | `railway logs --service health-api --lines 200 --filter "@httpStatus:500"` |
| Metrics              | `railway metrics --service health-api --since 1h` |

Useful Railway HTTP edge log filters use Railway metadata such as `httpStatus`:

```bash
railway logs --service health-api --json --lines 200
railway logs --service health-web --json --lines 200
railway logs --service health-api --build --lines 200
railway logs --service health-api --lines 200 --filter "@httpStatus:500 OR @httpStatus:502"
railway metrics --service health-api --http --since 1h
```

Useful app JSON structured log filters use fields emitted by `health-api` and `health-web`, such as `requestId`, `path`, `statusCode`, `level`, `event`, and `errorCategory`:

```bash
railway logs --service health-api --json --lines 500 | rg '"requestId":"<request-id>"'
railway logs --service health-api --json --lines 500 | rg '"path":"/health/ready"'
railway logs --service health-api --json --lines 500 | rg '"event":"http.exception"|"level":"error"'
railway logs --service health-api --json --lines 500 | rg '"statusCode":5|"errorCategory":"database"|"errorCategory":"auth_jwks"|"errorCategory":"ai_provider"'
railway logs --service health-web --json --lines 500 | rg '"event":"api_proxy"|"statusCode":502'
```

**Implemented behavior**

- `health-api` logs JSON entries with `service`, `environment`, `level`, `timestamp`, `event`, `requestId`, `method`, `path`, `statusCode`, `durationMs`, and safe error categories.
- `health-api` accepts or generates `x-request-id`, returns it on responses, and includes it in request and exception logs.
- `GET /health` is cheap liveness. `GET /health/ready` checks required config and database connectivity.
- API startup diagnostics log whether integrations are configured, without printing secret values.
- `health-web` logs startup diagnostics and `/api-proxy` route handler requests as JSON with `service: "health-web"`, `event: "api_proxy"`, `requestId`, route, status, and duration.
- Web `ApiResult` includes `requestId`; UI error helpers can display it as `Request ID: ...` for support.

**Trace a failing UI action**

1. Reproduce the failure and copy the `Request ID` shown in the UI or network response header `x-request-id`.
2. Search `health-web` logs for that id to see the `/api-proxy` status and duration.
3. Search `health-api` logs for the same id to find the backend request, status, duration, and any `http.exception` entry.
4. If the id appears only in web logs, check `NEXT_PUBLIC_API_BASE_URL`, upstream connectivity, API deploy status, and web proxy `502` logs.
5. If the id appears in API logs with `5xx`, check `errorCategory`, startup diagnostics, `/health/ready`, and service metrics.

**Privacy rules**

- Do not log API keys, bearer tokens, raw AI prompts, document contents, private health payloads, or full request bodies.
- Share request ids, status codes, sanitized paths, durations, safe error categories, and readiness check names instead.
- Treat Railway variable output as sensitive; do not paste secret-bearing command output into tickets or chat.

**Future observability**

- Add a Railway log drain for retention and alerting (Axiom, Better Stack, Datadog, Logtail, etc.).
- Add Sentry for frontend/backend exceptions once release/environment tags and privacy scrubbing are configured.
- Consider OpenTelemetry/APM traces after request-id logging is stable.

## Rollback

1. Open the service in Railway → **Deployments**.
2. Select a previous successful deployment → **Redeploy** (or use Railway rollback if available for your plan).
3. Roll back **API and Web independently** if only one service regressed.
4. Database rollbacks are **not** automatic: Drizzle migrations are forward-only. Plan manual down migrations or backups before risky schema changes.

## Rollout checklist

- [ ] Railway project created
- [ ] Postgres service running; `DATABASE_URL` available
- [ ] `health-api` deployed from `apps/api/Dockerfile`
- [ ] API env vars set (Clerk JWKS, DB, AI provider)
- [ ] Billing env vars set on `health-api` (`STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO`, `STRIPE_WEBHOOK_SECRET`, `WEB_APP_BASE_URL`), same Stripe mode; webhook endpoint `…/webhooks/stripe` created
- [ ] Migrations applied: `pnpm --dir packages/db db:migrate` (includes `0031_billing_subscriptions`)
- [ ] `GET /health` returns 200 on API public URL
- [ ] `GET /health/ready` returns 200 with `status: "ok"`
- [ ] `health-web` deployed from `apps/web/Dockerfile`
- [ ] Web env vars set (`NEXT_PUBLIC_API_BASE_URL`, Clerk keys)
- [ ] Web app loads on public URL
- [ ] Authenticated flows reach API; request ids appear in both `health-web` and `health-api` logs
- [ ] `CORS_ORIGINS` set on `health-api` to the web public URL (required — API fails closed without it)
- [ ] `STORAGE_ALLOW_LOCAL_IN_PRODUCTION=true` set on `health-api` when using Railway local-volume storage
- [ ] Lab-report / attachment upload expectations documented (ephemeral storage unless volume added)
- [ ] Migration `0038_biomarkers_replace_documents` applied via Railway CLI (drops document tables, creates lab_reports + biomarker_readings)

## Troubleshooting

| Symptom                         | Likely cause                                      |
|---------------------------------|---------------------------------------------------|
| API crash on start              | Missing `DATABASE_URL` or invalid Clerk JWKS URL  |
| Web shows wrong API             | Stale build; `NEXT_PUBLIC_API_BASE_URL` needs rebuild |
| Mobile Safari: content unavailable, desktop OK | `CORS_ORIGINS` unset or missing the web origin; set `CORS_ORIGINS` on `health-api` and rebuild web |
| 502 / connection refused        | Service not listening on `PORT` or health check mismatch |
| `/health` OK, `/health/ready` fails | API process is live, but DB or required config is not ready |
| UI shows `Request ID: ...`      | Search web and API logs for the id to trace the failing request |
| Request id only appears in web logs | API is unreachable from proxy, API base URL is wrong, or upstream returned no response |
| `http.exception` with `auth_jwks` | Clerk JWKS config or token validation issue |
| `http.exception` with `database` | Postgres connectivity, migration, or query failure |
| `api_proxy` 502 in web logs     | `health-web` could not reach `health-api`; check API deploy and `NEXT_PUBLIC_API_BASE_URL` |
| Migrations fail                 | Wrong `DATABASE_URL`, or migration order conflict |
| Uploads disappear after deploy  | Ephemeral filesystem; add volume or object storage  |

## What stays outside this repo

- Railway dashboard service linking and domain assignment
- Clerk production keys and allowed redirect URLs for Railway domains
- OpenAI billing and rate limits
- Optional staging environment (`staging` vs `production` Railway environments)
- Volume or object storage for durable lab-report / attachment uploads

See also: root `package.json` scripts (`db:migrate`), `apps/api/.env.example`, and `apps/web/.env.example`.
