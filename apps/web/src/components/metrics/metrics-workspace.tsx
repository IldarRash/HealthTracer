"use client";

import { useAuth } from "@clerk/nextjs";
import type { MetricScope, SyncHealthMetricsInput } from "@health/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  apiQueryKeys,
  connectDevice,
  grantDeviceConsent,
  listDeviceConnections,
  listHealthMetricAggregates,
  listHealthMetricSnapshots,
  previewHealthMetricsAiContext,
  revokeDeviceConnection,
  syncHealthMetrics,
} from "../../lib/api";
import {
  METRIC_SCOPE_OPTIONS,
  buildConsentScopeItems,
  buildGrantedScopeItems,
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
  metricTypeLabel,
  providerLabel,
} from "../../lib/metrics-ui-state";
import {
  Button,
  ConsentScopeList,
  ConsentStatusBadge,
  EmptyState,
  ErrorState,
  LoadingState,
  PrivacyBoundaryNote,
  RevocationState,
} from "../ui";

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function metricsQueryKeysToRefresh(): ReadonlyArray<readonly unknown[]> {
  return [
    apiQueryKeys.deviceConnections,
    apiQueryKeys.healthMetricSnapshots,
    apiQueryKeys.healthMetricAggregates,
    apiQueryKeys.healthMetricsAiPreview,
  ];
}

export function MetricsWorkspace() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [selectedScopes, setSelectedScopes] = useState<MetricScope[]>([]);
  const [allowAiContext, setAllowAiContext] = useState(true);
  const [pendingConsentId, setPendingConsentId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const connectionsQuery = useQuery({
    queryKey: apiQueryKeys.deviceConnections,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await listDeviceConnections(token);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data ?? [];
    },
  });

  const snapshotsQuery = useQuery({
    queryKey: apiQueryKeys.healthMetricSnapshots,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await listHealthMetricSnapshots(token, { limit: 20 });
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data ?? [];
    },
  });

  const aggregatesQuery = useQuery({
    queryKey: apiQueryKeys.healthMetricAggregates,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await listHealthMetricAggregates(token, { limit: 20 });
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data ?? [];
    },
  });

  const aiPreviewQuery = useQuery({
    queryKey: apiQueryKeys.healthMetricsAiPreview,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await previewHealthMetricsAiContext(token);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data ?? { items: [], generatedAt: new Date().toISOString() };
    },
  });

  const grantConsentMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await grantDeviceConsent(token, {
        provider: "wearable",
        grantedScopes: selectedScopes,
        allowAiContext,
        consentVersion: "v1",
      });

      if (result.error) {
        throw new Error(result.error);
      }

      return result.data;
    },
    onSuccess: (consent) => {
      if (!consent) {
        return;
      }

      setPendingConsentId(consent.id);
      setActionError(null);
      setActionMessage("Consent saved. You can connect a dev device connection on web.");
      void queryClient.invalidateQueries({ queryKey: apiQueryKeys.deviceConnections });
    },
    onError: (error) => {
      setActionMessage(null);
      setActionError(error instanceof Error ? error.message : "Consent could not be saved.");
    },
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      if (!pendingConsentId) {
        throw new Error("Grant consent before connecting a device.");
      }

      const result = await connectDevice(token, {
        consentId: pendingConsentId,
        platform: "web",
      });

      if (result.error) {
        throw new Error(result.error);
      }

      return result.data;
    },
    onSuccess: () => {
      setActionError(null);
      setActionMessage("Dev device connection established on web.");
      void queryClient.invalidateQueries({ queryKey: apiQueryKeys.deviceConnections });
    },
    onError: (error) => {
      setActionMessage(null);
      setActionError(error instanceof Error ? error.message : "Device could not be connected.");
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await revokeDeviceConnection(token, connectionId);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data;
    },
    onSuccess: () => {
      setPendingConsentId(null);
      setActionError(null);
      setActionMessage("Device access revoked. Future sync and new AI context use are stopped.");
      for (const key of metricsQueryKeysToRefresh()) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
    onError: (error) => {
      setActionMessage(null);
      setActionError(error instanceof Error ? error.message : "Revocation failed.");
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const connection = findActiveConnection(connectionsQuery.data ?? []);
      if (!connection) {
        throw new Error("Connect a device before syncing metrics.");
      }

      const records = buildSampleSyncRecords(connection.grantedScopes);
      if (records.length === 0) {
        throw new Error("No granted scopes available for sample sync.");
      }

      const result = await syncHealthMetrics(token, {
        deviceConnectionId: connection.id,
        records: records as SyncHealthMetricsInput["records"],
      });

      if (result.error) {
        throw new Error(result.error);
      }

      return result.data;
    },
    onSuccess: (result) => {
      if (!result) {
        return;
      }

      setActionError(null);
      setActionMessage(
        `Sync complete: ${result.inserted.length} inserted, ${result.skipped} skipped, ${result.aggregatesRefreshed} aggregates refreshed.`,
      );
      for (const key of metricsQueryKeysToRefresh()) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
    onError: (error) => {
      setActionMessage(null);
      const message = error instanceof Error ? error.message : "Sync failed.";
      setActionError(
        isScopeMismatchError(message)
          ? `${message} Enable the matching scope in consent before syncing that metric type.`
          : message,
      );
    },
  });

  const connections = connectionsQuery.data ?? [];
  const activeConnection = useMemo(() => findActiveConnection(connections), [connections]);
  const revokedConnection = useMemo(
    () => findLatestRevokedConnection(connections),
    [connections],
  );
  const privacyStatus = derivePrivacyStatus({ connections, pendingConsentId });
  const showConsentFlow =
    privacyStatus === "consent_required" || privacyStatus === "not_connected";
  const showRevokedOnly =
    privacyStatus === "revoked" && !activeConnection && !pendingConsentId;

  if (
    connectionsQuery.isLoading ||
    snapshotsQuery.isLoading ||
    aggregatesQuery.isLoading ||
    aiPreviewQuery.isLoading
  ) {
    return <LoadingState title="Loading device metrics…" />;
  }

  if (connectionsQuery.isError) {
    return (
      <ErrorState
        title="Device connections unavailable"
        description={
          connectionsQuery.error instanceof Error
            ? connectionsQuery.error.message
            : "Connection status could not be loaded."
        }
      />
    );
  }

  const snapshots = snapshotsQuery.data ?? [];
  const aggregates = aggregatesQuery.data ?? [];
  const aiPreview = aiPreviewQuery.data ?? { items: [], generatedAt: new Date().toISOString() };

  return (
    <div className="training-workspace metrics-workspace">
      <div className="training-layout">
        <section className="panel panel-prominent">
          <div className="metrics-header">
            <div>
              <p className="section-label">Device sync</p>
              <h2>Connection status</h2>
              <p className="metrics-intro">
                Web is a developer and support view. Native Apple Health and Health Connect
                connections happen on mobile after consent.
              </p>
            </div>
            <ConsentStatusBadge status={privacyStatus} />
          </div>

          {activeConnection ? (
            <dl className="training-meta metrics-meta">
              <dt>Provider</dt>
              <dd>{providerLabel(activeConnection.provider)}</dd>
              <dt>Status</dt>
              <dd>{activeConnection.status}</dd>
              <dt>Last sync</dt>
              <dd>
                {activeConnection.lastSyncAt
                  ? formatTimestamp(activeConnection.lastSyncAt)
                  : "Not synced yet"}
              </dd>
              <dt>Granted scopes</dt>
              <dd>{activeConnection.grantedScopes.join(", ")}</dd>
            </dl>
          ) : null}

          {actionMessage ? <p className="metrics-action-message">{actionMessage}</p> : null}
          {actionError ? <p className="form-error">{actionError}</p> : null}
        </section>

        {showRevokedOnly && revokedConnection ? (
          <RevocationState
            providerName={providerLabel(revokedConnection.provider)}
            revokedAt={
              revokedConnection.revokedAt
                ? formatTimestamp(revokedConnection.revokedAt)
                : undefined
            }
            action={
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setSelectedScopes([]);
                  setPendingConsentId(null);
                  setActionMessage(null);
                  setActionError(null);
                }}
              >
                Set up again
              </Button>
            }
          />
        ) : null}

        {showConsentFlow ? (
          <section className="panel">
            <p className="section-label">Consent</p>
            <h3>Choose what to collect</h3>
            <p className="metrics-copy">
              Select the wellness signals you want to share. Scopes stay off until you turn
              them on. You can revoke access anytime.
            </p>

            <ul className="metrics-scope-picker">
              {METRIC_SCOPE_OPTIONS.map((option) => {
                const checked = selectedScopes.includes(option.scope);

                return (
                  <li key={option.scope}>
                    <label className="metrics-scope-option">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedScopes((current) =>
                            checked
                              ? current.filter((scope) => scope !== option.scope)
                              : [...current, option.scope],
                          );
                        }}
                      />
                      <span>
                        <strong>{option.label}</strong>
                        <span>{option.description}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>

            <ConsentScopeList scopes={buildConsentScopeItems(selectedScopes)} />

            <label className="metrics-ai-toggle">
              <input
                type="checkbox"
                checked={allowAiContext}
                onChange={(event) => setAllowAiContext(event.target.checked)}
              />
              Allow coach AI to use consented aggregates and safe snapshots
            </label>

            <PrivacyBoundaryNote title="What coach AI receives">
              Coach AI uses normalized summaries with date ranges and freshness timestamps.
              Raw device logs are not sent to the coach by default.
            </PrivacyBoundaryNote>

            <div className="metrics-actions">
              <Button
                type="button"
                disabled={!canGrantConsent(selectedScopes) || grantConsentMutation.isPending}
                onClick={() => grantConsentMutation.mutate()}
              >
                {grantConsentMutation.isPending ? "Saving consent…" : "Grant consent"}
              </Button>

              {canConnectDevice(pendingConsentId) ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={connectMutation.isPending}
                  onClick={() => connectMutation.mutate()}
                >
                  {connectMutation.isPending ? "Connecting…" : "Connect dev device (web)"}
                </Button>
              ) : null}
            </div>
          </section>
        ) : null}

        {activeConnection ? (
          <section className="panel">
            <p className="section-label">Active scopes</p>
            <ConsentScopeList scopes={buildGrantedScopeItems(activeConnection.grantedScopes)} />

            <div className="metrics-actions">
              <Button
                type="button"
                disabled={!canSyncMetrics(activeConnection) || syncMutation.isPending}
                onClick={() => syncMutation.mutate()}
              >
                {syncMutation.isPending ? "Syncing sample data…" : "Run sample sync (dev)"}
              </Button>

              <Button
                type="button"
                variant="secondary"
                disabled={revokeMutation.isPending}
                onClick={() => revokeMutation.mutate(activeConnection.id)}
              >
                {revokeMutation.isPending ? "Revoking…" : "Revoke access"}
              </Button>
            </div>
          </section>
        ) : null}

        <section className="panel">
          <p className="section-label">Snapshots</p>
          <h3>Recent normalized metrics</h3>
          {snapshotsQuery.isError ? (
            <ErrorState
              title="Snapshots unavailable"
              description={
                snapshotsQuery.error instanceof Error
                  ? snapshotsQuery.error.message
                  : "Metric snapshots could not be loaded."
              }
            />
          ) : snapshots.length === 0 ? (
            <EmptyState
              title="No synced metrics yet"
              description={
                activeConnection
                  ? "Run a sample sync or connect a mobile provider to populate normalized snapshots."
                  : "Grant consent and connect a device to start collecting wellness metrics."
              }
            />
          ) : (
            <ul className="metrics-record-list">
              {snapshots.map((snapshot) => (
                <li key={snapshot.id} className="nested-card">
                  <strong>{metricTypeLabel(snapshot.metricType)}</strong>
                  <span>{formatSnapshotSummary(snapshot)}</span>
                  <span className="metrics-record-meta">
                    {formatTimestamp(snapshot.observedAt)} · {snapshot.provider}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <p className="section-label">Aggregates</p>
          <h3>Trend summaries</h3>
          {aggregatesQuery.isError ? (
            <ErrorState
              title="Aggregates unavailable"
              description={
                aggregatesQuery.error instanceof Error
                  ? aggregatesQuery.error.message
                  : "Metric aggregates could not be loaded."
              }
            />
          ) : aggregates.length === 0 ? (
            <EmptyState
              title="No aggregates yet"
              description="Aggregates appear after synced snapshots are processed."
            />
          ) : (
            <ul className="metrics-record-list">
              {aggregates.map((aggregate) => (
                <li key={aggregate.id} className="nested-card">
                  <strong>{metricTypeLabel(aggregate.metricType)}</strong>
                  <span>{formatAggregateSummary(aggregate)}</span>
                  <span className="metrics-record-meta">
                    {aggregate.periodType} · {aggregate.periodStart} to {aggregate.periodEnd}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <p className="section-label">AI context preview</p>
          <h3>Coach-visible metric summaries</h3>
          <PrivacyBoundaryNote>
            This preview shows the structured summaries that may enter coaching context. Raw
            provider logs and high-frequency streams stay excluded by default.
          </PrivacyBoundaryNote>

          {aiPreviewQuery.isError ? (
            <ErrorState
              title="AI preview unavailable"
              description={
                aiPreviewQuery.error instanceof Error
                  ? aiPreviewQuery.error.message
                  : "AI context preview could not be loaded."
              }
            />
          ) : aiPreview.items.length === 0 ? (
            <EmptyState
              title="No AI metric context yet"
              description="Consented aggregates and safe snapshots will appear here after sync."
            />
          ) : (
            <>
              <p className="metrics-record-meta">
                Generated {formatTimestamp(aiPreview.generatedAt)}
              </p>
              <ul className="metrics-record-list">
                {aiPreview.items.map((item) => (
                  <li key={`${item.metricType}-${item.periodStart}`} className="nested-card">
                    <strong>{item.label}</strong>
                    <span>{item.summary}</span>
                    <span className="metrics-record-meta">
                      {item.periodStart} to {item.periodEnd} · refreshed{" "}
                      {formatTimestamp(item.freshness)} · {providerLabel(item.sourceProvider)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
