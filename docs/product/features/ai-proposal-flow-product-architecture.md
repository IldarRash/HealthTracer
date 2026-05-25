# AI Proposal Flow — Product Architecture Idea

## Purpose

This document describes the product flow for AI-generated proposals inside the AI Health Coach.

The goal is not to describe low-level implementation details.

The goal is to explain how the experience should work:

- how the AI suggests changes
- how the user sees them in chat
- how widgets/cards should behave
- how changes become part of the structured plan
- how the system preserves trust, transparency, and control

---

# 1. Core Idea

The AI assistant should not silently change the user's training, nutrition, habits, or health-related plans.

Instead, the assistant should propose changes as visible, understandable, and reversible suggestions.

The core flow:

```text
User says something
  ↓
AI understands the situation
  ↓
AI suggests a structured change
  ↓
User sees a proposal card in chat
  ↓
User accepts, edits, or rejects
  ↓
Only then the plan changes
```

The user should always feel:

```text
The AI helps me, but I stay in control.
```

---

# 2. Main Product Principle

```text
LLM proposes.
User decides.
System applies.
History is preserved.
```

This is the most important rule.

The AI is not just a text generator, but it is also not allowed to make hidden changes.

It acts like a smart coach who says:

```text
Based on your current state, I recommend changing the plan this way.
Do you want to apply it?
```

---

# 3. Why Proposal Flow Is Needed

Without proposal flow, the product becomes risky and confusing.

Bad experience:

```text
User: I feel tired today.
AI: I changed your workout.
User: What exactly changed? Why? Can I undo it?
```

Good experience:

```text
User: I feel tired today.
AI: I recommend replacing today's heavy lower-body session with a recovery session.
Proposal card:
- Why
- What changes
- What stays the same
- Expected effect
Buttons:
[Apply] [Modify] [Reject]
```

This creates trust.

---

# 4. Product Roles

| Role | Responsibility |
|---|---|
| User | Gives feedback, asks questions, confirms changes |
| AI Coach | Understands the situation and proposes actions |
| Proposal Card | Makes the AI suggestion visible and interactive |
| Plan System | Stores the actual structured plans |
| Revision History | Preserves every applied change |
| UI Panels | Show the updated plan after the user applies a proposal |

---

# 5. Difference Between Advice and Proposal

Not every AI answer should create a proposal.

## Advice

Advice is only a text recommendation.

Example:

```text
You can keep the workout, but reduce the weight slightly if you feel tired.
```

Use advice when:

- no plan change is needed
- the answer is informational
- the user asks for explanation
- the recommendation is low-impact

## Proposal

A proposal is an actionable change to the structured plan.

Example:

```text
I suggest replacing today's workout with a 25-minute recovery session.
```

Use proposal when:

- the plan should change
- today's checklist should change
- nutrition targets should change
- habit schedule should change
- user needs a visible decision

---

# 6. General Proposal Flow

```text
1. User sends message
2. AI reads user context
3. AI decides whether a change is useful
4. AI explains the reason
5. AI creates a proposal
6. Chat shows a proposal card
7. User chooses:
   - Apply
   - Modify
   - Reject
8. If applied, the system updates the plan
9. The change appears in the relevant product area
10. The system records history
```

---

# 7. Proposal Card Concept

A proposal card is a visual object inside chat.

It should answer 5 questions:

```text
1. What is the AI suggesting?
2. Why is it suggesting this?
3. What will change?
4. What will stay the same?
5. What can the user do next?
```

Example card:

```text
AI Suggestion: Replace today's lower-body workout

Reason:
You reported poor sleep and heavy legs after volleyball.

Before:
Heavy lower-body strength session

After:
Recovery + mobility session, 25–30 minutes

Expected effect:
Lower fatigue, preserve consistency, avoid overloading tired legs.

Actions:
[Apply] [Modify] [Reject]
```

---

# 8. Proposal Card States

| State | Meaning |
|---|---|
| Pending | AI suggested a change, user has not decided yet |
| Applied | User accepted and the plan was updated |
| Rejected | User declined the suggestion |
| Modified | User asked AI to adjust the suggestion |
| Expired | Proposal is no longer relevant |
| Failed | System could not apply the proposal |

---

# 9. Proposal Lifecycle

```text
Created
  ↓
Shown to user
  ↓
Pending
  ↓
User decision
  ├── Apply → Applied → Plan revision created
  ├── Modify → AI creates updated proposal
  └── Reject → Rejected → Optional memory learned
```

Important:

```text
A proposal is not a plan update yet.
It becomes a real update only after Apply.
```

---

# 10. Apply / Modify / Reject

## Apply

User agrees with the suggestion.

Product behavior:

```text
- proposal becomes applied
- plan changes
- revision is created
- chat confirms the update
- related screen refreshes
```

Example:

```text
Done — I updated today's workout to a recovery session.
```

## Modify

User likes the idea but wants adjustments.

Example:

```text
Make it shorter.
Keep one strength exercise.
Do not move the workout to Friday.
```

Product behavior:

```text
- user feedback goes back to AI
- AI updates the proposal
- new or edited proposal card appears
```

## Reject

User does not want the suggestion.

Product behavior:

```text
- proposal becomes rejected
- plan stays unchanged
- AI may ask if it should remember this preference
```

Example:

```text
Got it — I will keep today's workout unchanged.
```

---

# 11. Workout Proposal Flow

## Example User Message

```text
I slept badly and my legs are heavy after volleyball. Should I train today?
```

## AI Reasoning Goal

The AI should understand:

```text
- user is asking about today's workout
- fatigue and poor sleep are relevant
- current workout plan is needed
- recent training load is needed
- a safer alternative may be useful
```

## AI Response

```text
Since you slept badly and your legs are still tired after volleyball, I would not do the heavy lower-body session today.
I suggest replacing it with a recovery session and moving the strength workout later.
```

## Proposal Card

```text
Proposal: Adjust today's workout

Reason:
Poor sleep + leg fatigue after volleyball.

Before:
Lower-body strength session

After:
Recovery session:
- mobility
- light core
- easy walk
- no jumps
- no heavy squats

Actions:
[Apply] [Modify] [Reject]
```

## After Apply

```text
Today screen:
Recovery session becomes today's workout.

Training screen:
Plan shows a new revision.

Chat:
AI confirms the update.
```

---

# 12. Nutrition Proposal Flow

## Example User Message

```text
I keep getting hungry in the evening. My diet is hard to follow.
```

## AI Should Understand

```text
- user is struggling with nutrition adherence
- current nutrition plan is needed
- meal logs and hunger patterns are useful
- weight goal should be considered
```

## AI Response

```text
It looks like the plan may be too hard to follow in the evening.
I suggest moving more protein and calories to dinner and adding a planned evening snack.
```

## Proposal Card

```text
Proposal: Adjust nutrition plan

Reason:
Evening hunger is reducing adherence.

Before:
Most calories earlier in the day.
No planned evening snack.

After:
- Add high-protein evening snack
- Move part of carbs to dinner
- Keep daily calories the same

Actions:
[Apply] [Modify] [Reject]
```

## After Apply

```text
Nutrition screen:
Updated daily meal structure appears.

Today screen:
Evening snack appears as checklist item.

Chat:
AI confirms the nutrition plan update.
```

---

# 13. Daily Checklist Proposal Flow

## Example User Message

```text
I do not have time for a full workout today.
```

## AI Response

```text
Let's keep the habit alive with a short version today.
I suggest replacing the full session with a 12-minute minimum workout.
```

## Proposal Card

```text
Proposal: Replace full workout with minimum version

Before:
45-minute workout

After:
12-minute session:
- warm-up
- 2 strength exercises
- short mobility

Actions:
[Apply] [Modify] [Reject]
```

## Why This Matters

The product should optimize for continuity.

Sometimes the best change is not a perfect plan.

It is a plan the user can actually complete.

---

# 14. Habit Proposal Flow

## Example User Message

```text
I always forget to stretch.
```

## AI Response

```text
I can add a small evening stretching habit to your daily checklist.
```

## Proposal Card

```text
Proposal: Add evening mobility habit

Reason:
You often forget stretching, so a recurring reminder may help.

New habit:
5-minute mobility after dinner

Frequency:
4 days per week

Actions:
[Apply] [Modify] [Reject]
```

---

# 15. Memory Proposal Flow

Some user statements should become long-term memory.

Example:

```text
I hate sweet breakfasts. I prefer eggs or salty food.
```

The AI may respond:

```text
Got it. I can remember that you prefer savory breakfasts, so future meal plans fit you better.
```

Possible card:

```text
Memory suggestion:
Remember preference: savory breakfasts over sweet breakfasts

Actions:
[Remember] [Do not remember]
```

For low-risk preferences, this can also be saved automatically, but the product should remain transparent.

---

# 16. Health Context Proposal Flow

Health-related context requires extra care.

Example:

```text
I uploaded my blood test. Can you consider my vitamin D level when planning?
```

The AI should not diagnose.

Good response:

```text
I can use the uploaded result as context for wellness planning, but I cannot diagnose or prescribe treatment.
I can mark vitamin D as a health context item to consider in future recommendations.
```

Proposal card:

```text
Health context suggestion:
Use uploaded vitamin D result as context for future wellness recommendations.

Important:
This is not a diagnosis or treatment plan.

Actions:
[Apply as context] [Reject]
```

---

# 17. When AI Should Create a Proposal

AI should create a proposal when:

```text
- structured plan needs to change
- user asks to adapt something
- user reports fatigue, poor sleep, schedule conflict, hunger, pain, stress, or low adherence
- AI detects a repeated pattern
- a daily checklist should change
- a plan revision would help
```

---

# 18. When AI Should Not Create a Proposal

AI should not create a proposal when:

```text
- user only asks a general question
- user asks for an explanation
- data is insufficient
- the request is unsafe
- the topic requires professional medical care
- the change would be too large without more confirmation
```

In those cases, the AI should answer, ask a clarifying question, or recommend professional help where appropriate.

---

# 19. Proposal Scope

Every proposal should have a clear scope.

| Scope | Meaning |
|---|---|
| Today only | Change only today's item |
| This week | Change current week |
| Entire plan | Change the full plan |
| Future default | Change future recommendations only |
| Memory only | Save a user preference or pattern |

Good UX requires showing scope clearly.

Example:

```text
This change affects today only.
```

or

```text
This will update your full weekly plan.
```

---

# 20. User Trust Rules

The user should never wonder:

```text
Did the AI change something without asking?
```

Trust rules:

```text
- show what changed
- show why it changed
- show scope
- show before/after
- allow rejection
- allow modification
- preserve history
- make changes reversible
```

---

# 21. Explainability

Every proposal should explain:

```text
- what triggered the suggestion
- which user context was used
- why this change is safer or better
- how it affects the plan
```

Example:

```text
I am suggesting this because:
- you reported poor sleep
- today's workout is lower-body heavy
- you played volleyball yesterday
- your goal is consistency without overloading recovery
```

---

# 22. Proposal UX in Chat

The chat should not become only text.

It should support rich assistant messages:

```text
Assistant message
  ├── Text explanation
  ├── Proposal card
  ├── Before/after summary
  ├── Action buttons
  └── Link to affected plan area
```

Example:

```text
AI:
I recommend reducing today's load.

[Proposal Card]
Replace lower-body strength with recovery

[Apply] [Modify] [Reject]

View affected workout →
```

---

# 23. Proposal UX in Side Panels

Proposal cards should also affect side panels.

## Today Panel

Shows:

```text
Pending suggestion:
AI suggests changing today's workout.
```

## Training Panel

Shows:

```text
Pending proposal badge on today's workout.
```

## Nutrition Panel

Shows:

```text
Suggested meal plan update pending.
```

This makes the assistant feel integrated into the product, not isolated in chat.

---

# 24. After Apply UX

After applying, the user should immediately see confirmation.

```text
Chat:
Done — today's workout is now Recovery + Mobility.

Today:
Updated checklist appears.

Training:
Plan revision badge appears.
```

The system should also allow:

```text
Undo
View revision history
Explain why this changed
```

---

# 25. Rejection UX

If user rejects:

```text
AI:
No problem — I will keep the original plan.
```

Optionally:

```text
Would you like me to remember that you prefer not to replace workouts completely and would rather reduce volume instead?
```

This turns rejection into learning.

---

# 26. Modification UX

If user clicks Modify:

```text
User:
Keep one strength exercise but remove jumps.

AI:
Got it. I updated the proposal:
- keep split squats
- remove jumps
- reduce total volume
```

Then a new or updated proposal card appears.

---

# 27. Proposal Priority

Some proposals should be more urgent than others.

| Priority | Example |
|---|---|
| Low | Add stretching habit |
| Medium | Adjust nutrition timing |
| High | Reduce workout load due to fatigue |
| Safety-sensitive | Health-related context or pain-related adjustment |

Safety-sensitive proposals should be more conservative and require confirmation.

---

# 28. Proposal Expiration

Some proposals expire.

Example:

```text
Changing today's workout is only relevant today.
```

Expiration examples:

| Proposal | Expiration |
|---|---|
| Today's workout change | End of day |
| Weekly plan change | End of week |
| Nutrition structure change | Until replaced |
| Memory update | Does not expire unless user removes it |

Expired proposals should not be applied.

---

# 29. Proposal History

The system should keep history so the user can see:

```text
- what AI suggested
- what was accepted
- what was rejected
- how the plan evolved
- why changes happened
```

This is important for trust and long-term coaching.

---

# 30. Product-Level Benefits

Proposal flow gives the product:

```text
- user control
- transparency
- safety
- structured plan updates
- better UX than a normal chatbot
- explainable AI behavior
- revision history
- long-term personalization
```

This turns the product from:

```text
AI chatbot that gives advice
```

into:

```text
AI coach that helps manage a living plan
```

---

# 31. Key Product Formula

```text
Conversation creates intent.
Intent selects context.
Context enables advice or proposal.
Proposal creates decision.
Decision creates revision.
Revision updates the plan.
Plan drives daily execution.
Execution creates new context.
```

This is the loop that makes the product powerful.

Important:

```text
Proposal is not a top-level response mode.
Proposal is the result when a personalized response wants to change structured state.
```

---

# 32. Two-Layer AI Flow

The product should separate two different concerns:

```text
1. Response routing
   Decide how much intelligence and context the message needs.

2. Proposal lifecycle
   Decide what happens if the final answer suggests changing structured state.
```

This separation keeps the system fast for simple requests and safe for plan-changing requests.

---

# 33. Response Routing Strategy

Not every user message should trigger the full AI pipeline.

The product should choose the cheapest and safest flow that still gives a good answer.

The routing layer decides between:

```text
Direct deterministic response
Single LLM response
Context-aware LLM response
LLM-router + context slice + final LLM
Bounded context expansion
```

The proposal layer starts only after the final answer produces a structured state-change draft.

---

# 34. Response Modes Overview

| Mode | LLM Calls | Context Needed | Use When |
|---|---:|---|---|
| Direct deterministic response | 0 | Direct DB/tool only | User asks to view known data or perform a deterministic action |
| Single LLM response | 1 | Minimal context | General coaching, education, or motivation |
| Context-aware response | 1 | Known typed context slice | Intent is clear and personalization matters |
| LLM-router + final LLM | 2 | Router-selected context slice | Intent is unclear or context choice matters |
| Context expansion loop | 2-3 | Initial + approved extra slices | First context is not enough |

Proposal cards can appear after a context-aware response, router + final LLM response, or context expansion response.

---

# 35. End-to-End MVP Flow

```text
User message
  ↓
Light message preprocessor
  ↓
Rule router
  ↓
Intent confident?
  ├── Yes → build typed context slice
  └── No  → LLM intent router
            ↓
          context plan
            ↓
          build typed context slice
  ↓
Final coach LLM
  ↓
State change proposed?
  ├── No  → advice, explanation, or clarification question
  └── Yes → structured proposal draft
            ↓
          backend validation
            ↓
          inline proposal card in chat
            ↓
          user applies, modifies, or rejects
            ↓
          revision only after Apply
```

The LLM-router does not answer the user.

The final coach LLM is the only model call that writes user-facing coaching text.

---

# 36. Message Preprocessor Role

The Message Preprocessor should run before routing, but it should stay lightweight.

Its job is not to answer.

Its job is to prepare the message for routing.

It should extract:

```text
original text
detected language
response language
mentioned dates
attachments
obvious signals
possible domain hints
```

Example:

```json
{
  "original_text": "Я плохо спал, ноги после волейбола забиты. Делать тренировку?",
  "detected_language": "ru",
  "response_language": "ru",
  "signals": {
    "sleep_issue": true,
    "fatigue": true,
    "workout_question": true,
    "mentions_volleyball": true
  }
}
```

The preprocessor should not:

```text
- change the meaning
- make final recommendations
- create plan changes
- diagnose
- overwrite original text
```

For multilingual users:

```text
Always preserve originalText.
Detect responseLanguage.
Optionally create translatedForProcessing.
Answer in the user's language.
```

---

# 37. Rule Router Role

The rule router should handle obvious, high-confidence cases.

Examples:

```text
Show today's workout.
Mark this workout as done.
Should I train today?
Change today's workout.
Show my nutrition plan.
```

The rule router should return:

```json
{
  "intent": "adjust_workout",
  "confidence": 0.92,
  "routing_method": "rule_based",
  "required_context_slices": [
    {
      "type": "workout_adaptation",
      "depth": "medium",
      "time_range": "14d"
    }
  ],
  "expected_response_mode": "recommendation_with_optional_proposal"
}
```

If the rule router is not confident, it should not silently fall back to a generic answer.

Instead, it should send the prepared message to the LLM-router.

---

# 38. When to Answer Without LLM

Some requests do not need an LLM at all.

Examples:

```text
What is my workout today?
Show my nutrition plan.
Mark this workout as done.
Show my weight trend.
Open my weekly checklist.
```

Recommended flow:

```text
User message
  ↓
Message preprocessor
  ↓
Rule router identifies deterministic action
  ↓
Direct tool / DB read or write
  ↓
Template or UI response
```

Use this when:

```text
- user asks to view existing data
- user asks to mark something done
- no reasoning is needed
- no plan change is being designed
- no safety interpretation is needed
```

Why:

```text
- faster
- cheaper
- more reliable
- avoids hallucination
```

---

# 39. When to Use One LLM Call

Use one LLM call when the request is simple but needs natural language.

Examples:

```text
Explain why sleep matters for recovery.
Give me general tips for eating more protein.
Motivate me to train today.
What does progressive overload mean?
```

Recommended flow:

```text
User message
  ↓
Light preprocessor
  ↓
LLM with general system prompt
  ↓
Answer
```

Use this when:

```text
- user asks for explanation
- no personal data is required
- no structured state needs to change
- no sensitive health context is involved
```

This is good for educational answers and general coaching.

---

# 40. When to Use One LLM Call With Context Slice

Use this when the intent is obvious and the system knows which context slice is needed.

Examples:

```text
Should I train today?
What should I eat for dinner?
How did I do this week?
Why am I not progressing?
```

Recommended flow:

```text
User message
  ↓
Rule router identifies intent with high confidence
  ↓
Context Engine builds typed slice
  ↓
Final LLM receives user message + context slice
  ↓
Advice, clarification, or proposal draft
```

Example:

```text
User:
I slept badly. Should I do today's workout?

System:
Intent is obviously workout_adaptation.
Fetch workout_adaptation slice.
Send message + slice to final LLM.
```

Use this when:

```text
- intent is clear
- context slice is obvious
- user expects personalization
- answer requires current user state
```

This is probably the most common personalized mode for the product.

---

# 41. When to Use LLM-Router + Final LLM

Use two LLM calls when the rule router cannot confidently determine the intent or context needs.

Examples:

```text
I feel completely off today. What should I do?
I am not seeing results.
My routine is not working.
I feel tired and hungry all the time.
```

These messages could involve:

```text
- workout adaptation
- nutrition adaptation
- sleep/recovery
- mental wellbeing
- weekly review
- health context
```

Recommended flow:

```text
User message
  ↓
Message preprocessor
  ↓
Rule router returns low confidence
  ↓
LLM intent router
  ↓
Structured context plan
  ↓
Context Engine fetches required typed slices
  ↓
Final LLM answers with context
```

The first LLM call should not answer the user.

It should return structured routing output:

```json
{
  "intent": "workout_adaptation",
  "confidence": 0.86,
  "routing_method": "llm_router",
  "required_context_slices": [
    {
      "type": "workout_adaptation",
      "depth": "medium",
      "time_range": "14d"
    },
    {
      "type": "daily_checkin",
      "depth": "small",
      "time_range": "7d"
    }
  ],
  "safety_flags": ["fatigue"],
  "expected_response_mode": "recommendation_with_optional_proposal"
}
```

Then the final LLM gets:

```text
original user message
detected intent
context slices
available proposal actions
safety rules
response language
```

Use this when:

```text
- user message is ambiguous
- multiple domains may be involved
- wrong context would produce a bad answer
- personalization matters
- safety interpretation matters
```

---

# 42. LLM-Router Contract

The LLM-router is a classification and planning step.

It should answer this internal question:

```text
What does the final coach LLM need in order to answer safely and usefully?
```

It must not:

```text
- produce user-facing advice
- create proposals
- apply changes
- request raw private data unless explicitly needed
- diagnose or produce medical conclusions
```

It may request:

```text
- one primary intent
- optional secondary domain hints
- required context slices
- depth and time range for each slice
- safety flags
- whether document context is needed
- whether the final answer may create a proposal
```

For MVP, the router should prefer a small context plan:

```text
maxContextSlices = 3
defaultDepth = medium
documents disabled unless explicit
rawData disabled by default
```

---

# 43. Context Slice Rules

The backend should build typed context slices from router output.

The final LLM should not receive the full user state by default.

Good context slices are:

```text
- small enough to reason over
- typed and validated
- scoped to the detected intent
- explicit about time range
- safe for health and document context
```

Examples:

| Intent | Primary Slice | Optional Slice |
|---|---|---|
| workout_adaptation | workout_adaptation | daily_checkin |
| nutrition_adaptation | nutrition_adaptation | progress_trend |
| weekly_review | weekly_review | goals |
| health_context | health_context | documents, only when explicit |
| general_chat | minimal_profile | none |

If the requested slice is unavailable, the final LLM should receive a structured missing-context note rather than silently hallucinating.

---

# 44. Bounded Context Expansion

Sometimes the first context slice is not enough.

The final LLM may request extra context, but only within strict limits.

Recommended flow:

```text
User message
  ↓
Initial routing and context slice
  ↓
Final LLM
  ↓
Needs more context?
  ├── No → answer or proposal draft
  └── Yes → request extra slice
              ↓
            Backend approves
              ↓
            Extra context retrieved
              ↓
            Final answer or proposal draft
```

This should be a bounded loop, not a free agent loop.

Recommended limits:

```text
maxExpansionRounds = 1 for MVP
maxExpansionRounds = 2 for advanced flows
maxSlices = 3
defaultDepth = medium
documents disabled unless explicitly needed
rawData disabled by default
```

Use context expansion when:

```text
- confidence is low
- user asks for deep analysis
- initial context shows missing data
- plan change may be risky
- health context may be relevant
- trend analysis needs longer period
```

Do not use context expansion when:

```text
- user asks to view today's plan
- user asks to mark item done
- user asks a simple general question
- user asks for a small known fact
```

---

# 45. Proposal Trigger After Final LLM

Use proposal lifecycle when the final LLM wants to change structured state.

Examples:

```text
Replace today's workout.
Reduce this week's training volume.
Adjust nutrition targets.
Add an evening snack.
Add a stretching habit.
Save a user preference.
Use uploaded document as future context.
```

Recommended flow:

```text
Final LLM output
  ↓
Contains structured proposal draft?
  ├── No → return text answer
  └── Yes → backend validates proposal
            ↓
          persist pending proposal
            ↓
          chat shows inline proposal card
            ↓
          user applies, modifies, or rejects
            ↓
          system updates plan only after Apply
```

Use proposal lifecycle when:

```text
- workout plan changes
- nutrition plan changes
- checklist changes
- habit plan changes
- memory or health context changes
- user should explicitly approve
```

Do not create a proposal when:

```text
- answer is informational
- no state change is needed
- data is insufficient
- user has not asked for a change and the change is high impact
- the request is unsafe or requires medical care
```

---

# 46. Inline Proposal Card MVP

For MVP, state-changing suggestions should appear as inline cards inside the chat transcript.

Do not use a modal or blocking overlay for the default proposal experience.

The inline card should show:

```text
- proposal title
- target domain
- reason
- scope
- before/after summary where possible
- validation state
- Apply / Modify / Reject actions
- link to affected product area after Apply
```

The assistant message can still include natural language around the card.

Example:

```text
AI:
I would reduce today's training load because your recovery signals are poor.

[Inline proposal card]
Adjust today's workout
Scope: Today only
Before: Lower-body strength session
After: Recovery + mobility session
Actions: [Apply] [Modify] [Reject]
```

Important:

```text
The card is visible evidence that the AI has not changed anything yet.
The plan changes only after the user applies the card.
```

For high-risk or safety-sensitive suggestions, the inline card should be more conservative and may require stronger explanatory copy, but it should still not apply changes automatically.

---

# 47. Decision Matrix

| User Request | Best Flow |
|---|---|
| "Show today's workout" | Direct DB/tool response |
| "Mark workout done" | Direct action, no LLM |
| "Explain progressive overload" | Single LLM response |
| "What should I eat for dinner?" | Context-aware LLM with nutrition slice |
| "Should I train if I slept badly?" | Context-aware LLM with workout slice |
| "I feel off today, what should I do?" | LLM-router + context + final LLM |
| "Why am I not losing weight?" | Router + nutrition/weekly context + final LLM |
| "Change today's workout" | Context-aware LLM, then proposal card if a state change is drafted |
| "I uploaded blood tests, consider them" | Health context proposal with careful safety language |
| "Review my week" | Weekly context slice + final LLM |
| "My whole routine is not working" | LLM-router + context, maybe bounded expansion |

---

# 48. Practical MVP Strategy

For MVP, use this routing strategy:

```text
1. Light preprocessor first.
2. Rule router second.
3. If the rule route is confident:
   - direct response
   - or one context-aware final LLM call
4. If the rule route is unclear:
   - LLM-router
   - context slice
   - final LLM
5. If the final LLM says context is insufficient:
   - allow one extra context expansion
6. If the final LLM proposes a state change:
   - validate structured proposal
   - show inline proposal card
```

Recommended MVP limits:

```text
maxLlmRouterCalls = 1
maxExpansionRounds = 1
maxContextSlices = 3
maxDepth = medium
no documents unless explicit
no raw data unless explicit
```

This keeps the system:

```text
fast
cheap
safe
predictable
personalized
```

---

# 49. Implementation Plan

The current product already has much of the proposal lifecycle in place.

The implementation work should focus on adding the uncertain-intent routing layer and aligning the chat card UX.

## Backend implementation

Update AI orchestration around:

```text
apps/api/src/modules/ai/agent-orchestrator.service.ts
apps/api/src/modules/ai/intent-router.ts
apps/api/src/modules/ai/ai.service.ts
apps/api/src/modules/ai/openai-coach-provider.ts
```

Planned backend changes:

```text
1. Add confidence and uncertainty to rule routing.
2. Stop treating generic fallback as a confident route.
3. Add LLM-router provider method for ambiguous messages.
4. Add typed router output schema:
   - intent
   - confidence
   - routing method
   - required context slices
   - safety flags
   - expected response mode
5. Let the orchestrator build context from router output.
6. Keep final LLM responsible for user-facing answer/proposal generation.
7. Keep proposal validation and application in backend proposal services.
```

The LLM-router should be called only when deterministic routing is uncertain.

## Context implementation

Update context contracts around:

```text
apps/api/src/modules/coaching-context/coaching-context.service.ts
apps/api/src/modules/coaching-context/user-context-slice.builder.ts
apps/api/src/modules/coaching-context/agent-prompt-context.ts
packages/types/src/agent-context.ts
```

Planned context changes:

```text
1. Support router-selected context slice requests.
2. Preserve existing typed slice validation.
3. Represent missing context explicitly.
4. Keep document and raw-data context disabled unless explicit.
5. Keep maxContextSlices = 3 for MVP.
```

## Structured output and proposal implementation

Use existing proposal services around:

```text
packages/types/src/index.ts
apps/api/src/modules/proposals/proposal-validation.service.ts
apps/api/src/modules/proposals/proposal-apply.service.ts
apps/api/src/modules/proposals/proposals.service.ts
```

Planned proposal changes:

```text
1. Treat final LLM proposals as drafts until backend validation passes.
2. Persist valid drafts as pending proposals.
3. Preserve invalid drafts only when useful for explainability/debugging.
4. Ensure pending and rejected proposals never mutate structured state.
5. Ensure applied proposals create revisions instead of overwriting plan state.
```

## Frontend implementation

Align chat proposal UI around:

```text
apps/web/src/components/chat/chat-workspace.tsx
apps/web/src/components/proposals/inline-proposal-card.tsx
apps/web/src/components/ui/proposal-confirmation.tsx
apps/web/src/lib/proposal-ui-state.ts
```

Planned frontend changes:

```text
1. Keep inline cards as the MVP proposal UI.
2. Align action labels with Apply / Modify / Reject.
3. Keep Apply disabled for invalid proposals.
4. Add richer before/after summaries beyond nutrition where possible.
5. Add a clear rejected-state confirmation.
6. Add Modify only after the API behavior for proposal revisioning is defined.
```

## Tests

Validation should cover:

```text
- clear workout/nutrition requests bypass LLM-router
- ambiguous messages call LLM-router
- LLM-router returns structured context needs and no user-facing advice
- final LLM can answer without proposal
- final LLM proposal becomes a pending inline card only after backend validation
- pending/rejected proposals do not mutate active structured state
- applied proposals create revisions
- inline proposal cards show Apply / Modify / Reject states as supported
```

---

# 50. Key Rule

The model should not always answer immediately.

It should answer immediately only when the question is simple enough.

For personalized recommendations, the final model should answer from:

```text
user message
+ detected intent
+ typed context slice
+ safety rules
+ available proposal actions
```

Final formula:

```text
Simple request -> simple flow.
Personalized recommendation -> context-aware flow.
Unclear request -> LLM-router + context + final LLM.
State change draft -> backend validation + inline proposal card.
Insufficient context -> bounded context expansion.
```

---

# 51. Final Summary

The AI Proposal Flow is the bridge between chat and structured product state.

The assistant should not only say what to do.

It should be able to suggest structured changes, explain them, show them as interactive cards, and let the user decide.

The best experience is:

```text
AI sees the user's message.
The system determines the right intent and context.
AI explains the recommendation.
AI shows a clear before/after proposal when structured state should change.
User applies, modifies, or rejects.
The plan updates only after confirmation.
The system records the change as history.
```

This creates a product that feels intelligent, safe, transparent, and useful every day.
