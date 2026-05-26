# Onboarding Foundation Upgrade

## Problem Statement

Web onboarding creates the first structured coaching context, but the current flow can let new users reach primary app surfaces without the full baseline profile needed for useful wellness coaching. It also relies on redirects after navigation and a visible "save and continue later" escape hatch, which weakens the first-run commitment and makes onboarding feel separate from the polished light-canvas product direction.

This slice upgrades web onboarding so new users complete a clearer, more complete foundation before using Chat, Today, Longevity, or Profile, while preserving access for existing users who already completed onboarding.

## Goals

- Require new web users to complete onboarding before primary app surfaces are available.
- Add required baseline profile inputs using existing `UserProfile` fields: `birthDate`, `heightCm`, and `baselineWeightKg`.
- Collect date of birth plus metric height and weight in centimeters and kilograms.
- Let preset goals populate existing onboarding goal fields instead of storing preset IDs unless implementation discovers a strong product or technical reason.
- Hide or disable primary navigation during onboarding, not only redirect after a click.
- Remove the visible "Save & continue later" button while keeping silent local draft persistence if it improves resilience.
- Improve onboarding presentation with the existing structured light-canvas visual patterns.
- Keep copy in wellness, fitness, tracking, and coaching language, with no diagnosis or treatment framing.

## Non-Goals

- Mobile onboarding changes.
- Re-gating existing users who already have completed onboarding.
- Adding new persisted preset-goal IDs or new domain tables for presets by default.
- Replacing the broader profile, goal hierarchy, or plan revision architecture.
- Diagnosis, treatment, medication, clinical-risk, or medical-certainty workflows.
- Full redesign of all primary app surfaces outside the onboarding shell/nav behavior needed for this slice.

## User Stories

- As a new user, I must complete onboarding before I can use Chat, Today, Longevity, or Profile so the coach has baseline context.
- As a new user, I can enter my date of birth, height in centimeters, and weight in kilograms as part of the same onboarding journey.
- As a new user, I can choose a preset coaching goal and still end up with normal structured onboarding fields, not an opaque preset record.
- As a new user, I do not see primary app navigation until onboarding is complete.
- As an existing completed user, I can continue using the product without being forced through new onboarding fields retroactively.
- As a user, I see wellness-focused onboarding copy that explains coaching context without medical claims.

## Accepted UX Behavior

- Web-only scope: the upgraded flow applies to `apps/web` onboarding and app shell behavior.
- Incomplete new users are contained in `/onboarding`; primary navigation is hidden or disabled during the onboarding state.
- Direct visits to primary app routes by incomplete users still land in onboarding, but the UI should not advertise unavailable primary routes first.
- Completed users visiting `/onboarding` continue to be redirected to the default authenticated surface, currently `/chat`.
- Users with prior `onboardingCompletedAt` or existing completed onboarding state are grandfathered and must not be blocked because `birthDate`, `heightCm`, or `baselineWeightKg` are missing.
- The visible "Save & continue later" action is removed. Local draft persistence may stay silent for reload recovery and should clear after successful completion.
- Preset goal selection should fill the existing quarterly goal fields such as type, title, target, start date, target date, priority, and horizon.
- Visual direction should use the existing structured light-canvas patterns: calm panels, clear step progress, compact explanatory copy, and focused form cards.

## Data And Contracts

- Reuse the current onboarding completion path and shared `onboardingSchema` contract unless implementation finds a contract reason to split draft and submit schemas.
- Extend onboarding profile submission to require these existing profile fields for new completion:
  - `birthDate`: ISO calendar date.
  - `heightCm`: positive integer in centimeters, bounded by existing shared validation.
  - `baselineWeightKg`: positive kilogram value, bounded by existing shared validation.
- Preserve existing profile fields in onboarding: activity level, training experience, preferences, constraints, and longevity direction.
- Preserve existing user fields in onboarding: display name and timezone.
- Preserve existing quarterly goal creation through `onboardingQuarterlyGoalSchema`.
- Completion state remains based on the existing user/onboarding model, including `onboardingCompletedAt` and current completed-state behavior.
- Grandfathering should be based on completed onboarding state, not on the new required field presence.
- Do not persist preset IDs by default. If presets are introduced in UI code, they should be static view-model choices that map into existing contract fields.

## Acceptance Criteria

1. New signed-in web users who have not completed onboarding cannot access primary app surfaces before completing onboarding.
2. During onboarding, primary navigation is hidden or disabled in the app shell rather than shown as clickable routes that immediately redirect.
3. Onboarding completion for new users requires `birthDate`, `heightCm`, and `baselineWeightKg` in addition to the existing required onboarding fields.
4. Date of birth, height, and weight inputs use clear metric labels and validation messages.
5. Existing completed users remain ungated even when the new required profile fields are null.
6. Preset goals, if offered, populate existing onboarding goal fields and successful completion creates the normal structured quarterly goal.
7. The visible "Save & continue later" control is removed; silent draft persistence does not create a user-facing bypass.
8. Successful onboarding sets completion state, clears any local onboarding draft, and lands the user on the default authenticated surface.
9. Onboarding copy stays coaching/wellness-focused and avoids diagnosis, treatment, medication, and medical certainty language.
10. The upgraded web onboarding uses existing light-canvas visual patterns and remains responsive.

## Risks And Assumptions

- Tightening required fields can accidentally re-gate existing users if completion checks are coupled to profile completeness.
- Shared schema changes may affect API tests, web payload construction, and any future mobile consumer; keep this slice web-only while preserving contract clarity.
- Date of birth validation needs enough bounds to reject bad input without implying medical interpretation.
- Removing the visible save-later action may frustrate users if local draft recovery fails.
- Preset goal copy can overpromise results; keep it framed as a coaching starting point.
- App shell gating can flicker if user state loading and nav rendering are not coordinated.

## Subagent Implementation Order

1. **Frontend Implementer**
   - Update web onboarding steps, draft state, validation, preset-goal mapping, copy, visual structure, and app shell nav hiding/disabled behavior.
   - Keep mobile untouched.
2. **Backend Implementer**
   - Update shared onboarding/profile validation and API completion behavior if frontend requirements need contract changes.
   - Preserve grandfathering through current completed-state semantics.
3. **Design System Agent**
   - Review reusable light-canvas primitives, spacing, form states, progress indicators, and accessibility if the frontend work introduces reusable patterns.
4. **Test Writer**
   - Add focused contract, API, and web state tests for required fields, grandfathering, preset mapping, draft clearing, and navigation gating.
5. **Implementation Reviewer**
   - Check architecture fit, privacy/safety copy, grandfathering, tests, and avoidance of new unnecessary persistence.
6. **App Runner**
   - Run the local web/API flow and verify new-user onboarding, completed-user access, direct-route gating, and successful completion.

Skip Visual Designer and UI Polish Implementer unless implementation produces a broader visual redesign need beyond the approved light-canvas pattern upgrade.

## Verification Plan

- Run focused shared-contract tests for `onboardingSchema` and profile validation.
- Run focused API onboarding/user-state tests covering:
  - new user cannot complete without required baseline profile fields,
  - successful completion persists existing profile and quarterly goal fields,
  - existing completed users remain `onboardingCompleted` with missing new fields.
- Run focused web tests or component/state tests covering:
  - required input validation,
  - preset goal mapping to existing fields,
  - removal of visible save-later control,
  - local draft recovery and clear-on-submit behavior,
  - nav hidden/disabled during onboarding.
- Run typecheck for affected packages/apps.
- Runtime smoke with App Runner:
  - sign in as an incomplete new user and confirm only onboarding is available,
  - complete onboarding with birth date, cm, kg, and a preset or manual goal,
  - confirm redirect to `/chat` and primary navigation appears,
  - simulate an existing completed user missing new fields and confirm no re-gating.
