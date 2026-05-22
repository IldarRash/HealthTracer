import { useAuth } from "@clerk/clerk-expo";
import type { NutritionAdherenceState } from "@health/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  getActiveNutritionPlan,
  getTodayNutritionAdherence,
  mobileQueryKeys,
  upsertTodayNutritionAdherence,
} from "../../src/lib/api";
import {
  buildAdherenceState,
  formatHydrationProgress,
  formatLocalIsoDate,
  formatTargetCompletionLabel,
  hasActiveNutritionPlan,
  parseHydrationInput,
  summarizeNutritionTargets,
  targetCompletionKeysForPayload,
  targetCompletionLabel,
  toggleMealCompletion,
  toggleTargetCompletion,
} from "../../src/lib/nutrition-ui-state";
import { styles } from "../../src/styles";
import { mobileEnv } from "../../src/env";

function EmptyNutritionState() {
  return (
    <View style={styles.centerContent}>
      <Text style={styles.eyebrow}>Nutrition</Text>
      <Text style={styles.title}>No active plan yet</Text>
      <Text style={styles.body}>
        Accept a nutrition proposal in Chat on web to create your first revision, then return
        here to follow daily targets.
      </Text>
    </View>
  );
}

function AuthRequiredState() {
  return (
    <View style={styles.centerContent}>
      <Text style={styles.eyebrow}>Nutrition</Text>
      <Text style={styles.title}>Sign in required</Text>
      <Text style={styles.body}>
        Configure Clerk for mobile and sign in to load your structured nutrition plan and log
        daily adherence.
      </Text>
    </View>
  );
}

function ChipList({ values, emptyLabel }: { values: readonly string[]; emptyLabel: string }) {
  if (values.length === 0) {
    return <Text style={styles.meta}>{emptyLabel}</Text>;
  }

  return (
    <View style={styles.chipWrap}>
      {values.map((value) => (
        <Text key={value} style={styles.chip}>
          {value}
        </Text>
      ))}
    </View>
  );
}

export default function NutritionScreen() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const today = useMemo(() => formatLocalIsoDate(new Date()), []);
  const [hydrationDraft, setHydrationDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");

  const activePlanQuery = useQuery({
    queryKey: mobileQueryKeys.nutritionActive,
    enabled: isLoaded && isSignedIn,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await getActiveNutritionPlan(token);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data ?? { plan: null, activeRevision: null };
    },
  });

  const adherenceQuery = useQuery({
    queryKey: mobileQueryKeys.nutritionAdherenceToday,
    enabled:
      isLoaded &&
      isSignedIn &&
      Boolean(activePlanQuery.data && hasActiveNutritionPlan(activePlanQuery.data)),
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await getTodayNutritionAdherence(token);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data ?? { adherence: null };
    },
  });

  const adherenceMutation = useMutation({
    mutationFn: async (input: {
      hydrationLitersConsumed?: number | null;
      mealCompletion?: NutritionAdherenceState["mealCompletion"];
      targetCompletion?: NutritionAdherenceState["targetCompletion"];
      notes?: string[];
    }) => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await upsertTodayNutritionAdherence(token, input);
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Nutrition adherence could not be saved.");
      }

      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mobileQueryKeys.nutritionAdherenceToday });
    },
  });

  if (!mobileEnv.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <AuthRequiredState />;
  }

  if (!isLoaded) {
    return (
      <View style={styles.centerContent}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.meta}>Loading session…</Text>
      </View>
    );
  }

  if (!isSignedIn) {
    return <AuthRequiredState />;
  }

  if (activePlanQuery.isLoading) {
    return (
      <View style={styles.centerContent}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.meta}>Loading nutrition plan…</Text>
      </View>
    );
  }

  if (activePlanQuery.isError) {
    return (
      <View style={styles.centerContent}>
        <Text style={styles.title}>Nutrition unavailable</Text>
        <Text style={styles.body}>
          {activePlanQuery.error instanceof Error
            ? activePlanQuery.error.message
            : "Your nutrition plan could not be loaded."}
        </Text>
      </View>
    );
  }

  const activeData = activePlanQuery.data;
  if (!activeData || !hasActiveNutritionPlan(activeData)) {
    return <EmptyNutritionState />;
  }

  const payload = activeData.activeRevision!.payload;
  const adherenceRecord = adherenceQuery.data?.adherence ?? null;
  const adherenceDate = adherenceRecord?.date ?? today;
  const adherenceState = buildAdherenceState({
    date: adherenceDate,
    payload,
    record: adherenceRecord,
  });
  const targetKeys = targetCompletionKeysForPayload(payload);
  const targets = summarizeNutritionTargets(payload);

  const saveAdherence = (next: Partial<NutritionAdherenceState>) => {
    adherenceMutation.mutate({
      hydrationLitersConsumed:
        next.hydrationLitersConsumed ?? adherenceState.hydrationLitersConsumed,
      mealCompletion: next.mealCompletion ?? adherenceState.mealCompletion,
      targetCompletion: next.targetCompletion ?? adherenceState.targetCompletion,
      notes: next.notes ?? adherenceState.notes,
    });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <Text style={styles.eyebrow}>Nutrition</Text>
      <Text style={styles.title}>{payload.title}</Text>
      <Text style={styles.subtitle}>{payload.summary}</Text>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Daily targets</Text>
        <View style={styles.targetGrid}>
          {targets.map((target) => (
            <View key={target} style={styles.targetPill}>
              <Text style={styles.targetPillText}>{target}</Text>
            </View>
          ))}
        </View>
      </View>

      {payload.mealStructure.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Meal structure</Text>
          {payload.mealStructure.map((meal) => (
            <Text key={meal.label} style={styles.listItem}>
              {meal.label}
              {meal.timingHint ? ` · ${meal.timingHint}` : ""}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Preferences & restrictions</Text>
        <Text style={styles.label}>Preferences</Text>
        <ChipList values={payload.preferences} emptyLabel="None listed" />
        <Text style={[styles.label, { marginTop: 12 }]}>Restrictions</Text>
        <ChipList values={payload.restrictions} emptyLabel="None listed" />
        {payload.allergies.length > 0 ? (
          <>
            <Text style={[styles.label, { marginTop: 12 }]}>Allergies to note</Text>
            <ChipList values={payload.allergies} emptyLabel="None listed" />
          </>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Today&apos;s adherence</Text>
        <Text style={styles.meta}>{adherenceDate}</Text>

        {adherenceQuery.isLoading ? <ActivityIndicator color="#2563eb" /> : null}
        {adherenceQuery.isError ? (
          <Text style={styles.errorText}>
            {adherenceQuery.error instanceof Error
              ? adherenceQuery.error.message
              : "Adherence could not be loaded."}
          </Text>
        ) : null}

        {payload.hydrationLiters != null ? (
          <>
            <Text style={[styles.label, { marginTop: 12 }]}>Hydration</Text>
            <Text style={styles.meta}>
              {formatHydrationProgress(
                adherenceState.hydrationLitersConsumed,
                payload.hydrationLiters,
              )}
            </Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              placeholder={`Target ${payload.hydrationLiters} L`}
              value={
                hydrationDraft ||
                (adherenceState.hydrationLitersConsumed?.toString() ?? "")
              }
              onChangeText={setHydrationDraft}
              onBlur={() => {
                const parsed = parseHydrationInput(hydrationDraft);
                saveAdherence({ hydrationLitersConsumed: parsed });
                setHydrationDraft("");
              }}
            />
          </>
        ) : null}

        {payload.mealStructure.length > 0 ? (
          <>
            <Text style={[styles.label, { marginTop: 16 }]}>Meals followed</Text>
            {adherenceState.mealCompletion.map((meal) => (
              <View key={meal.label} style={styles.checkboxRow}>
                <Switch
                  value={meal.completed}
                  disabled={adherenceMutation.isPending}
                  onValueChange={() => {
                    saveAdherence({
                      mealCompletion: toggleMealCompletion(
                        adherenceState.mealCompletion,
                        meal.label,
                      ),
                    });
                  }}
                />
                <Text style={styles.listItem}>{meal.label}</Text>
              </View>
            ))}
          </>
        ) : null}

        {targetKeys.length > 0 ? (
          <>
            <Text style={[styles.label, { marginTop: 16 }]}>Target completion</Text>
            {targetKeys.map((key) => (
              <View key={key} style={styles.rowBetween}>
                <View>
                  <Text style={styles.listItem}>{targetCompletionLabel(key)}</Text>
                  <Text style={styles.meta}>
                    {formatTargetCompletionLabel(adherenceState.targetCompletion[key])}
                  </Text>
                </View>
                <Pressable
                  style={[
                    styles.button,
                    styles.buttonSecondary,
                    adherenceMutation.isPending ? styles.buttonDisabled : null,
                  ]}
                  disabled={adherenceMutation.isPending}
                  onPress={() => {
                    saveAdherence({
                      targetCompletion: toggleTargetCompletion(
                        adherenceState.targetCompletion,
                        key,
                      ),
                    });
                  }}
                >
                  <Text style={[styles.buttonText, styles.buttonTextSecondary]}>Update</Text>
                </Pressable>
              </View>
            ))}
          </>
        ) : null}

        <Text style={[styles.label, { marginTop: 16 }]}>Daily note</Text>
        <TextInput
          style={styles.input}
          multiline
          placeholder="How did today go?"
          value={noteDraft}
          onChangeText={setNoteDraft}
        />
        <Pressable
          style={[
            styles.button,
            (!noteDraft.trim() || adherenceMutation.isPending) && styles.buttonDisabled,
          ]}
          disabled={!noteDraft.trim() || adherenceMutation.isPending}
          onPress={() => {
            const trimmed = noteDraft.trim();
            if (!trimmed) {
              return;
            }

            saveAdherence({ notes: [...adherenceState.notes, trimmed] });
            setNoteDraft("");
          }}
        >
          <Text style={styles.buttonText}>Save note</Text>
        </Pressable>

        {adherenceState.notes.length > 0 ? (
          <>
            <Text style={[styles.label, { marginTop: 12 }]}>Saved notes</Text>
            {adherenceState.notes.map((note) => (
              <Text key={note} style={styles.listItem}>
                {note}
              </Text>
            ))}
          </>
        ) : null}

        {adherenceMutation.isError ? (
          <Text style={styles.errorText}>
            {adherenceMutation.error instanceof Error
              ? adherenceMutation.error.message
              : "Adherence could not be saved."}
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}
