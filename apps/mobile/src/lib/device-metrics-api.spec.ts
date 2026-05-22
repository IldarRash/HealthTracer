import { afterEach, describe, expect, it, vi } from "vitest";
import {
  connectDevice,
  grantDeviceConsent,
  listDeviceConnections,
} from "./device-metrics-api.js";

const token = "test-token";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mobile device metrics API helpers", () => {
  it("rejects consent grants without selected scopes before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      grantDeviceConsent(token, {
        provider: "apple_healthkit",
        grantedScopes: [],
        allowAiContext: true,
        consentVersion: "v1",
      }),
    ).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the consent id before native device connection", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "55555555-5555-4555-8555-555555555555",
          userId: "22222222-2222-4222-8222-222222222222",
          consentId: "33333333-3333-4333-8333-333333333333",
          provider: "apple_healthkit",
          platform: "ios",
          status: "connected",
          grantedScopes: ["steps"],
          connectedAt: "2026-05-22T12:00:00.000Z",
          revokedAt: null,
          lastSyncAt: null,
          lastSyncCursor: null,
          createdAt: "2026-05-22T12:00:00.000Z",
          updatedAt: "2026-05-22T12:00:00.000Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await connectDevice(token, {
      consentId: "33333333-3333-4333-8333-333333333333",
      platform: "ios",
    });

    expect(result.error).toBeUndefined();
    expect(result.data?.status).toBe("connected");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/device-connections"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          consentId: "33333333-3333-4333-8333-333333333333",
          platform: "ios",
        }),
      }),
    );
  });

  it("surfaces revocation or scope errors from device connection reads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ message: "Device connection is not active." }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const result = await listDeviceConnections(token);

    expect(result.data).toBeUndefined();
    expect(result.error).toBe("Device connection is not active.");
  });
});
