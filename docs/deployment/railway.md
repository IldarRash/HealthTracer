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
| `DOCUMENT_STORAGE_PATH`  | `/app/.data/documents`                              | Local container path; see storage note     |

Store secrets (`OPENAI_API_KEY`, `DATABASE_URL` if not referenced) in Railway **Variables** marked as secrets. Do not commit them.

**Generate a public domain** for the API service (e.g. `https://health-api-production.up.railway.app`).

**Verify**

```bash
curl -sS https://<api-domain>/health
# Expected: {"service":"api","status":"ok"}
```

### 3. Run database migrations (MVP: manual)

Do **not** run migrations automatically on every API start for MVP. Apply them explicitly after Postgres is available and before or after the first API deploy.

**Option A — Railway CLI one-off (recommended)**

Link the project and run migrations with the production `DATABASE_URL`:

```bash
railway link
railway run --service health-api pnpm --dir packages/db db:migrate
```

If migrations must run without the API service context, set `DATABASE_URL` on a shell service or use `railway variables` and run from a local machine with the remote URL (handle credentials securely).

**Option B — Local against Railway Postgres**

```bash
DATABASE_URL="postgres://..." pnpm --dir packages/db db:migrate
```

**Seeds (non-production only)**

```bash
railway run --service health-api pnpm --dir packages/db db:seed:recipes
railway run --service health-api pnpm --dir packages/db db:seed:exercises
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
| `NEXT_PUBLIC_API_BASE_URL`            | `https://<api-service-public-domain>`      |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`   | Clerk publishable key                      |
| `CLERK_SECRET_KEY`                    | Clerk secret (Railway secret)              |

`NEXT_PUBLIC_*` values are embedded at **build time**. Set them on the `health-web` service **before** the first deploy (Railway exposes service variables during Docker builds). After changing them, trigger a **redeploy/rebuild** of `health-web`.

The Web Dockerfile uses Next.js `output: "standalone"`. The container runs `node apps/web/server.js` and listens on Railway `PORT`.

**Generate a public domain** for the web service and open it in a browser.

## Domains and CORS

- Assign Railway public domains (or custom domains) to both services.
- Set `NEXT_PUBLIC_API_BASE_URL` to the API public URL (no trailing slash).
- The API enables CORS globally; restrict origins in a future hardening pass if needed.

## Document storage caveat

The API stores uploaded documents on the local filesystem at `DOCUMENT_STORAGE_PATH` (default under `/app/.data/documents` in the container).

Railway container filesystem is **ephemeral** unless a volume is attached. Uploads are lost on redeploy or restart unless you:

- Attach a Railway volume mounted at `/app/.data/documents`, or
- Move document storage to object storage (S3/R2) in a future slice.

For MVP, treat document persistence as a known limitation unless a volume is configured.

## Logs

Railway captures stdout/stderr from each service.

| Channel              | How to view                                      |
|----------------------|--------------------------------------------------|
| Dashboard            | Service → Deployments / Observability / Logs     |
| Build logs           | Deployment details or `railway logs --build`     |
| Runtime logs         | `railway logs`                                   |
| Recent tail          | `railway logs -n 100`                            |

**Logging rules**

- NestJS and Next log to stdout/stderr only.
- Do not log API keys, raw AI prompts, document contents, or private health data.
- For long-term retention, add a log drain (Axiom, Datadog, Logtail, etc.) later.

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
- [ ] Migrations applied: `pnpm --dir packages/db db:migrate`
- [ ] `GET /health` returns 200 on API public URL
- [ ] `health-web` deployed from `apps/web/Dockerfile`
- [ ] Web env vars set (`NEXT_PUBLIC_API_BASE_URL`, Clerk keys)
- [ ] Web app loads on public URL
- [ ] Authenticated flows reach API (check Railway logs for auth/DB errors, not sensitive payloads)
- [ ] Document upload expectations documented (ephemeral storage unless volume added)

## Troubleshooting

| Symptom                         | Likely cause                                      |
|---------------------------------|---------------------------------------------------|
| API crash on start              | Missing `DATABASE_URL` or invalid Clerk JWKS URL  |
| Web shows wrong API             | Stale build; `NEXT_PUBLIC_API_BASE_URL` needs rebuild |
| 502 / connection refused        | Service not listening on `PORT` or health check mismatch |
| Migrations fail                 | Wrong `DATABASE_URL`, or migration order conflict |
| Uploads disappear after deploy  | Ephemeral filesystem; add volume or object storage  |

## What stays outside this repo

- Railway dashboard service linking and domain assignment
- Clerk production keys and allowed redirect URLs for Railway domains
- OpenAI billing and rate limits
- Optional staging environment (`staging` vs `production` Railway environments)
- Volume or object storage for durable document uploads

See also: root `package.json` scripts (`db:migrate`), `apps/api/.env.example`, and `apps/web/.env.example`.
