import { describe, expect, it } from "vitest";
import {
  getMobileDeviceProviderOptions,
  canProceedToMobileConsent,
  deriveMobileDeviceSyncPhase,
  mobileScopeLabel,
} from "./device-sync-ui-state.js";

describe("mobile device sync UI state", () => {
  it("starts at provider selection", () => {
    expect(
      deriveMobileDeviceSyncPhase({
        selectedProvider: null,
        selectedScopes: [],
        consentGranted: false,
        nativePermissionGranted: false,
        connected: false,
      }),
    ).toBe("provider_selection");
  });

  it("requires scopes before consent review", () => {
    expect(
      deriveMobileDeviceSyncPhase({
        selectedProvider: "apple_healthkit",
        selectedScopes: [],
        consentGranted: false,
        nativePermissionGranted: false,
        connected: false,
        platform: "ios",
      }),
    ).toBe("scope_selection");
  });

  it("marks unavailable providers on the wrong platform option", () => {
    const healthConnect = getMobileDeviceProviderOptions("ios").find(
      (option) => option.provider === "android_health_connect",
    );
    expect(healthConnect?.available).toBe(false);
  });

  it("moves through consent review before native permissions", () => {
    expect(
      deriveMobileDeviceSyncPhase({
        selectedProvider: "apple_healthkit",
        selectedScopes: ["steps"],
        consentGranted: false,
        nativePermissionGranted: false,
        connected: false,
        platform: "ios",
      }),
    ).toBe("consent_review");

    expect(
      deriveMobileDeviceSyncPhase({
        selectedProvider: "apple_healthkit",
        selectedScopes: ["steps"],
        consentGranted: true,
        nativePermissionGranted: false,
        connected: false,
        platform: "ios",
      }),
    ).toBe("native_permissions");
  });

  it("keeps unavailable native providers out of permission prompts", () => {
    expect(
      deriveMobileDeviceSyncPhase({
        selectedProvider: "android_health_connect",
        selectedScopes: ["steps"],
        consentGranted: true,
        nativePermissionGranted: false,
        connected: false,
        platform: "ios",
      }),
    ).toBe("unavailable");
  });

  it("blocks consent until at least one scope is selected", () => {
    expect(canProceedToMobileConsent([])).toBe(false);
    expect(canProceedToMobileConsent(["steps"])).toBe(true);
  });

  it("uses wellness and fitness scope labels", () => {
    expect(mobileScopeLabel("workouts")).toBe("Workouts");
    expect(mobileScopeLabel("recovery_inputs")).toBe("Recovery inputs");
  });
});
