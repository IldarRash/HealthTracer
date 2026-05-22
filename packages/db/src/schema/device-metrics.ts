import {
  boolean,
  date,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const deviceProviderEnum = pgEnum("device_provider", [
  "apple_healthkit",
  "android_health_connect",
  "wearable",
]);

export const devicePlatformEnum = pgEnum("device_platform", ["ios", "android", "web"]);

export const deviceConnectionStatusEnum = pgEnum("device_connection_status", [
  "pending",
  "connected",
  "syncing",
  "error",
  "revoked",
]);

export const metricScopeEnum = pgEnum("metric_scope", [
  "steps",
  "sleep",
  "weight",
  "workouts",
  "recovery_inputs",
]);

export const healthMetricTypeEnum = pgEnum("health_metric_type", [
  "steps",
  "sleep",
  "weight",
  "workout",
  "recovery_input",
]);

export const aggregatePeriodTypeEnum = pgEnum("aggregate_period_type", ["daily", "weekly"]);

export const deviceConsents = pgTable(
  "device_consents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: deviceProviderEnum("provider").notNull(),
    grantedScopes: jsonb("granted_scopes")
      .$type<
        ("steps" | "sleep" | "weight" | "workouts" | "recovery_inputs")[]
      >()
      .notNull()
      .default([]),
    allowAiContext: boolean("allow_ai_context").notNull().default(true),
    consentVersion: text("consent_version").notNull().default("v1"),
    grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userProviderIdx: index("device_consents_user_provider_idx").on(
      table.userId,
      table.provider,
    ),
    userRevokedIdx: index("device_consents_user_revoked_idx").on(
      table.userId,
      table.revokedAt,
    ),
  }),
);

export const deviceConnections = pgTable(
  "device_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    consentId: uuid("consent_id")
      .notNull()
      .references(() => deviceConsents.id, { onDelete: "cascade" }),
    provider: deviceProviderEnum("provider").notNull(),
    platform: devicePlatformEnum("platform").notNull(),
    status: deviceConnectionStatusEnum("status").notNull().default("pending"),
    grantedScopes: jsonb("granted_scopes")
      .$type<
        ("steps" | "sleep" | "weight" | "workouts" | "recovery_inputs")[]
      >()
      .notNull()
      .default([]),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastSyncCursor: text("last_sync_cursor"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userProviderUnique: uniqueIndex("device_connections_user_provider_idx").on(
      table.userId,
      table.provider,
    ),
    consentIdx: index("device_connections_consent_idx").on(table.consentId),
    userStatusIdx: index("device_connections_user_status_idx").on(
      table.userId,
      table.status,
    ),
  }),
);

export const healthMetricSnapshots = pgTable(
  "health_metric_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    consentId: uuid("consent_id")
      .notNull()
      .references(() => deviceConsents.id, { onDelete: "cascade" }),
    deviceConnectionId: uuid("device_connection_id").references(() => deviceConnections.id, {
      onDelete: "set null",
    }),
    metricType: healthMetricTypeEnum("metric_type").notNull(),
    provider: deviceProviderEnum("provider").notNull(),
    sourceId: text("source_id"),
    dedupeKey: text("dedupe_key").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    observedEndAt: timestamp("observed_end_at", { withTimezone: true }),
    unit: text("unit").notNull(),
    normalizedPayload: jsonb("normalized_payload")
      .$type<Record<string, unknown>>()
      .notNull(),
    sourceDeviceLabel: text("source_device_label"),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userDedupeUnique: uniqueIndex("health_metric_snapshots_user_dedupe_idx").on(
      table.userId,
      table.dedupeKey,
    ),
    userMetricObservedIdx: index("health_metric_snapshots_user_metric_observed_idx").on(
      table.userId,
      table.metricType,
      table.observedAt,
    ),
    consentIdx: index("health_metric_snapshots_consent_idx").on(table.consentId),
    connectionIdx: index("health_metric_snapshots_connection_idx").on(
      table.deviceConnectionId,
    ),
  }),
);

export const healthMetricAggregates = pgTable(
  "health_metric_aggregates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    consentId: uuid("consent_id")
      .notNull()
      .references(() => deviceConsents.id, { onDelete: "cascade" }),
    metricType: healthMetricTypeEnum("metric_type").notNull(),
    periodType: aggregatePeriodTypeEnum("period_type").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    aggregatePayload: jsonb("aggregate_payload")
      .$type<Record<string, unknown>>()
      .notNull(),
    sourceMetricTypes: jsonb("source_metric_types")
      .$type<("steps" | "sleep" | "weight" | "workout" | "recovery_input")[]>()
      .notNull()
      .default([]),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userMetricPeriodUnique: uniqueIndex("health_metric_aggregates_user_period_idx").on(
      table.userId,
      table.metricType,
      table.periodType,
      table.periodStart,
    ),
    userConsentIdx: index("health_metric_aggregates_user_consent_idx").on(
      table.userId,
      table.consentId,
    ),
  }),
);
