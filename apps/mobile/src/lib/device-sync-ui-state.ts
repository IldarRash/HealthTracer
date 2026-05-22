import type { MetricScope, DeviceProvider } from "@health/types";

export type MobileDeviceProviderOption = {
  provider: DeviceProvider;
  label: string;
  description: string;
  available: boolean;
  unavailableReason?: string;
};

export type MobileDeviceSyncPhase =
  | "provider_selection"
  | "scope_selection"
  | "consent_review"
  | "native_permissions"
  | "connected"
  | "unavailable";

export function getMobileDeviceProviderOptions(
  platform: "ios" | "android" | "web" | "windows" | "macos",
): readonly MobileDeviceProviderOption[] {
  return [
    {
      provider: "apple_healthkit",
      label: "Apple Health",
      description: "Sync steps, sleep, weight, workouts, and recovery inputs from HealthKit.",
      available: platform === "ios",
      unavailableReason:
        platform === "ios" ? undefined : "Apple Health is available on iOS devices only.",
    },
    {
      provider: "android_health_connect",
      label: "Health Connect",
      description: "Sync wellness metrics from Android Health Connect.",
      available: platform === "android",
      unavailableReason:
        platform === "android"
          ? undefined
          : "Health Connect is available on Android devices only.",
    },
  ];
}

export function deriveMobileDeviceSyncPhase(input: {
  selectedProvider: DeviceProvider | null;
  selectedScopes: readonly MetricScope[];
  consentGranted: boolean;
  nativePermissionGranted: boolean;
  connected: boolean;
  platform?: "ios" | "android" | "web" | "windows" | "macos";
}): MobileDeviceSyncPhase {
  const providerOptions = getMobileDeviceProviderOptions(input.platform ?? "web");
  const providerOption = providerOptions.find(
    (option) => option.provider === input.selectedProvider,
  );

  if (input.selectedProvider && providerOption && !providerOption.available) {
    return "unavailable";
  }

  if (input.connected) {
    return "connected";
  }

  if (input.consentGranted && input.selectedProvider) {
    return input.nativePermissionGranted ? "connected" : "native_permissions";
  }

  if (input.selectedProvider && input.selectedScopes.length > 0) {
    return "consent_review";
  }

  if (input.selectedProvider) {
    return "scope_selection";
  }

  return "provider_selection";
}

export function canProceedToMobileConsent(selectedScopes: readonly MetricScope[]): boolean {
  return selectedScopes.length > 0;
}

export function mobileScopeLabel(scope: MetricScope): string {
  switch (scope) {
    case "steps":
      return "Steps";
    case "sleep":
      return "Sleep";
    case "weight":
      return "Weight";
    case "workouts":
      return "Workouts";
    case "recovery_inputs":
      return "Recovery inputs";
  }
}
