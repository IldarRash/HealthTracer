import type { DeviceProvider, ProviderMetricRecord } from "@health/types";

export interface ProviderSyncAdapterPayload {
  deviceConnectionId: string;
  provider: DeviceProvider;
  records: ProviderMetricRecord[];
}

export interface HealthKitSyncBatch extends ProviderSyncAdapterPayload {
  provider: "apple_healthkit";
  platform: "ios";
}

export interface HealthConnectSyncBatch extends ProviderSyncAdapterPayload {
  provider: "android_health_connect";
  platform: "android";
}
