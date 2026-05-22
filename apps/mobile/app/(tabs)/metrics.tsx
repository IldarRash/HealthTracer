import { useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import type { DeviceProvider, MetricScope } from "@health/types";
import { styles } from "../../src/styles";
import {
  getMobileDeviceProviderOptions,
  canProceedToMobileConsent,
  deriveMobileDeviceSyncPhase,
  mobileScopeLabel,
} from "../../src/lib/device-sync-ui-state";

const ALL_SCOPES: MetricScope[] = [
  "steps",
  "sleep",
  "weight",
  "workouts",
  "recovery_inputs",
];

export default function MetricsScreen() {
  const [selectedProvider, setSelectedProvider] = useState<DeviceProvider | null>(null);
  const [selectedScopes, setSelectedScopes] = useState<MetricScope[]>([]);
  const [consentGranted, setConsentGranted] = useState(false);
  const [nativePermissionGranted, setNativePermissionGranted] = useState(false);
  const [connected, setConnected] = useState(false);

  const phase = deriveMobileDeviceSyncPhase({
    selectedProvider,
    selectedScopes,
    consentGranted,
    nativePermissionGranted,
    connected,
    platform: Platform.OS,
  });

  const providerOptions = getMobileDeviceProviderOptions(Platform.OS);

  function toggleScope(scope: MetricScope) {
    setSelectedScopes((current) =>
      current.includes(scope)
        ? current.filter((entry) => entry !== scope)
        : [...current, scope],
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.screenScroll}>
      <Text style={styles.eyebrow}>Device sync</Text>
      <Text style={styles.title}>Connect wellness data</Text>
      <Text style={styles.body}>
        Choose a provider, select scopes, review consent, then grant native permissions.
        Native HealthKit and Health Connect adapters are scaffolded here without live sync yet.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>1. Provider</Text>
        {providerOptions.map((option) => (
          <Pressable
            key={option.provider}
            style={[
              styles.choiceRow,
              selectedProvider === option.provider && styles.choiceRowSelected,
              !option.available && styles.choiceRowDisabled,
            ]}
            disabled={!option.available}
            onPress={() => {
              setSelectedProvider(option.provider);
              setSelectedScopes([]);
              setConsentGranted(false);
              setNativePermissionGranted(false);
              setConnected(false);
            }}
          >
            <Text style={styles.choiceTitle}>{option.label}</Text>
            <Text style={styles.choiceBody}>{option.description}</Text>
            {!option.available && option.unavailableReason ? (
              <Text style={styles.choiceMeta}>{option.unavailableReason}</Text>
            ) : null}
          </Pressable>
        ))}
      </View>

      {phase === "unavailable" ? (
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>Provider unavailable on this device</Text>
          <Text style={styles.noticeBody}>
            Use an {Platform.OS === "ios" ? "Android" : "iOS"} device for this provider, or pick
            the provider supported on your current platform.
          </Text>
        </View>
      ) : null}

      {selectedProvider && phase !== "unavailable" ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>2. Scopes</Text>
          <Text style={styles.choiceBody}>
            Scopes stay off until selected. Only enabled scopes are requested at permission time.
          </Text>
          {ALL_SCOPES.map((scope) => {
            const enabled = selectedScopes.includes(scope);
            return (
              <Pressable
                key={scope}
                style={[styles.choiceRow, enabled && styles.choiceRowSelected]}
                onPress={() => toggleScope(scope)}
              >
                <Text style={styles.choiceTitle}>{mobileScopeLabel(scope)}</Text>
                <Text style={styles.choiceMeta}>{enabled ? "Selected" : "Off"}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {phase === "consent_review" || phase === "native_permissions" || phase === "connected" ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>3. App consent</Text>
          <Text style={styles.choiceBody}>
            We store normalized wellness metrics you choose. Coach AI may use consented aggregates
            and safe snapshots. Raw device logs stay out of default AI context.
          </Text>
          {!consentGranted ? (
            <Pressable
              style={styles.primaryButton}
              disabled={!canProceedToMobileConsent(selectedScopes)}
              onPress={() => setConsentGranted(true)}
            >
              <Text style={styles.primaryButtonText}>I understand and grant consent</Text>
            </Pressable>
          ) : (
            <Text style={styles.choiceMeta}>Consent recorded locally for this scaffold.</Text>
          )}
        </View>
      ) : null}

      {consentGranted && phase !== "connected" ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>4. Native permissions</Text>
          <Text style={styles.choiceBody}>
            HealthKit / Health Connect permission prompts will run here once native adapters are
            wired. This scaffold does not call platform health APIs yet.
          </Text>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => setNativePermissionGranted(true)}
          >
            <Text style={styles.secondaryButtonText}>Simulate native permission granted</Text>
          </Pressable>
        </View>
      ) : null}

      {nativePermissionGranted && consentGranted ? (
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>Ready for connection scaffold</Text>
          <Text style={styles.noticeBody}>
            Next step: call grantDeviceConsent/connectDevice from the mobile API client, then attach
            a foreground sync adapter for {selectedProvider ?? "your provider"}.
          </Text>
          <Pressable style={styles.primaryButton} onPress={() => setConnected(true)}>
            <Text style={styles.primaryButtonText}>Mark connected (scaffold)</Text>
          </Pressable>
        </View>
      ) : null}

      {connected ? (
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>Connected (scaffold)</Text>
          <Text style={styles.noticeBody}>
            Sync status and lastSyncAt will display here after native provider adapters post
            normalized records to /health-metrics/sync.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
