import { deviceConnections, deviceConsents } from "@health/db";
import type { DeviceConnection, DeviceConsent } from "@health/types";

type DeviceConsentRow = typeof deviceConsents.$inferSelect;
type DeviceConnectionRow = typeof deviceConnections.$inferSelect;

export function toDeviceConsent(row: DeviceConsentRow): DeviceConsent {
  return {
    id: row.id,
    userId: row.userId,
    provider: row.provider,
    grantedScopes: row.grantedScopes,
    allowAiContext: row.allowAiContext,
    consentVersion: row.consentVersion,
    grantedAt: row.grantedAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toDeviceConnection(row: DeviceConnectionRow): DeviceConnection {
  return {
    id: row.id,
    userId: row.userId,
    consentId: row.consentId,
    provider: row.provider,
    platform: row.platform,
    status: row.status,
    grantedScopes: row.grantedScopes,
    connectedAt: row.connectedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastSyncCursor: row.lastSyncCursor,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function isConsentActive(consent: DeviceConsentRow | DeviceConsent): boolean {
  return consent.revokedAt == null;
}

export function isConnectionActive(connection: DeviceConnectionRow | DeviceConnection): boolean {
  return connection.status !== "revoked" && connection.revokedAt == null;
}
