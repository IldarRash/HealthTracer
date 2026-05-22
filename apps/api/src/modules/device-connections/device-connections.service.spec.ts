import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { DeviceConnectionsService } from "./device-connections.service.js";

const auth = {
  clerkUserId: "user_123",
  displayName: "Test User",
  email: "test@example.com",
};

const user = {
  id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
  displayName: "Test User",
  email: "test@example.com",
  timezone: "UTC",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const consentRow = {
  id: "14a08176-64a7-4a2d-8a44-581807368394",
  userId: user.id,
  provider: "apple_healthkit" as const,
  grantedScopes: ["steps"] as const,
  allowAiContext: true,
  consentVersion: "v1",
  grantedAt: new Date("2026-05-22T00:00:00.000Z"),
  revokedAt: null,
  createdAt: new Date("2026-05-22T00:00:00.000Z"),
  updatedAt: new Date("2026-05-22T00:00:00.000Z"),
};

const connectionRow = {
  id: "24b19287-75b8-4a3e-9c10-691908479405",
  userId: user.id,
  consentId: consentRow.id,
  provider: "apple_healthkit" as const,
  platform: "ios" as const,
  status: "connected" as const,
  grantedScopes: ["steps"] as const,
  connectedAt: new Date("2026-05-22T00:00:00.000Z"),
  revokedAt: null,
  lastSyncAt: null,
  lastSyncCursor: null,
  createdAt: new Date("2026-05-22T00:00:00.000Z"),
  updatedAt: new Date("2026-05-22T00:00:00.000Z"),
};

describe("DeviceConnectionsService", () => {
  it("connects a device when consent is active", async () => {
    const findConsentById = vi.fn(async () => consentRow);
    const upsertConnection = vi.fn(async () => connectionRow);
    const service = new DeviceConnectionsService(
      {
        findConsentById,
        upsertConnection,
      } as never,
      {
        resolveFromAuth: async () => user,
      } as never,
    );

    await expect(
      service.connectDevice(auth, {
        consentId: consentRow.id,
        platform: "ios",
      }),
    ).resolves.toMatchObject({
      id: connectionRow.id,
      status: "connected",
    });
    expect(findConsentById).toHaveBeenCalledWith(user.id, consentRow.id);
    expect(upsertConnection).toHaveBeenCalledWith(
      user.id,
      consentRow.id,
      "apple_healthkit",
      ["steps"],
      {
        consentId: consentRow.id,
        platform: "ios",
      },
    );
  });

  it("rejects connecting with another user's consent", async () => {
    const findConsentById = vi.fn(async () => null);
    const upsertConnection = vi.fn();
    const service = new DeviceConnectionsService(
      {
        findConsentById,
        upsertConnection,
      } as never,
      {
        resolveFromAuth: async () => user,
      } as never,
    );

    await expect(
      service.connectDevice(auth, {
        consentId: consentRow.id,
        platform: "ios",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(findConsentById).toHaveBeenCalledWith(user.id, consentRow.id);
    expect(upsertConnection).not.toHaveBeenCalled();
  });

  it("blocks sync when consent is revoked", async () => {
    const service = new DeviceConnectionsService(
      {
        findConnectionById: async () => ({
          ...connectionRow,
          status: "revoked",
          revokedAt: new Date(),
        }),
        findConsentById: async () => consentRow,
      } as never,
      {
        resolveFromAuth: async () => user,
      } as never,
    );

    await expect(
      service.requireActiveConnection(user.id, connectionRow.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws when connection is missing for the user", async () => {
    const service = new DeviceConnectionsService(
      {
        findConnectionById: async () => null,
      } as never,
      {
        resolveFromAuth: async () => user,
      } as never,
    );

    await expect(
      service.requireActiveConnection(user.id, connectionRow.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("revokes the connection and consent for the authenticated user", async () => {
    const revokeConnection = vi.fn(async () => ({
      ...connectionRow,
      status: "revoked" as const,
      revokedAt: new Date("2026-05-22T13:00:00.000Z"),
    }));
    const revokeConsent = vi.fn(async () => ({
      ...consentRow,
      revokedAt: new Date("2026-05-22T13:00:00.000Z"),
    }));
    const service = new DeviceConnectionsService(
      {
        findConnectionById: async () => connectionRow,
        revokeConnection,
        revokeConsent,
      } as never,
      {
        resolveFromAuth: async () => user,
      } as never,
    );

    await expect(service.revokeConnection(auth, connectionRow.id)).resolves.toMatchObject({
      status: "revoked",
      revokedAt: "2026-05-22T13:00:00.000Z",
    });
    expect(revokeConnection).toHaveBeenCalledWith(user.id, connectionRow.id);
    expect(revokeConsent).toHaveBeenCalledWith(user.id, consentRow.id);
  });

  it("rejects metric scopes that were not explicitly granted", () => {
    const service = new DeviceConnectionsService({} as never, {} as never);

    expect(() => service.assertMetricScopeGranted(["steps"], "sleep")).toThrow(
      BadRequestException,
    );
  });
});
