# Sleep & Pulse Monitors (web)

Status: **Implemented** (web, MVP — seed-only data).

Branch context: `feature/sleep-pulse-monitors`.

Related: the device-metrics data model in
[`../../architecture/domain-model.md`](../../architecture/domain-model.md), the surface model
in [`../../architecture/product-surface-architecture.md`](../../architecture/product-surface-architecture.md),
and the schema in [`../../architecture/database.md`](../../architecture/database.md).

## Problem / Intent

The AI Health Coach stored sleep and recovery signals (`device-metrics` / `health-metrics`) but
had **no user-facing surface** for them — they were only consumed internally by recovery. Users
want to *see* their sleep and pulse: a polished retrieval view for each. This feature adds two
read-only wellness-monitor screens (`/sleep`, `/pulse`) on the web shell, plus the one missing
data primitive (continuous heart rate with workout zones), reusing the existing storage and
aggregation rather than adding parallel tables.

## Scope

### In scope

- Two web screens, `/sleep` and `/pulse`, in the dark "two-world" theme, listed in the
  secondary nav.
- Continuous **heart rate** as a new `metricType` on the existing `healthMetricSnapshots`
  (with workout HR zones), plus pure zone helpers.
- New read-only, ownership-scoped self-view endpoints for the dashboard read models.
- A seed script for ~30 days of synthetic sleep + recovery + heart-rate data.

### Out of scope (non-goals)

- Manual-entry forms or any write/sync endpoint for these screens (data is seed-only for MVP).
- Wearable / HealthKit / Health Connect integration.
- AI proposals over heart rate, a combined `/recovery` dashboard, mobile/Expo.
- New `sleep_sessions` / `heart_rate_readings` tables — continuous HR reuses
  `healthMetricSnapshots`.

## The two screens

- **`/sleep`** (`apps/web/app/sleep/page.tsx` → `apps/web/src/components/sleep/sleep-workspace.tsx`):
  last night's duration, sleep window, and stage breakdown; a 30-day duration trend (bar chart);
  the rolling 7-day average; and a recent-nights list. Full loading / error / empty / success
  states. Model builders/formatters are pure in `apps/web/src/lib/sleep-ui-state.ts`.
- **`/pulse`** (`apps/web/app/pulse/page.tsx` → `apps/web/src/components/pulse/pulse-workspace.tsx`):
  resting-HR and HRV trend lines, latest readiness, and recent workouts each with a fitness
  **%HRmax zone distribution** plus a per-workout HR line (drill-in). Pure helpers in
  `apps/web/src/lib/pulse-ui-state.ts`.

Nav/theme wiring: `SECONDARY_ROUTE_LINKS` (`apps/web/src/lib/nav-ui-state.ts`), the sidebar
icon map (`apps/web/src/components/app-sidebar.tsx`), and `DARK_ROUTE_PREFIXES`
(`apps/web/src/lib/shell-ui-state.ts`). i18n under the `Sleep` / `Pulse` namespaces and
`Nav.sleep` / `Nav.pulse` (`apps/web/messages/{en,ru}.json`). API client:
`getSleepOverview`, `getPulseOverview`, `getWorkoutHeartRate` (`apps/web/src/lib/api.ts`).

## Read API + data-model reuse

Read logic lives in `apps/api/src/modules/health-metrics/vitals-read.service.ts`, wired through
the existing `HealthMetricsController`. All three are **self-view, ownership-scoped by `userId`**
(they resolve the caller and read only that user's rows; they do **not** gate on `allowAiContext`,
which governs AI context, not the user viewing their own data):

- `GET /health-metrics/sleep` → `sleepOverviewResponseSchema`
- `GET /health-metrics/pulse` → `pulseOverviewResponseSchema`
- `GET /health-metrics/pulse/workouts/:id` → `workoutHeartRateDetailSchema` (per-workout samples)

Contracts are in `packages/types/src/vitals.ts`; zone helpers (`deriveMaxHeartRate`,
`computeHeartRateZones`, `HR_ZONE_BANDS`) and the `%HRmax` bands in
`packages/types/src/heart-rate-zones.ts`. New repository reads added to
`apps/api/src/modules/health-metrics/health-metrics.repository.ts`
(`listSleepSnapshotsForRange`, `listRecoveryInputSnapshotsByType`, `listHeartRateSnapshots`,
`findHeartRateSnapshotById`).

**Data model (reuse, no new tables):**

- `"heart_rate"` was added to `healthMetricTypeEnum` **and** `metricScopeEnum` (migration
  `packages/db/drizzle/0041_open_mephistopheles.sql`). Continuous HR is a `heart_rate`
  `metricType` on `healthMetricSnapshots`; its payload (`heartRateSnapshotPayloadSchema` in
  `packages/types/src/device-metrics.ts`) carries `context` (`workout` | `daily` | `resting`),
  avg/max/min bpm, optional `activityType`, downsampled `samples` (capped at 720), and a
  `zoneSummary` of per-zone minutes (`z1Min`…`z5Min`).
- **Resting HR / HRV / readiness stay as `recovery_input` snapshots** — unchanged.
- Exhaustive `HealthMetricType` switches were extended for the new member
  (`metricTypeToScope`, `aggregate-generation.service.ts` — which computes **no** daily HR
  aggregate, `metrics-ai-context.service.ts`, web `metrics-ui-state.ts`).

## Data source (seed-only)

There is **no manual entry and no wearable sync** for MVP. Demo data comes from
`packages/db/scripts/seed-vitals-demo.mjs`, run via
`pnpm db:seed:vitals-demo --user <email>` (also `SEED_USER_EMAIL`). It is idempotent (per-row
`dedupe_key`), targets an **existing** user (log in once first), and for that user inserts one
synthetic `wearable` device consent + connection
(`grantedScopes: ["sleep","recovery_inputs","heart_rate"]`, `allowAiContext: true`) plus ~30
days of: nightly sleep snapshots with stages, daily `resting_heart_rate` + `hrv_summary` (and
occasional `readiness_score`) recovery inputs, and 6 workout `heart_rate` snapshots (samples +
`zoneSummary` via the shared helper). Side effect: the existing recovery readiness lights up for
the seeded user.

## Safety stance

- Wellness-neutral copy throughout (e.g. "typical 7–9h" target, no "normal/abnormal", no
  diagnosis); a `MedicalNote` disclaimer renders on both screens.
- HR zones are framed as **fitness %HRmax** bands (Z1 50–60% … Z5 90–100%), not clinical
  thresholds; max HR is derived from birth date (`~220 − age`, default 190) via a single shared
  constant.
- `heart_rate` is **intentionally excluded from AI context**: it is omitted from
  `AI_SAFE_METRIC_TYPES` in `apps/api/src/modules/health-metrics/metrics-ai-context.service.ts`,
  so HR snapshots/aggregates never enter the coaching-context summary.
- These surfaces are read-only self-view; there are no write/mutation paths.

## UX Placement

`/sleep` and `/pulse` are **secondary-nav surfaces** (not primary tabs), alongside Training,
Nutrition, and Biomarkers — see
[`../../architecture/product-surface-architecture.md`](../../architecture/product-surface-architecture.md).
They are display-only and do not participate in the proposal lifecycle.

## Verification

1. `pnpm db:up`, then `pnpm dev` (auto-migrates; API :3000, Web :3001).
2. Log in once (creates the user row), then `pnpm db:seed:vitals-demo --user <email>`.
3. `/sleep`: last night + stages + 30-day bars + 7-day average; check loading / empty / error.
4. `/pulse`: RHR & HRV trends + readiness + workout zone distribution + per-workout HR line.
5. API: `GET /health-metrics/sleep` and `/pulse` with a bearer token return the read models.
6. Tests: `corepack pnpm --dir apps/api test`; `corepack pnpm --dir packages/types test`; web
   `typecheck` + `lint` (`--max-warnings=0`).
