import { describe, expect, it } from "vitest";
import type { DeviceConnection, HealthMetricAggregate, HealthMetricSnapshot, MetricScope } from "@health/types";
import {
  METRIC_SCOPE_OPTIONS,
  buildGrantedScopeItems,
  buildConsentScopeItems,
  buildSampleSyncRecords,
  canConnectDevice,
  canGrantConsent,
  canSyncMetrics,
  derivePrivacyStatus,
  findActiveConnection,
  findLatestRevokedConnection,
  formatAggregateSummary,
  formatSnapshotSummary,
  isScopeMismatchError,
} from "./metrics-ui-state.js";

const baseConnection = {
  userId: "22222222-2222-4222-8222-222222222222",
  consentId: "33333333-3333-4333-8333-333333333333",
  provider: "wearable" as const,
  platform: "web" as const,
  grantedScopes: ["steps", "weight"] as MetricScope[],
  connectedAt: "2026-05-22T12:00:00.000Z",
  revokedAt: null,
  lastSyncAt: null,
  lastSyncCursor: null,
  createdAt: "2026-05-22T12:00:00.000Z",
  updatedAt: "2026-05-22T12:00:00.000Z",
};

describe("metrics UI state", () => {
  it("requires at least one scope before consent can be granted", () => {
    expect(canGrantConsent([])).toBe(false);
    expect(canGrantConsent(["steps"])).toBe(true);
  });

  it("derives consent-required when no connection or pending consent exists", () => {
    expect(derivePrivacyStatus({ connections: [], pendingConsentId: null })).toBe(
      "consent_required",
    );
  });

  it("derives not-connected after consent is granted but before connect", () => {
    expect(
      derivePrivacyStatus({
        connections: [],
        pendingConsentId: "44444444-4444-4444-8444-444444444444",
      }),
    ).toBe("not_connected");
  });

  it("finds active connections and formats snapshot summaries", () => {
    const connections: DeviceConnection[] = [
      {
        ...baseConnection,
        id: "55555555-5555-4555-8555-555555555555",
        status: "connected",
      },
    ];

    expect(findActiveConnection(connections)?.status).toBe("connected");
    expect(derivePrivacyStatus({ connections, pendingConsentId: null })).toBe("active");

    const snapshot = {
      id: "66666666-6666-4666-8666-666666666666",
      userId: baseConnection.userId,
      consentId: baseConnection.consentId,
      deviceConnectionId: connections[0]?.id ?? null,
      metricType: "steps",
      provider: "wearable",
      sourceId: "sample",
      dedupeKey: "steps-1",
      observedAt: "2026-05-22T12:00:00.000Z",
      observedEndAt: "2026-05-22T13:00:00.000Z",
      unit: "count",
      normalizedPayload: { stepCount: 4200 },
      sourceDeviceLabel: null,
      ingestedAt: "2026-05-22T12:00:00.000Z",
      createdAt: "2026-05-22T12:00:00.000Z",
    } satisfies HealthMetricSnapshot;

    expect(formatSnapshotSummary(snapshot)).toMatch(/4[\s,]?200 steps/);
  });

  it("builds scope items with selected scopes enabled only", () => {
    const items = buildConsentScopeItems(["sleep"]);
    expect(items.find((item) => item.id === "sleep")?.enabled).toBe(true);
    expect(items.find((item) => item.id === "steps")?.enabled).toBe(false);
    expect(METRIC_SCOPE_OPTIONS.length).toBe(5);
  });

  it("shows revoked privacy status when every connection has been revoked", () => {
    const connections: DeviceConnection[] = [
      {
        ...baseConnection,
        id: "55555555-5555-4555-8555-555555555555",
        status: "revoked",
        revokedAt: "2026-05-22T14:00:00.000Z",
        updatedAt: "2026-05-22T14:00:00.000Z",
      },
      {
        ...baseConnection,
        id: "66666666-6666-4666-8666-666666666666",
        status: "revoked",
        revokedAt: "2026-05-21T14:00:00.000Z",
        updatedAt: "2026-05-21T14:00:00.000Z",
      },
    ];

    expect(derivePrivacyStatus({ connections, pendingConsentId: null })).toBe("revoked");
    expect(findLatestRevokedConnection(connections)?.id).toBe(
      "55555555-5555-4555-8555-555555555555",
    );
    expect(canSyncMetrics(findActiveConnection(connections))).toBe(false);
  });

  it("keeps consent, connection, and sync actions gated by state", () => {
    expect(canConnectDevice(null)).toBe(false);
    expect(canConnectDevice("44444444-4444-4444-8444-444444444444")).toBe(true);
    expect(canSyncMetrics(null)).toBe(false);
    expect(
      canSyncMetrics({
        ...baseConnection,
        id: "55555555-5555-4555-8555-555555555555",
        status: "connected",
      }),
    ).toBe(true);
  });

  it("renders only explicitly granted scopes in the AI context preview copy", () => {
    const items = buildGrantedScopeItems(["steps", "recovery_inputs"]);

    expect(items.map((item) => item.id)).toEqual(["steps", "recovery_inputs"]);
    expect(items.every((item) => item.enabled)).toBe(true);
    expect(items.map((item) => item.description).join(" ").toLowerCase()).toContain(
      "wellness",
    );
  });

  it("builds sample sync records only for granted scopes", () => {
    const records = buildSampleSyncRecords(["steps"], new Date("2026-05-22T12:00:00.000Z"));
    expect(records).toHaveLength(1);
    expect(records[0]?.metricType).toBe("steps");
    expect(records).not.toContainEqual(
      expect.objectContaining({
        metricType: "sleep",
      }),
    );
  });

  it("formats aggregate summaries without medical language", () => {
    const aggregate = {
      id: "77777777-7777-4777-8777-777777777777",
      userId: baseConnection.userId,
      consentId: baseConnection.consentId,
      metricType: "sleep",
      periodType: "daily",
      periodStart: "2026-05-21",
      periodEnd: "2026-05-21",
      aggregatePayload: { totalDurationMinutes: 420 },
      sourceMetricTypes: ["sleep"],
      calculatedAt: "2026-05-22T12:00:00.000Z",
      createdAt: "2026-05-22T12:00:00.000Z",
      updatedAt: "2026-05-22T12:00:00.000Z",
    } satisfies HealthMetricAggregate;

    const summary = formatAggregateSummary(aggregate);
    expect(summary).toContain("420 min");
    expect(summary.toLowerCase()).not.toContain("diagnos");
  });

  it("detects scope mismatch API errors", () => {
    expect(
      isScopeMismatchError('Metric scope "sleep" is not included in granted consent scopes.'),
    ).toBe(true);
    expect(isScopeMismatchError("Device connection is not active.")).toBe(false);
  });
});
