import { z } from "zod";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: "Expected date in YYYY-MM-DD format",
});

const isoDateTimeSchema = z.string().datetime();

export const deviceProviderSchema = z.enum([
  "apple_healthkit",
  "android_health_connect",
  "wearable",
]);

export type DeviceProvider = z.infer<typeof deviceProviderSchema>;

export const devicePlatformSchema = z.enum(["ios", "android", "web"]);

export type DevicePlatform = z.infer<typeof devicePlatformSchema>;

export const deviceConnectionStatusSchema = z.enum([
  "pending",
  "connected",
  "syncing",
  "error",
  "revoked",
]);

export type DeviceConnectionStatus = z.infer<typeof deviceConnectionStatusSchema>;

export const metricScopeSchema = z.enum([
  "steps",
  "sleep",
  "weight",
  "workouts",
  "recovery_inputs",
]);

export type MetricScope = z.infer<typeof metricScopeSchema>;

export const healthMetricTypeSchema = z.enum([
  "steps",
  "sleep",
  "weight",
  "workout",
  "recovery_input",
]);

export type HealthMetricType = z.infer<typeof healthMetricTypeSchema>;

export const aggregatePeriodTypeSchema = z.enum(["daily", "weekly"]);

export type AggregatePeriodType = z.infer<typeof aggregatePeriodTypeSchema>;

export const recoveryInputTypeSchema = z.enum([
  "resting_heart_rate",
  "hrv_summary",
  "readiness_score",
  "soreness",
  "mood",
  "fatigue",
]);

export type RecoveryInputType = z.infer<typeof recoveryInputTypeSchema>;

export const stepsSnapshotPayloadSchema = z
  .object({
    stepCount: z.number().int().nonnegative(),
    intervalStart: isoDateTimeSchema,
    intervalEnd: isoDateTimeSchema,
  })
  .strict();

export type StepsSnapshotPayload = z.infer<typeof stepsSnapshotPayloadSchema>;

export const sleepStageSummarySchema = z.object({
  awakeMinutes: z.number().int().nonnegative().optional(),
  remMinutes: z.number().int().nonnegative().optional(),
  lightMinutes: z.number().int().nonnegative().optional(),
  deepMinutes: z.number().int().nonnegative().optional(),
});

export const sleepNormalizedPayloadSchema = z
  .object({
    durationMinutes: z.number().positive(),
    intervalStart: isoDateTimeSchema,
    intervalEnd: isoDateTimeSchema,
  })
  .strict();

export const sleepSnapshotPayloadSchema = sleepNormalizedPayloadSchema.extend({
  stageSummary: sleepStageSummarySchema.optional(),
});

export type SleepSnapshotPayload = z.infer<typeof sleepSnapshotPayloadSchema>;

export const weightSnapshotPayloadSchema = z
  .object({
    weightKg: z.number().positive().max(500),
  })
  .strict();

export type WeightSnapshotPayload = z.infer<typeof weightSnapshotPayloadSchema>;

export const workoutSnapshotPayloadSchema = z
  .object({
    activityType: z.string().min(1).max(120),
    durationMinutes: z.number().positive(),
    intervalStart: isoDateTimeSchema,
    intervalEnd: isoDateTimeSchema,
    distanceMeters: z.number().nonnegative().optional(),
    energyKcal: z.number().nonnegative().optional(),
  })
  .strict();

export type WorkoutSnapshotPayload = z.infer<typeof workoutSnapshotPayloadSchema>;

export const recoveryInputSnapshotPayloadSchema = z
  .object({
    inputType: recoveryInputTypeSchema,
    value: z.union([z.number(), z.string().min(1).max(120)]),
    unit: z.string().min(1).max(40).optional(),
  })
  .strict();

export type RecoveryInputSnapshotPayload = z.infer<
  typeof recoveryInputSnapshotPayloadSchema
>;

export const healthMetricSnapshotPayloadSchema = z.discriminatedUnion("metricType", [
  z.object({ metricType: z.literal("steps"), payload: stepsSnapshotPayloadSchema }),
  z.object({ metricType: z.literal("sleep"), payload: sleepSnapshotPayloadSchema }),
  z.object({ metricType: z.literal("weight"), payload: weightSnapshotPayloadSchema }),
  z.object({ metricType: z.literal("workout"), payload: workoutSnapshotPayloadSchema }),
  z.object({
    metricType: z.literal("recovery_input"),
    payload: recoveryInputSnapshotPayloadSchema,
  }),
]);

export type HealthMetricSnapshotPayload = z.infer<
  typeof healthMetricSnapshotPayloadSchema
>;

export const dailyStepsAggregatePayloadSchema = z.object({
  totalSteps: z.number().int().nonnegative(),
  sevenDayAverageSteps: z.number().nonnegative().nullable(),
});

export const dailySleepAggregatePayloadSchema = z.object({
  totalDurationMinutes: z.number().nonnegative(),
  sleepWindowStart: isoDateTimeSchema.nullable(),
  sleepWindowEnd: isoDateTimeSchema.nullable(),
  sevenDayAverageMinutes: z.number().nonnegative().nullable(),
});

export const dailyWeightAggregatePayloadSchema = z.object({
  latestWeightKg: z.number().positive().nullable(),
  weeklyTrendKg: z.number().nullable(),
});

export const weeklyWorkoutAggregatePayloadSchema = z.object({
  workoutCount: z.number().int().nonnegative(),
  totalDurationMinutes: z.number().nonnegative(),
  activityMix: z.record(z.string(), z.number().int().nonnegative()),
});

export const recoverySummaryAggregatePayloadSchema = z.object({
  inputs: z.array(
    z.object({
      inputType: recoveryInputTypeSchema,
      latestValue: z.union([z.number(), z.string()]),
      unit: z.string().optional(),
      observedAt: isoDateTimeSchema,
    }),
  ),
});

export const healthMetricAggregatePayloadSchema = z.discriminatedUnion("metricType", [
  z.object({
    metricType: z.literal("steps"),
    payload: dailyStepsAggregatePayloadSchema,
  }),
  z.object({
    metricType: z.literal("sleep"),
    payload: dailySleepAggregatePayloadSchema,
  }),
  z.object({
    metricType: z.literal("weight"),
    payload: dailyWeightAggregatePayloadSchema,
  }),
  z.object({
    metricType: z.literal("workout"),
    payload: weeklyWorkoutAggregatePayloadSchema,
  }),
  z.object({
    metricType: z.literal("recovery_input"),
    payload: recoverySummaryAggregatePayloadSchema,
  }),
]);

export type HealthMetricAggregatePayload = z.infer<
  typeof healthMetricAggregatePayloadSchema
>;

export const aiMetricSummaryItemSchema = z.object({
  metricType: healthMetricTypeSchema,
  label: z.string().min(1).max(160),
  summary: z.string().min(1).max(500),
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  freshness: isoDateTimeSchema,
  sourceProvider: deviceProviderSchema,
});

export type AiMetricSummaryItem = z.infer<typeof aiMetricSummaryItemSchema>;

export const aiMetricsContextSummarySchema = z.object({
  items: z.array(aiMetricSummaryItemSchema).max(20),
  generatedAt: isoDateTimeSchema,
});

export type AiMetricsContextSummary = z.infer<typeof aiMetricsContextSummarySchema>;

export const deviceConsentSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  provider: deviceProviderSchema,
  grantedScopes: z.array(metricScopeSchema).min(1),
  allowAiContext: z.boolean(),
  consentVersion: z.string().min(1).max(40),
  grantedAt: isoDateTimeSchema,
  revokedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type DeviceConsent = z.infer<typeof deviceConsentSchema>;

export const deviceConnectionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  consentId: z.string().uuid(),
  provider: deviceProviderSchema,
  platform: devicePlatformSchema,
  status: deviceConnectionStatusSchema,
  grantedScopes: z.array(metricScopeSchema).min(1),
  connectedAt: isoDateTimeSchema.nullable(),
  revokedAt: isoDateTimeSchema.nullable(),
  lastSyncAt: isoDateTimeSchema.nullable(),
  lastSyncCursor: z.string().max(500).nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type DeviceConnection = z.infer<typeof deviceConnectionSchema>;

export const healthMetricSnapshotSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  consentId: z.string().uuid(),
  deviceConnectionId: z.string().uuid().nullable(),
  metricType: healthMetricTypeSchema,
  provider: deviceProviderSchema,
  sourceId: z.string().max(200).nullable(),
  dedupeKey: z.string().min(1).max(300),
  observedAt: isoDateTimeSchema,
  observedEndAt: isoDateTimeSchema.nullable(),
  unit: z.string().min(1).max(40),
  normalizedPayload: z.record(z.string(), z.unknown()),
  sourceDeviceLabel: z.string().max(120).nullable(),
  ingestedAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
});

export type HealthMetricSnapshot = z.infer<typeof healthMetricSnapshotSchema>;

export const healthMetricAggregateSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  consentId: z.string().uuid(),
  metricType: healthMetricTypeSchema,
  periodType: aggregatePeriodTypeSchema,
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  aggregatePayload: z.record(z.string(), z.unknown()),
  sourceMetricTypes: z.array(healthMetricTypeSchema),
  calculatedAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type HealthMetricAggregate = z.infer<typeof healthMetricAggregateSchema>;

export const grantDeviceConsentSchema = z.object({
  provider: deviceProviderSchema,
  grantedScopes: z.array(metricScopeSchema).min(1).max(5),
  allowAiContext: z.boolean().default(true),
  consentVersion: z.string().min(1).max(40).default("v1"),
});

export type GrantDeviceConsentInput = z.infer<typeof grantDeviceConsentSchema>;

export const connectDeviceSchema = z.object({
  consentId: z.string().uuid(),
  platform: devicePlatformSchema,
  lastSyncCursor: z.string().max(500).optional(),
});

export type ConnectDeviceInput = z.infer<typeof connectDeviceSchema>;

const providerMetricRecordBaseSchema = {
  sourceId: z.string().max(200).optional(),
  observedAt: isoDateTimeSchema,
  observedEndAt: isoDateTimeSchema.optional(),
  unit: z.string().min(1).max(40),
  sourceDeviceLabel: z.string().max(120).optional(),
};

export const providerMetricRecordSchema = z.discriminatedUnion("metricType", [
  z
    .object({
      ...providerMetricRecordBaseSchema,
      metricType: z.literal("steps"),
      normalizedPayload: stepsSnapshotPayloadSchema,
    })
    .strict(),
  z
    .object({
      ...providerMetricRecordBaseSchema,
      metricType: z.literal("sleep"),
      normalizedPayload: sleepNormalizedPayloadSchema,
    })
    .strict(),
  z
    .object({
      ...providerMetricRecordBaseSchema,
      metricType: z.literal("weight"),
      normalizedPayload: weightSnapshotPayloadSchema,
    })
    .strict(),
  z
    .object({
      ...providerMetricRecordBaseSchema,
      metricType: z.literal("workout"),
      normalizedPayload: workoutSnapshotPayloadSchema,
    })
    .strict(),
  z
    .object({
      ...providerMetricRecordBaseSchema,
      metricType: z.literal("recovery_input"),
      normalizedPayload: recoveryInputSnapshotPayloadSchema,
    })
    .strict(),
]);

const normalizedPayloadSchemaByMetricType = {
  steps: stepsSnapshotPayloadSchema,
  sleep: sleepNormalizedPayloadSchema,
  weight: weightSnapshotPayloadSchema,
  workout: workoutSnapshotPayloadSchema,
  recovery_input: recoveryInputSnapshotPayloadSchema,
} as const;

export function parseNormalizedMetricPayload(
  metricType: HealthMetricType,
  payload: unknown,
): Record<string, unknown> {
  const schema = normalizedPayloadSchemaByMetricType[metricType];
  return schema.parse(payload) as Record<string, unknown>;
}

export type ProviderMetricRecord = z.infer<typeof providerMetricRecordSchema>;

export const syncHealthMetricsSchema = z.object({
  deviceConnectionId: z.string().uuid(),
  records: z.array(providerMetricRecordSchema).min(1).max(100),
});

export type SyncHealthMetricsInput = z.infer<typeof syncHealthMetricsSchema>;

export const listHealthMetricSnapshotsQuerySchema = z.object({
  metricType: healthMetricTypeSchema.optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export type ListHealthMetricSnapshotsQuery = z.infer<
  typeof listHealthMetricSnapshotsQuerySchema
>;

export const listHealthMetricAggregatesQuerySchema = z.object({
  metricType: healthMetricTypeSchema.optional(),
  periodType: aggregatePeriodTypeSchema.optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export type ListHealthMetricAggregatesQuery = z.infer<
  typeof listHealthMetricAggregatesQuerySchema
>;

export const METRIC_SCOPE_TO_TYPE: Record<MetricScope, HealthMetricType> = {
  steps: "steps",
  sleep: "sleep",
  weight: "weight",
  workouts: "workout",
  recovery_inputs: "recovery_input",
};

export function metricTypeToScope(metricType: HealthMetricType): MetricScope {
  switch (metricType) {
    case "steps":
      return "steps";
    case "sleep":
      return "sleep";
    case "weight":
      return "weight";
    case "workout":
      return "workouts";
    case "recovery_input":
      return "recovery_inputs";
  }
}
