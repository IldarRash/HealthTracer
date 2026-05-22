import type {
  DeviceConnection,
  DeviceProvider,
  HealthMetricAggregate,
  HealthMetricSnapshot,
  HealthMetricType,
  MetricScope,
} from "@health/types";
import type { PrivacyStatus } from "@health/ui";

export type MetricConsentScopeItem = {
  id: string;
  label: string;
  description?: string;
  enabled?: boolean;
  required?: boolean;
};

export type MetricScopeOption = {
  scope: MetricScope;
  label: string;
  description: string;
};

export const METRIC_SCOPE_OPTIONS: readonly MetricScopeOption[] = [
  {
    scope: "steps",
    label: "Steps",
    description: "Daily movement totals to track activity trends.",
  },
  {
    scope: "sleep",
    label: "Sleep",
    description: "Sleep duration windows for recovery-aware coaching.",
  },
  {
    scope: "weight",
    label: "Weight",
    description: "Body mass readings to follow long-term progress.",
  },
  {
    scope: "workouts",
    label: "Workouts",
    description: "Exercise sessions to align training with your plan.",
  },
  {
    scope: "recovery_inputs",
    label: "Recovery inputs",
    description: "Wellness signals such as resting heart rate or readiness.",
  },
] as const;

export function providerLabel(provider: DeviceProvider): string {
  switch (provider) {
    case "apple_healthkit":
      return "Apple Health";
    case "android_health_connect":
      return "Health Connect";
    case "wearable":
      return "Wearable";
  }
}

export function metricTypeLabel(metricType: HealthMetricType): string {
  switch (metricType) {
    case "steps":
      return "Steps";
    case "sleep":
      return "Sleep";
    case "weight":
      return "Weight";
    case "workout":
      return "Workout";
    case "recovery_input":
      return "Recovery input";
  }
}

export function findActiveConnection(
  connections: readonly DeviceConnection[],
): DeviceConnection | null {
  return (
    connections.find(
      (connection) =>
        connection.status === "connected" || connection.status === "syncing",
    ) ?? null
  );
}

export function findLatestRevokedConnection(
  connections: readonly DeviceConnection[],
): DeviceConnection | null {
  const revoked = connections.filter((connection) => connection.status === "revoked");
  if (revoked.length === 0) {
    return null;
  }

  return [...revoked].sort((left, right) =>
    (right.revokedAt ?? right.updatedAt).localeCompare(
      left.revokedAt ?? left.updatedAt,
    ),
  )[0] ?? null;
}

export function derivePrivacyStatus(input: {
  connections: readonly DeviceConnection[];
  pendingConsentId: string | null;
}): PrivacyStatus {
  const active = findActiveConnection(input.connections);
  if (active) {
    return active.status === "syncing" ? "active" : "active";
  }

  const latestRevoked = findLatestRevokedConnection(input.connections);
  if (latestRevoked && input.connections.every((c) => c.status === "revoked")) {
    return "revoked";
  }

  if (input.pendingConsentId) {
    return "not_connected";
  }

  if (input.connections.some((connection) => connection.status === "pending")) {
    return "not_connected";
  }

  return "consent_required";
}

export function canGrantConsent(selectedScopes: readonly MetricScope[]): boolean {
  return selectedScopes.length > 0;
}

export function canConnectDevice(pendingConsentId: string | null): boolean {
  return pendingConsentId !== null;
}

export function canSyncMetrics(connection: DeviceConnection | null): boolean {
  return connection !== null && (connection.status === "connected" || connection.status === "syncing");
}

export function buildConsentScopeItems(
  selectedScopes: readonly MetricScope[],
): MetricConsentScopeItem[] {
  return METRIC_SCOPE_OPTIONS.map((option) => ({
    id: option.scope,
    label: option.label,
    description: option.description,
    enabled: selectedScopes.includes(option.scope),
  }));
}

export function buildGrantedScopeItems(
  grantedScopes: readonly MetricScope[],
): MetricConsentScopeItem[] {
  return METRIC_SCOPE_OPTIONS.filter((option) =>
    grantedScopes.includes(option.scope),
  ).map((option) => ({
    id: option.scope,
    label: option.label,
    description: option.description,
    enabled: true,
  }));
}

export function formatSnapshotSummary(snapshot: HealthMetricSnapshot): string {
  const payload = snapshot.normalizedPayload;

  switch (snapshot.metricType) {
    case "steps": {
      const count = payload.stepCount;
      return typeof count === "number" ? `${count.toLocaleString()} steps` : "Steps snapshot";
    }
    case "sleep": {
      const minutes = payload.durationMinutes;
      return typeof minutes === "number"
        ? `${Math.round(minutes)} min sleep`
        : "Sleep snapshot";
    }
    case "weight": {
      const weight = payload.weightKg;
      return typeof weight === "number" ? `${weight} kg` : "Weight snapshot";
    }
    case "workout": {
      const activity = payload.activityType;
      const duration = payload.durationMinutes;
      if (typeof activity === "string" && typeof duration === "number") {
        return `${activity} · ${Math.round(duration)} min`;
      }
      return "Workout snapshot";
    }
    case "recovery_input": {
      const inputType = payload.inputType;
      const value = payload.value;
      if (typeof inputType === "string" && value !== undefined) {
        return `${inputType.replaceAll("_", " ")}: ${String(value)}`;
      }
      return "Recovery input snapshot";
    }
  }
}

export function formatAggregateSummary(aggregate: HealthMetricAggregate): string {
  const payload = aggregate.aggregatePayload;

  switch (aggregate.metricType) {
    case "steps": {
      const total = payload.totalSteps;
      const average = payload.sevenDayAverageSteps;
      const totalLabel = typeof total === "number" ? `${total.toLocaleString()} steps` : "Steps total";
      if (typeof average === "number") {
        return `${totalLabel} · 7-day avg ${Math.round(average).toLocaleString()}`;
      }
      return totalLabel;
    }
    case "sleep": {
      const minutes = payload.totalDurationMinutes;
      return typeof minutes === "number"
        ? `${Math.round(minutes)} min total sleep`
        : "Sleep aggregate";
    }
    case "weight": {
      const latest = payload.latestWeightKg;
      return typeof latest === "number" ? `Latest ${latest} kg` : "Weight aggregate";
    }
    case "workout": {
      const count = payload.workoutCount;
      const duration = payload.totalDurationMinutes;
      if (typeof count === "number" && typeof duration === "number") {
        return `${count} workouts · ${Math.round(duration)} min total`;
      }
      return "Workout aggregate";
    }
    case "recovery_input": {
      const inputs = payload.inputs;
      if (Array.isArray(inputs)) {
        return `${inputs.length} recovery input${inputs.length === 1 ? "" : "s"}`;
      }
      return "Recovery summary";
    }
  }
}

export function buildSampleSyncRecords(
  grantedScopes: readonly MetricScope[],
  now = new Date(),
): Array<{
  metricType: HealthMetricType;
  observedAt: string;
  observedEndAt?: string;
  unit: string;
  normalizedPayload: Record<string, unknown>;
  sourceId?: string;
}> {
  const iso = now.toISOString();
  const endIso = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const records: Array<{
    metricType: HealthMetricType;
    observedAt: string;
    observedEndAt?: string;
    unit: string;
    normalizedPayload: Record<string, unknown>;
    sourceId?: string;
  }> = [];

  if (grantedScopes.includes("steps")) {
    records.push({
      metricType: "steps",
      observedAt: iso,
      observedEndAt: endIso,
      unit: "count",
      sourceId: `sample-steps-${iso}`,
      normalizedPayload: {
        stepCount: 8420,
        intervalStart: iso,
        intervalEnd: endIso,
      },
    });
  }

  if (grantedScopes.includes("weight")) {
    records.push({
      metricType: "weight",
      observedAt: iso,
      unit: "kg",
      sourceId: `sample-weight-${iso}`,
      normalizedPayload: { weightKg: 72.4 },
    });
  }

  return records;
}

export function isScopeMismatchError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("metric scope") && normalized.includes("not included");
}
