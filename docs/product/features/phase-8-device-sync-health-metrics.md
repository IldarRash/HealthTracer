# Phase 8: Device Sync and Health Metrics

## Summary

Phase 8 adds consent-based device sync and normalized health metrics as structured state for wellness coaching. The product should collect Apple HealthKit, Android Health Connect, and wearable data only after explicit user consent, then persist normalized snapshots and aggregates instead of exposing raw private logs to AI by default.

This phase is not an MVP 1 implementation item. Web/API planning can start from the current repository, but Apple HealthKit and Android Health Connect require mobile platform implementation, platform permissions, and device-level testing. The first useful delivery should establish consent, contracts, persistence boundaries, and safe AI context rules before ingesting live provider data.

## Problem

Users already generate useful health and fitness signals in phones and wearables, including steps, sleep, weight, workouts, and recovery indicators. AI Health Coach needs these signals to improve progress tracking and coaching context, but raw device logs are sensitive, high-volume, provider-specific, and easy to over-share.

The product needs a privacy-preserving sync model that makes structured metrics authoritative, gives users clear control over what is collected, and prevents raw private logs from becoming default AI context.

## Goals

- Add an explicit consent model for device integrations before any device data is collected or stored.
- Support normalized metric snapshots for key wellness signals: steps, sleep, weight, workouts, and recovery inputs.
- Support metric aggregates that are safe for trend views and default AI coaching context.
- Track device connections by provider, granted scopes, status, and revocation state.
- Preserve least-privilege access by requesting only the scopes needed for enabled metric types.
- Keep all coaching language in wellness, fitness, tracking, and behavior-change framing.
- Make metrics part of structured state, not chat-derived state.

## Non-Goals

- No diagnosis, treatment guidance, risk scoring, or medical interpretation.
- No recovery scoring model in the first implementation; collect recovery inputs only.
- No raw provider log exposure to AI by default.
- No background sync without active consent and platform permission.
- No production wearable vendor OAuth implementation until storage, consent, and revocation behavior are in place.
- No broad data lake or medical record architecture.
- No MVP 1 dependency; this remains later-roadmap work until the core plan, execution, and proposal loop is complete.

## Target Users and Surfaces

- Mobile users connect Apple HealthKit or Android Health Connect, grant granular scopes, see sync status, and revoke access.
- Web users can inspect normalized metric history and device connection status where useful, especially during development and support.
- Coach chat can use safe summaries and aggregates as coaching context after consent, but not raw private device logs.
- Metrics surface shows recent snapshots, trends, and sync state for steps, sleep, weight, workouts, and recovery inputs.
- Developer/admin web views may show sync health and aggregate payloads, but must avoid exposing raw private logs unnecessarily.

## Data and Privacy Model

Device sync data has three tiers:

1. `device_connections`: integration metadata for a user and provider, including provider, platform, granted scopes, status, connected time, revoked time, and last sync cursor metadata where appropriate.
2. `health_metric_snapshots`: normalized, source-attributed point-in-time or interval records. These are the authoritative metric records used by the app.
3. `health_metric_aggregates`: derived daily or weekly summaries for trend displays and default AI context.

The product should avoid storing raw provider payloads. If temporary raw payloads are ever needed for debugging, they must be short-lived, disabled by default, excluded from AI context, and stripped of unnecessary fields.

Each stored metric must include user ownership, metric type, normalized value or structured payload, unit, source provider, source device metadata where safe, observed time or interval, ingestion time, and consent reference. Sync writes should be idempotent using a provider source identifier when available or a deterministic dedupe key when not.

## Consent Model

- Users must grant explicit app-level consent before provider authorization begins.
- Consent must be granular by provider and metric scope, for example steps, sleep, weight, workouts, and recovery inputs.
- The app must explain what will be collected, why it is useful, and how it can be used by AI before consent is granted.
- Provider permission prompts must request only the scopes the user enabled.
- Revocation must stop future sync, mark the connection revoked, and prevent revoked scopes from being used in new AI context.
- Historical normalized metrics should remain only if product policy and consent copy make retention clear; otherwise deletion or retention options must be designed before implementation.
- Consent records should be auditable and referenced by synced metrics.

## Provider Scope

### Apple HealthKit

- Requires Expo/native iOS implementation or a custom native module/config plugin.
- Initial scopes: steps, sleep analysis, body mass, workouts, and selected recovery inputs if supported by HealthKit categories or quantities.
- Must handle iOS permission states, unavailable simulator/device conditions, and foreground or background sync limitations.

### Android Health Connect

- Requires Android mobile implementation and Health Connect permissions.
- Initial scopes: steps, sleep sessions, weight, exercise sessions, and selected recovery inputs where available.
- Must handle devices without Health Connect, permissions revoked outside the app, and version differences in provider APIs.

### Wearable Sync

- Later provider adapters may connect vendor APIs such as Garmin, Fitbit, Oura, Whoop, or Polar.
- Vendor sync should use the same `device_connections`, consent, snapshot, and aggregate model.
- OAuth tokens or refresh tokens must never be committed or logged, and should be stored with least privilege and encryption appropriate to deployment.
- Wearable-specific fields should map into normalized metrics instead of leaking vendor payloads into app or AI contracts.

## Normalized Metric Definitions

Metric snapshots should be typed records rather than generic blobs wherever practical:

- `steps`: count over an interval, normalized to steps.
- `sleep`: sleep interval with duration, start/end, optional stage summaries, and quality fields only if provider data is reliable and consented.
- `weight`: body mass point measurement, normalized to kilograms.
- `workout`: workout or exercise session interval with activity type, duration, optional distance, optional energy estimate, and source provider.
- `recovery_input`: provider-supplied recovery-adjacent inputs such as resting heart rate, heart-rate variability summary, readiness score from a wearable, soreness, mood, or fatigue when explicitly consented.

Metric aggregates should be derived summaries, for example:

- Daily steps total and seven-day average.
- Sleep duration, sleep window, and seven-day average.
- Latest weight plus weekly trend.
- Workout count, duration, and activity mix by week.
- Recovery input summary by day or week without medical interpretation.

Aggregates should preserve provenance by listing source metric types, included date range, and calculation time.

## AI Context Boundaries

- Default AI context may include consented aggregates and selected recent snapshots that are directly relevant to coaching.
- Raw provider logs, high-frequency samples, exact sleep stage timelines, exact heart-rate streams, and vendor payloads must not be sent to AI by default.
- AI prompts should receive metric summaries in structured form with clear labels, source date ranges, and freshness timestamps.
- AI may explain trends and suggest wellness or training adjustments, but must not diagnose, treat, or make medical claims.
- AI-generated changes to plans still use the existing proposal approval flow and backend validation.
- Users should be able to disconnect providers or disable AI use of synced metrics independently from viewing metrics in the app if product policy supports that distinction.

## Acceptance Criteria

- A user cannot start device sync until explicit consent is recorded for the selected provider and metric scopes.
- The app records device connection status, granted scopes, connection time, revocation time, and last successful sync metadata.
- Provider data is transformed into normalized metric snapshots before persistence; raw provider payloads are not stored by default.
- Synced metrics are user-owned and cannot be read or written across user boundaries.
- Sync writes are idempotent and do not create duplicate snapshots for repeated provider reads.
- Daily or weekly aggregates are generated from snapshots for trend displays and AI context.
- Coach AI context includes only consented aggregates or safe snapshots by default, never raw private logs.
- Revoking a connection stops future sync and removes revoked scopes from subsequent AI context.
- Mobile provider flows communicate requested scopes and consent clearly before platform permission prompts.
- Web/API developer views can show connection status, metric snapshots, and aggregates without exposing provider secrets or raw payloads.
- Tests cover consent gating, ownership checks, normalization, idempotent sync, aggregate generation, revocation, and AI context filtering.

## Risks and Assumptions

- Apple HealthKit and Android Health Connect cannot be fully delivered from web/API alone; they require mobile permissions and real-device validation.
- Provider APIs differ in units, interval semantics, dedupe identifiers, and availability, which can cause inconsistent metrics if normalization is too loose.
- Consent copy and retention policy must be settled before implementation to avoid collecting data under unclear terms.
- Recovery inputs can drift into medical or diagnostic interpretation; keep them as wellness signals and avoid clinical scoring.
- Raw device data may be sensitive and high volume; default storage should remain normalized and minimal.
- Background sync reliability varies by platform and may need later iteration after foreground sync works.
- Local runtime verification depends on Clerk, Postgres, and mobile platform setup.

## Sequencing and Dependencies

1. Finish or explicitly defer blocking MVP 1 surfaces so Phase 8 does not distract from the core plan/execution/proposal loop.
2. Define consent, device connection, metric snapshot, and aggregate contracts in `packages/types`.
3. Add Drizzle schema and migrations for consent records if not already present, device connections, health metric snapshots, and health metric aggregates.
4. Add NestJS metrics/device modules with repositories and services for consent checks, connection status, snapshot reads, aggregate reads, and sync ingestion from provider adapters.
5. Add AI coaching context filtering so only consented aggregates and safe snapshots can enter prompts.
6. Add web developer views for connection status, metric history, aggregate inspection, and AI context preview.
7. Add mobile consent and permission surfaces for Apple HealthKit and Android Health Connect.
8. Implement provider adapters behind a common sync interface, starting with foreground sync and idempotent writes.
9. Add aggregate generation and tests before enabling AI use.
10. Verify with local API/web flows, then mobile real-device HealthKit/Health Connect flows.

## Open Questions

- Should consent be modeled as a standalone `consents` table shared with documents, or as scoped records under `device_connections`?
- What is the retention policy when a user revokes provider access: stop future sync only, delete historical metrics, or offer a user choice?
- Which metric types should be enabled in the first provider release: steps and weight only, or steps, sleep, weight, workouts, and recovery inputs together?
- Should users have a separate toggle for "use synced metrics in AI coaching" apart from "store and display synced metrics"?
- How should conflicts be handled when multiple providers report the same metric for the same interval?
- What mobile stack path should be used for HealthKit and Health Connect in Expo: config plugins, custom dev client, or ejecting/native modules?
- Which wearable vendor should be first after platform health stores, if any?
- How often should sync run in the first release: manual, app-open foreground sync, scheduled background sync, or provider webhook where available?

## Initial Implementation Plan

### Backend and Contracts

- Add shared Zod enums and schemas for provider, connection status, consent scope, metric type, snapshot payloads, aggregate payloads, and AI context metric summaries.
- Add database tables for device connections, consent or consent grants, health metric snapshots, and health metric aggregates.
- Implement metrics services that require active consent before ingestion and enforce user ownership on all reads.
- Implement aggregate generation as a deterministic service that can run after ingestion or on a scheduled job later.
- Extend coaching context with an explicit metrics summary builder that filters by consent, freshness, and AI-safe metric types.

### Web Surface

- Add a developer-oriented Metrics view for connection state, recent normalized snapshots, aggregate summaries, and AI context preview.
- Keep provider connection actions disabled or marked unavailable on web when native mobile permissions are required.
- Add clear empty states for no consent, no connection, no synced data, and revoked connection.

### Mobile Surface

- Add a device sync onboarding/settings flow with scope selection and consent copy before provider permission prompts.
- Implement platform-specific HealthKit and Health Connect adapters after contracts and backend ingestion are stable.
- Start with manual or foreground sync, then evaluate background sync after real-device behavior is understood.

### Tests and Verification

- Contract tests for metric schemas, units, and aggregate payloads.
- Backend service/repository tests for consent gating, ownership, idempotent ingestion, revocation, and aggregate generation.
- AI context tests proving raw logs and revoked scopes are excluded.
- Web UI state tests for consent and empty states.
- Mobile real-device smoke tests for HealthKit and Health Connect permission and sync flows.
