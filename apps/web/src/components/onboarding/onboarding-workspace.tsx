"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  apiQueryKeys,
  completeOnboarding,
  getCurrentUserState,
  getOnboardingRefreshQueryKeys,
} from "../../lib/api";
import {
  activityLevelLabel,
  applyOnboardingGoalPreset,
  buildOnboardingPayload,
  clearOnboardingDraftFromStorage,
  COMMON_TIMEZONES,
  createDefaultOnboardingDraft,
  getNextOnboardingStep,
  getPreviousOnboardingStep,
  mergeOnboardingDraftWithUserState,
  ONBOARDING_GOAL_PRESETS,
  onboardingStepIndex,
  onboardingStepLabel,
  ONBOARDING_WIZARD_STEPS,
  quarterlyGoalTypeLabel,
  readOnboardingDraftFromStorage,
  trainingExperienceLabel,
  validateOnboardingStep,
  writeOnboardingDraftToStorage,
  type OnboardingDraft,
  type OnboardingGoalPresetKey,
  type OnboardingWizardStep,
} from "../../lib/onboarding-ui-state";
import { Button, EmptyState, ErrorState, LoadingState } from "../ui";

function StepProgress({ step }: { step: OnboardingWizardStep }) {
  const currentIndex = onboardingStepIndex(step);

  return (
    <ol className="onboarding-progress" aria-label="Onboarding progress">
      {ONBOARDING_WIZARD_STEPS.map((wizardStep, index) => {
        const status =
          index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming";

        return (
          <li
            key={wizardStep}
            className={`onboarding-progress__step onboarding-progress__step--${status}`}
          >
            <span className="onboarding-progress__marker" aria-hidden="true">
              {index + 1}
            </span>
            <span className="onboarding-progress__label">{onboardingStepLabel(wizardStep)}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function OnboardingWorkspace() {
  const { getToken } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<OnboardingDraft>(() =>
    readOnboardingDraftFromStorage() ?? createDefaultOnboardingDraft(),
  );
  const [stepErrors, setStepErrors] = useState<string[]>([]);

  const userStateQuery = useQuery({
    queryKey: apiQueryKeys.currentUserState,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await getCurrentUserState(token);
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Your account state could not be loaded.");
      }

      return result.data;
    },
  });

  useEffect(() => {
    if (!userStateQuery.data) {
      return;
    }

    setDraft((current) => mergeOnboardingDraftWithUserState(current, userStateQuery.data));
  }, [userStateQuery.data]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const validationErrors = ONBOARDING_WIZARD_STEPS.flatMap((step) =>
        validateOnboardingStep(step, draft),
      );

      if (validationErrors.length > 0) {
        throw new Error(validationErrors.join(" "));
      }

      const payload = buildOnboardingPayload(draft);
      const result = await completeOnboarding(token, payload);

      if (result.error || !result.data) {
        throw new Error(result.error ?? "Onboarding could not be completed.");
      }

      return result.data;
    },
    onSuccess: async () => {
      clearOnboardingDraftFromStorage();
      await Promise.all(
        getOnboardingRefreshQueryKeys().map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
      router.replace("/chat");
    },
  });

  const updateDraft = (updates: Partial<OnboardingDraft>) => {
    setDraft((current) => {
      const next = { ...current, ...updates };
      writeOnboardingDraftToStorage(next);
      return next;
    });
    setStepErrors([]);
  };

  const goToStep = (step: OnboardingWizardStep) => {
    updateDraft({ step });
  };

  const handleNext = () => {
    const errors = validateOnboardingStep(draft.step, draft);
    if (errors.length > 0) {
      setStepErrors(errors);
      return;
    }

    const nextStep = getNextOnboardingStep(draft.step);
    if (nextStep) {
      goToStep(nextStep);
      return;
    }

    submitMutation.mutate();
  };

  const handleBack = () => {
    const previousStep = getPreviousOnboardingStep(draft.step);
    if (previousStep) {
      goToStep(previousStep);
    }
  };

  const handlePresetSelect = (presetKey: OnboardingGoalPresetKey) => {
    setDraft((current) => {
      const next = applyOnboardingGoalPreset(current, presetKey);
      writeOnboardingDraftToStorage(next);
      return next;
    });
    setStepErrors([]);
  };

  if (userStateQuery.isLoading) {
    return <LoadingState title="Preparing onboarding…" />;
  }

  if (userStateQuery.isError) {
    return (
      <ErrorState
        title="Onboarding unavailable"
        description={
          userStateQuery.error instanceof Error
            ? userStateQuery.error.message
            : "Your account could not be loaded."
        }
      />
    );
  }

  if (userStateQuery.data?.onboardingCompleted) {
    return (
      <EmptyState
        title="Onboarding already complete"
        description="Your coaching context is saved. Head to Chat or Profile to continue."
        action={
          <div className="action-row proposal-actions">
            <Button variant="primary" onClick={() => router.replace("/chat")}>
              Open Chat
            </Button>
            <Button variant="secondary" onClick={() => router.replace("/profile")}>
              View Profile
            </Button>
          </div>
        }
      />
    );
  }

  const isFinalStep = getNextOnboardingStep(draft.step) == null;
  const showCustomQuarterlyFields =
    draft.goalPresetKey === "custom" || draft.goalPresetKey === "";

  return (
    <div className="onboarding-workspace">
      <header className="onboarding-workspace__header dashboard-card dashboard-card--coach">
        <p className="section-label">First-run setup</p>
        <h1>Set up your coaching foundation</h1>
        <p className="dashboard-card__hint">
          A short guided setup so your coach starts from saved context—not chat memory.
        </p>
      </header>

      <StepProgress step={draft.step} />

      <section className="panel panel-prominent onboarding-step-panel">
        <p className="section-label">Step {onboardingStepIndex(draft.step) + 1}</p>
        <h2>{onboardingStepLabel(draft.step)}</h2>

        {draft.step === "account" ? (
          <div className="onboarding-form">
            <label className="form-field">
              <span>Display name</span>
              <input
                type="text"
                value={draft.displayName}
                maxLength={120}
                autoComplete="nickname"
                onChange={(event) => updateDraft({ displayName: event.target.value })}
              />
              <span className="form-help">How your coach should address you.</span>
            </label>

            <label className="form-field">
              <span>Timezone</span>
              <select
                value={draft.timezone}
                onChange={(event) => updateDraft({ timezone: event.target.value })}
              >
                {[...new Set([draft.timezone, ...COMMON_TIMEZONES])].map((timezone) => (
                  <option key={timezone} value={timezone}>
                    {timezone}
                  </option>
                ))}
              </select>
              <span className="form-help">Used for Today, weekly focus, and scheduling.</span>
            </label>
          </div>
        ) : null}

        {draft.step === "profile" ? (
          <div className="onboarding-form">
            <p className="onboarding-step-panel__intro">
              These baseline details help your coach personalize workouts, nutrition guidance, and
              progress tracking.
            </p>

            <label className="form-field">
              <span>Date of birth</span>
              <input
                type="date"
                value={draft.birthDate}
                autoComplete="bday"
                onChange={(event) => updateDraft({ birthDate: event.target.value })}
              />
              <span className="form-help">Used for age-aware coaching—not for medical assessment.</span>
            </label>

            <div className="onboarding-baseline-grid">
              <label className="form-field">
                <span>Height (cm)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={50}
                  max={260}
                  step={1}
                  value={draft.heightCm}
                  onChange={(event) => updateDraft({ heightCm: event.target.value })}
                />
                <span className="form-help">Enter height in centimeters.</span>
              </label>

              <label className="form-field">
                <span>Weight (kg)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={20}
                  max={500}
                  step={0.1}
                  value={draft.baselineWeightKg}
                  onChange={(event) => updateDraft({ baselineWeightKg: event.target.value })}
                />
                <span className="form-help">Your current weight in kilograms.</span>
              </label>
            </div>

            <label className="form-field">
              <span>Activity level</span>
              <select
                value={draft.activityLevel}
                onChange={(event) =>
                  updateDraft({
                    activityLevel: event.target.value as OnboardingDraft["activityLevel"],
                  })
                }
              >
                <option value="">Prefer not to say yet</option>
                <option value="sedentary">{activityLevelLabel("sedentary")}</option>
                <option value="lightly_active">{activityLevelLabel("lightly_active")}</option>
                <option value="moderately_active">
                  {activityLevelLabel("moderately_active")}
                </option>
                <option value="very_active">{activityLevelLabel("very_active")}</option>
                <option value="athlete">{activityLevelLabel("athlete")}</option>
              </select>
            </label>

            <label className="form-field">
              <span>Training experience</span>
              <select
                value={draft.trainingExperience}
                onChange={(event) =>
                  updateDraft({
                    trainingExperience: event.target.value as OnboardingDraft["trainingExperience"],
                  })
                }
              >
                <option value="">Prefer not to say yet</option>
                <option value="beginner">{trainingExperienceLabel("beginner")}</option>
                <option value="intermediate">{trainingExperienceLabel("intermediate")}</option>
                <option value="advanced">{trainingExperienceLabel("advanced")}</option>
              </select>
            </label>
          </div>
        ) : null}

        {draft.step === "direction" ? (
          <div className="onboarding-form">
            <label className="form-field">
              <span>Longevity direction</span>
              <textarea
                value={draft.longevityStatement}
                maxLength={500}
                rows={4}
                onChange={(event) => updateDraft({ longevityStatement: event.target.value })}
              />
              <span className="form-help">
                A wellness-focused north star—for example staying strong, mobile, and energized
                over the long term.
              </span>
            </label>

            <label className="form-field">
              <span>Tags (optional)</span>
              <input
                type="text"
                value={draft.longevityTags}
                onChange={(event) => updateDraft({ longevityTags: event.target.value })}
              />
              <span className="form-help">Comma-separated themes like strength, sleep, consistency.</span>
            </label>
          </div>
        ) : null}

        {draft.step === "quarterly" ? (
          <div className="onboarding-form">
            <div className="onboarding-goal-presets">
              <p className="onboarding-step-panel__intro">
                Pick a coaching starting point for this quarter, or define your own.
              </p>
              <div className="onboarding-goal-presets__grid" role="list">
                {ONBOARDING_GOAL_PRESETS.map((preset) => {
                  const isSelected = draft.goalPresetKey === preset.key;

                  return (
                    <button
                      key={preset.key}
                      type="button"
                      role="listitem"
                      className={`onboarding-goal-preset${isSelected ? " onboarding-goal-preset--selected" : ""}`}
                      aria-pressed={isSelected}
                      onClick={() => handlePresetSelect(preset.key)}
                    >
                      <span className="onboarding-goal-preset__label">{preset.label}</span>
                      <span className="onboarding-goal-preset__description">{preset.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {showCustomQuarterlyFields ? (
              <>
                <label className="form-field">
                  <span>Objective type</span>
                  <select
                    value={draft.quarterlyType}
                    onChange={(event) =>
                      updateDraft({
                        quarterlyType: event.target.value as OnboardingDraft["quarterlyType"],
                        goalPresetKey: "custom",
                      })
                    }
                  >
                    <option value="general_wellness">
                      {quarterlyGoalTypeLabel("general_wellness")}
                    </option>
                    <option value="fat_loss">{quarterlyGoalTypeLabel("fat_loss")}</option>
                    <option value="muscle_gain">{quarterlyGoalTypeLabel("muscle_gain")}</option>
                    <option value="maintenance">{quarterlyGoalTypeLabel("maintenance")}</option>
                    <option value="endurance">{quarterlyGoalTypeLabel("endurance")}</option>
                  </select>
                </label>

                <label className="form-field">
                  <span>Quarterly objective</span>
                  <input
                    type="text"
                    value={draft.quarterlyTitle}
                    maxLength={160}
                    onChange={(event) =>
                      updateDraft({
                        quarterlyTitle: event.target.value,
                        goalPresetKey: "custom",
                      })
                    }
                  />
                  <span className="form-help">
                    One measurable 90-day outcome, such as completing regular workouts or building a
                    hydration habit.
                  </span>
                </label>
              </>
            ) : (
              <div className="onboarding-goal-summary panel-secondary">
                <p className="section-label">Selected objective</p>
                <p className="onboarding-goal-summary__title">{draft.quarterlyTitle}</p>
                <p className="onboarding-goal-summary__meta">
                  {quarterlyGoalTypeLabel(draft.quarterlyType)} · You can refine this later in Chat
                </p>
                <Button
                  variant="ghost"
                  onClick={() => handlePresetSelect("custom")}
                >
                  Customize instead
                </Button>
              </div>
            )}
          </div>
        ) : null}

        {draft.step === "preferences" ? (
          <div className="onboarding-form">
            <label className="form-field">
              <span>Preferences (optional)</span>
              <input
                type="text"
                value={draft.preferences}
                onChange={(event) => updateDraft({ preferences: event.target.value })}
              />
              <span className="form-help">Comma-separated coaching preferences.</span>
            </label>

            <label className="form-field">
              <span>Constraints (optional)</span>
              <input
                type="text"
                value={draft.constraints}
                onChange={(event) => updateDraft({ constraints: event.target.value })}
              />
              <span className="form-help">
                Equipment limits, schedule boundaries, or movements to avoid.
              </span>
            </label>
          </div>
        ) : null}

        {stepErrors.length > 0 ? (
          <div className="form-error" role="alert">
            {stepErrors.join(" ")}
          </div>
        ) : null}

        {submitMutation.isError ? (
          <div className="form-error" role="alert">
            {submitMutation.error instanceof Error
              ? submitMutation.error.message
              : "Onboarding could not be completed."}
          </div>
        ) : null}

        <div className="action-row onboarding-actions">
          {getPreviousOnboardingStep(draft.step) ? (
            <Button variant="secondary" onClick={handleBack} disabled={submitMutation.isPending}>
              Back
            </Button>
          ) : null}
          <Button variant="primary" onClick={handleNext} disabled={submitMutation.isPending}>
            {submitMutation.isPending
              ? "Saving…"
              : isFinalStep
                ? "Finish onboarding"
                : "Continue"}
          </Button>
        </div>
      </section>
    </div>
  );
}
