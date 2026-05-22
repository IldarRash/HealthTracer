import { deviceConnections, deviceConsents } from "@health/db";
import type { ConnectDeviceInput, DeviceProvider, GrantDeviceConsentInput, MetricScope } from "@health/types";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, isNull } from "drizzle-orm";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";

@Injectable()
export class DeviceConnectionsRepository {
  constructor(@Inject(DATABASE) private readonly db: HealthDatabase) {}

  async createConsent(userId: string, input: GrantDeviceConsentInput) {
    const [consent] = await this.db
      .insert(deviceConsents)
      .values({
        userId,
        provider: input.provider,
        grantedScopes: input.grantedScopes,
        allowAiContext: input.allowAiContext,
        consentVersion: input.consentVersion,
      })
      .returning();

    if (!consent) {
      throw new Error("Failed to create device consent.");
    }

    return consent;
  }

  async findConsentById(userId: string, consentId: string) {
    const [consent] = await this.db
      .select()
      .from(deviceConsents)
      .where(and(eq(deviceConsents.id, consentId), eq(deviceConsents.userId, userId)));

    return consent ?? null;
  }

  async findActiveConsentByProvider(userId: string, provider: GrantDeviceConsentInput["provider"]) {
    const [consent] = await this.db
      .select()
      .from(deviceConsents)
      .where(
        and(
          eq(deviceConsents.userId, userId),
          eq(deviceConsents.provider, provider),
          isNull(deviceConsents.revokedAt),
        ),
      )
      .orderBy(desc(deviceConsents.grantedAt))
      .limit(1);

    return consent ?? null;
  }

  async listConsentsByUserId(userId: string) {
    return this.db
      .select()
      .from(deviceConsents)
      .where(eq(deviceConsents.userId, userId))
      .orderBy(desc(deviceConsents.grantedAt));
  }

  async revokeConsent(userId: string, consentId: string) {
    const now = new Date();
    const [consent] = await this.db
      .update(deviceConsents)
      .set({ revokedAt: now, updatedAt: now })
      .where(and(eq(deviceConsents.id, consentId), eq(deviceConsents.userId, userId)))
      .returning();

    return consent ?? null;
  }

  async upsertConnection(
    userId: string,
    consentId: string,
    provider: DeviceProvider,
    grantedScopes: MetricScope[],
    input: ConnectDeviceInput,
  ) {
    const now = new Date();
    const [connection] = await this.db
      .insert(deviceConnections)
      .values({
        userId,
        consentId,
        provider,
        platform: input.platform,
        status: "connected",
        grantedScopes,
        connectedAt: now,
        lastSyncCursor: input.lastSyncCursor ?? null,
      })
      .onConflictDoUpdate({
        target: [deviceConnections.userId, deviceConnections.provider],
        set: {
          consentId,
          platform: input.platform,
          status: "connected",
          grantedScopes,
          connectedAt: now,
          revokedAt: null,
          lastSyncCursor: input.lastSyncCursor ?? null,
          updatedAt: now,
        },
      })
      .returning();

    if (!connection) {
      throw new Error("Failed to connect device.");
    }

    return connection;
  }

  async updateConnectionScopes(
    userId: string,
    connectionId: string,
    grantedScopes: (typeof deviceConnections.$inferInsert.grantedScopes),
  ) {
    const [connection] = await this.db
      .update(deviceConnections)
      .set({ grantedScopes, updatedAt: new Date() })
      .where(and(eq(deviceConnections.id, connectionId), eq(deviceConnections.userId, userId)))
      .returning();

    return connection ?? null;
  }

  async findConnectionById(userId: string, connectionId: string) {
    const [connection] = await this.db
      .select()
      .from(deviceConnections)
      .where(
        and(eq(deviceConnections.id, connectionId), eq(deviceConnections.userId, userId)),
      );

    return connection ?? null;
  }

  async listConnectionsByUserId(userId: string) {
    return this.db
      .select()
      .from(deviceConnections)
      .where(eq(deviceConnections.userId, userId))
      .orderBy(desc(deviceConnections.createdAt));
  }

  async revokeConnection(userId: string, connectionId: string) {
    const now = new Date();
    const [connection] = await this.db
      .update(deviceConnections)
      .set({
        status: "revoked",
        revokedAt: now,
        updatedAt: now,
      })
      .where(
        and(eq(deviceConnections.id, connectionId), eq(deviceConnections.userId, userId)),
      )
      .returning();

    return connection ?? null;
  }

  async touchLastSync(userId: string, connectionId: string) {
    const now = new Date();
    const [connection] = await this.db
      .update(deviceConnections)
      .set({ lastSyncAt: now, status: "connected", updatedAt: now })
      .where(
        and(eq(deviceConnections.id, connectionId), eq(deviceConnections.userId, userId)),
      )
      .returning();

    return connection ?? null;
  }
}
