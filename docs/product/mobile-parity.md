# Mobile Parity (Expo) — Deferred

**Decision (2026-06): web + API first.** The Expo app stays a thin shell while the
product surface, the LLM pipeline, and the structured-state model stabilize on web
and the API. Mobile parity is an explicit follow-up, not in-scope for the current
MVP.

## Where mobile is today

The Expo / Expo Router app ([`apps/mobile`](../../apps/mobile)) is a thin,
read-leaning shell with five tabs
([`apps/mobile/app/(tabs)`](../../apps/mobile/app)):

- `index` (Today), `chat`, `training`, `nutrition`, `metrics`.

## Web IA it does not yet match

The web app ([`apps/web/app`](../../apps/web)) is the primary product surface and
is materially ahead. Mobile does not yet cover, among others:

- **Longevity** (weekly cross-domain overview) and **Progress**.
- **Profile / Onboarding / Goals** structured flows.
- **Documents** (consent-gated upload/parse/review) and **Recipes**.
- **Billing** (Free/Pro) and **Proposals** review UI.
- The **editable proposal cards + performed log** UI (see
  [`features/editable-proposals-performed-log.md`](features/editable-proposals-performed-log.md)).

## What is explicitly out of scope for MVP

- **No HealthKit / Health Connect ingestion in MVP 1.** Device-metric APIs,
  consent, and aggregates exist server-side, but native health-data ingestion is
  not wired up on mobile (or web). This matches the frontend style rule "Do not
  add HealthKit or Health Connect in MVP 1."

## Trigger for revisiting

Bring mobile up to parity once **all** of these hold:

1. The web IA and the LLM pipeline have stabilized (no churning surfaces).
2. There is a concrete need for native, on-the-go capture (e.g. food/body photos
   away from a desktop) that web cannot serve.
3. A decision is made to pursue HealthKit / Health Connect ingestion, which is the
   main thing that *requires* native and currently sits behind the MVP boundary.

Until then, mobile tracks web behind a deliberate lag and shares contracts through
`packages/*` (never importing app code across apps).
