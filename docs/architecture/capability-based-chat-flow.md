# AI Health Coach — Capability-Based Chat Flow

## Goal

Перестроить чат так, чтобы он был универсальным интерфейсом, а не местом, где захардкожена логика тренировок, питания, документов и Today.

```text
Chat = generic conversation shell
Capabilities = доменные возможности
Tools = контролируемые действия
Proposals = изменения structured state через подтверждение пользователя
Domain Services = реальное изменение данных
```

---

# 1. Main Pipeline

```text
User Message / Attachment
  ↓
Message Preprocessor
  ↓
Message Understanding
  ↓
System Planner
  ↓
Capability Packs
  ↓
Context Engine
  ↓
Coach Reasoning LLM
  ↓
Action Resolver
  ↓
Response / Widget / Proposal / Direct Action
```

---

# 2. Message Preprocessor

## Что это

Лёгкий deterministic/cheap слой перед AI.

Он не отвечает пользователю и не принимает продуктовые решения.

## Что делает

```text
- сохраняет original message
- определяет язык
- определяет response language
- нормализует даты/время
- видит attachments
- выделяет простые явные сигналы
```

## Output

```json
{
  "originalText": "Я плохо спал, стоит ли делать тренировку?",
  "detectedLanguage": "ru",
  "responseLanguage": "ru",
  "hasAttachments": false,
  "mentionedDates": ["today"],
  "simpleSignals": {
    "sleepIssue": true,
    "workoutQuestion": true
  }
}
```

## Важно

```text
Preprocessor не меняет смысл сообщения.
Preprocessor не делает рекомендаций.
Preprocessor не создаёт proposals.
```

---

# 3. Message Understanding

## Что это

Первый LLM-вызов.

Его задача — понять сообщение пользователя, но не отвечать пользователю.

## Что должен вернуть LLM

```json
{
  "signals": [
    "sleep_issue",
    "workout_question",
    "fatigue"
  ],
  "entities": {
    "time": "today",
    "bodyArea": null,
    "activity": null
  },
  "capabilityHints": [
    "workout_coach",
    "daily_checkin"
  ],
  "complexity": "normal",
  "directCommand": false,
  "safetyFlags": [],
  "needsContext": true
}
```

## Что НЕ должен возвращать

```text
- final answer
- final proposal payload
- точные DB queries
- конкретные domain mutations
- слишком большой JSON со всей orchestration логикой
```

## Главная идея

```text
First LLM understands.
It does not decide everything.
```

---

# 4. System Planner

## Что это

Deterministic backend слой после Message Understanding.

Он принимает output первой LLM и решает, какой pipeline запускать.

## Что делает

```text
- выбирает capabilities
- загружает capability packs
- выбирает context slices
- выбирает allowed tools
- выбирает allowed proposal types
- решает, нужен ли второй LLM-вызов
- решает, можно ли выполнить direct action
- применяет safety policy
```

## Output

```json
{
  "selectedCapabilities": [
    "workout_coach",
    "daily_checkin"
  ],
  "responseMode": "contextual_recommendation",
  "contextPlan": [
    {
      "slice": "workout_adaptation",
      "depth": "medium",
      "range": "14d"
    },
    {
      "slice": "daily_checkin",
      "depth": "small",
      "range": "7d"
    }
  ],
  "allowedTools": [
    "getUserContextSlice",
    "createWorkoutPlanChangeProposal",
    "createTodayChecklistProposal"
  ],
  "allowedProposals": [
    "workout_plan_change",
    "today_checklist_change"
  ],
  "requiresLLM": true,
  "requiresUserApprovalForStateChange": true
}
```

## Главная идея

```text
LLM understands.
System Planner decides.
```

---

# 5. Capability Pack

## Что это

Описание доменной возможности системы.

Например:

```text
workout_coach
nutrition_coach
today_assistant
health_context
attachment_interpreter
progress_reviewer
memory_manager
```

## Что лежит внутри capability

```text
- description
- when_to_use
- prompt
- context_strategy
- allowed_tools
- allowed_proposals
- widgets
- safety_rules
- examples
```

## Пример

```yaml
id: workout_coach

description: >
  Helps user create, understand, and adapt workout plans.

when_to_use:
  - user asks about workout
  - user reports fatigue before training
  - user wants easier/harder workout
  - user wants to create or update workout plan

context_strategy:
  - slice: workout_adaptation
    depth: medium
    range: 14d
  - slice: daily_checkin
    depth: small
    range: 7d

allowed_tools:
  - getUserContextSlice
  - createWorkoutPlanChangeProposal
  - createTodayChecklistProposal
  - markTodayWorkoutDone

allowed_proposals:
  - workout_plan_change
  - today_checklist_change

widgets:
  - workout_plan_change_card
  - today_checklist_card
```

---

# 6. Context Engine

## Что это

Слой, который собирает нужные данные о пользователе.

AI не должен лазить по таблицам напрямую.

## Context slices

```text
general_chat
daily_checkin
workout_adaptation
nutrition_adaptation
weekly_review
longevity_overview
health_context
document_context
```

## Пример context request

```json
{
  "slice": "workout_adaptation",
  "depth": "medium",
  "range": "14d"
}
```

## Пример context packet

```json
{
  "slice": "workout_adaptation",
  "todayWorkout": "Lower Body Strength",
  "recentTraining": {
    "completedWorkouts": 3,
    "skippedWorkouts": 1,
    "volleyballSessions": 2
  },
  "recovery": {
    "averageSleep": 6.2,
    "fatigueTrend": "high"
  },
  "relevantMemories": [
    "User often feels tired after volleyball."
  ]
}
```

---

# 7. Coach Reasoning LLM

## Что это

Второй LLM-вызов.

Он уже получает:

```text
- original user message
- understood signals
- selected capabilities
- prompt from capability pack
- typed context slices
- allowed tools
- allowed proposal types
- safety rules
```

## Что должен вернуть

```json
{
  "message": "С учётом плохого сна и усталости лучше снизить нагрузку сегодня.",
  "actions": [
    {
      "type": "create_proposal",
      "proposalType": "workout_plan_change",
      "title": "Заменить сегодняшнюю тренировку на recovery",
      "summary": "Убрать тяжёлые ноги и оставить mobility + core."
    }
  ],
  "widgets": [
    {
      "type": "proposal_card",
      "proposalType": "workout_plan_change"
    }
  ]
}
```

---

# 8. Action Resolver

## Что это

Backend слой, который принимает actions от Coach Reasoning LLM.

## Что делает

```text
- проверяет, разрешён ли action
- валидирует payload
- решает direct action это или proposal
- создаёт proposal
- выполняет direct action, если это явно разрешено
- создаёт widget для frontend
```

## Правило

```text
Plan changes → proposal.
Explicit completion/logging commands → direct action.
```

---

# 9. Tool Types

## Read tools

```text
getUserContextSlice
getTodayState
getActiveWorkoutPlan
getNutritionPlan
getDocumentContext
getWeeklyProgressContext
```

## Proposal tools

```text
createWorkoutPlanChangeProposal
createNutritionPlanChangeProposal
createTodayChecklistProposal
createHabitChangeProposal
createHealthContextProposal
```

## Direct action tools

```text
markTodayWorkoutDone
markTodayMealDone
logWorkoutSession
logMealFromText
saveUserPreference
```

---

# 10. General Schematic Flow With Tools

```text
User Message
  ↓
Message Preprocessor
  ↓
Message Understanding LLM
  ↓
System Planner
  ↓
Capability Registry
  ├── workout_coach
  ├── nutrition_coach
  ├── today_assistant
  ├── health_context
  ├── attachment_interpreter
  └── progress_reviewer
  ↓
Context Engine
  ├── getUserContextSlice
  ├── getTodayState
  ├── getDocumentContext
  └── getWeeklyProgressContext
  ↓
Coach Reasoning LLM
  ↓
Action Resolver
  ├── Direct Action Tools
  │     ├── markTodayWorkoutDone
  │     ├── markTodayMealDone
  │     ├── logWorkoutSession
  │     └── logMealFromText
  │
  ├── Proposal Tools
  │     ├── createWorkoutPlanChangeProposal
  │     ├── createNutritionPlanChangeProposal
  │     ├── createTodayChecklistProposal
  │     └── createHealthContextProposal
  │
  └── Read-only Answer
  ↓
Response
  ├── assistant text
  ├── widgets
  ├── proposal cards
  └── updated UI state
```

---

# 11. Flow A — User Asked About Workout

## Example

```text
Стоит ли мне сегодня делать тренировку?
```

## Flow

```text
User message
  ↓
Message Preprocessor
  - language: ru
  - simpleSignals: workoutQuestion, today
  ↓
Message Understanding LLM
  - signals: workout_question
  - capabilityHints: workout_coach, daily_checkin
  - directCommand: false
  - needsContext: true
  ↓
System Planner
  - selectedCapabilities: workout_coach, daily_checkin
  - context: workout_adaptation + daily_checkin
  - responseMode: contextual_recommendation
  ↓
Context Engine
  - today's workout
  - recent workouts
  - sleep/recovery
  - goals
  - constraints
  ↓
Coach Reasoning LLM
  ↓
Response
```

## Possible outcomes

| Situation | Output |
|---|---|
| Everything looks normal | Answer only |
| User is tired but okay | Suggest reduced intensity |
| Poor sleep/high fatigue | Proposal to reduce or replace session |
| Sharp pain / worrying symptoms | Safety response, no plan mutation |
| Not enough data | Clarifying question |

---

# 12. Flow B — User Attached Photo

## Example

```text
Вот мой обед
+ food photo
```

## Flow

```text
Attachment upload
  ↓
Attachment classifier
  ↓
Attachment recognition
  ↓
Message send
  ↓
Message Understanding LLM
  - signals: attachment_present, food_logging
  - capabilityHints: attachment_interpreter, nutrition_coach
  ↓
System Planner
  - selectedCapabilities: attachment_interpreter, nutrition_coach
  - context: nutrition_adaptation small
  - responseMode: attachment_result_with_optional_log
  ↓
Recognition result
  - food items
  - estimated calories/macros
  - confidence
  ↓
Coach Reasoning LLM or deterministic response
  ↓
Meal Log Widget
```

## Output

```text
Похоже, это:
- курица
- рис
- овощи

Оценка:
- 620 ккал
- 45г белка

[Записать] [Изменить] [Не записывать]
```

## Important rule

```text
Image MIME alone does not mean food.
Classifier decides category unless user selected category explicitly.
```

---

# 13. Flow C — User Says They Feel Bad

## Example

```text
Я сегодня плохо себя чувствую
```

## Flow

```text
User message
  ↓
Message Preprocessor
  - language
  - possible wellbeing signal
  ↓
Safety Boundary Check
  ↓
Message Understanding LLM
  - signals: low_wellbeing / fatigue / unclear_health_state
  - capabilityHints: daily_checkin, health_context, workout_coach
  - safetyFlags: maybe
  - complexity: normal or complex
  ↓
System Planner
  - if crisis/medical emergency boundary → safety response
  - otherwise context: daily_checkin + recent recovery
  ↓
Context Engine
  - sleep
  - recent workload
  - today plan
  - recent check-ins
  ↓
Coach Reasoning LLM
  ↓
Response
```

## Possible outcomes

| Situation | Output |
|---|---|
| Mild tiredness | Supportive check-in + suggest easier day |
| Poor sleep/fatigue | Suggest recovery adjustment |
| Mentions severe symptoms | Safety boundary / seek help |
| Mentions self-harm crisis | Deterministic crisis support, no AI coach |
| Not enough detail | Ask clarifying question |

## Important rule

```text
Feeling bad does not automatically change the plan.
AI may suggest, but plan change requires proposal.
```

---

# 14. Flow D — User Wants Easier Workout Today

## Example

```text
Сделай сегодня тренировку полегче
```

## Flow

```text
User message
  ↓
Message Preprocessor
  - language: ru
  - simpleSignals: workout_change_request, today
  ↓
Message Understanding LLM
  - signals: explicit_workout_change_request
  - capabilityHints: workout_coach, today_assistant
  - directCommand: false
  - needsContext: true
  ↓
System Planner
  - selectedCapabilities: workout_coach, today_assistant
  - responseMode: proposal_required
  - context: workout_adaptation medium
  - allowedProposals: workout_plan_change, today_checklist_change
  ↓
Context Engine
  - today's workout
  - current plan
  - recent load
  - user goals
  - constraints
  ↓
Coach Reasoning LLM
  - creates workout change proposal
  ↓
Action Resolver
  - validates proposal
  - saves proposal as pending
  ↓
Response
  - assistant explanation
  - proposal card
```

## Output

```text
Я могу облегчить сегодняшнюю тренировку, не ломая весь недельный план.

Proposal:
Заменить сегодняшнюю тяжёлую тренировку на лёгкую версию.

Before:
Lower Body Strength

After:
Recovery + Core, 25 минут

[Применить] [Изменить] [Оставить как есть]
```

## Important rule

```text
Even if user asks to change the plan, MVP should still show proposal before applying.
```

---

# 15. Flow E — User Explicitly Marks Workout Done

## Example

```text
Отметь сегодняшнюю тренировку выполненной
```

## Flow

```text
User message
  ↓
Message Preprocessor
  ↓
Message Understanding
  - directCommand: true
  - commandType: mark_today_workout_done
  - capabilityHints: today_assistant
  ↓
System Planner
  - selectedCapabilities: today_assistant
  - responseMode: direct_action
  - requiresLLM: false
  ↓
Action Resolver
  - calls markTodayWorkoutDone
  ↓
Response
```

## Output

```text
Готово, отметил сегодняшнюю тренировку как выполненную.
```

## Important rule

```text
Explicit completion commands can be direct actions.
They do not need proposal.
```

---

# 16. Flow F — User Wants Nutrition Change

## Example

```text
Я вечером постоянно голодный, сделай питание проще
```

## Flow

```text
User message
  ↓
Message Understanding LLM
  - signals: hunger, nutrition_adherence_issue, nutrition_change_request
  - capabilityHints: nutrition_coach
  ↓
System Planner
  - context: nutrition_adaptation 30d
  - responseMode: proposal_required
  ↓
Context Engine
  - current nutrition plan
  - meal logs
  - adherence
  - weight trend
  - preferences
  ↓
Coach Reasoning LLM
  - creates nutrition plan change proposal
  ↓
Action Resolver
  - validates proposal
  - creates proposal card
```

## Output

```text
Похоже, вечерний голод мешает соблюдать план.
Я предлагаю добавить запланированный белковый перекус и перенести часть калорий на ужин.

[Применить] [Изменить] [Оставить как есть]
```

---

# 17. Flow G — User Uploads Health Document

## Example

```text
Загружаю анализы, учти их потом
+ PDF
```

## Flow

```text
Attachment upload
  ↓
Attachment classifier
  ↓
If medical_document:
  ↓
Consent check
  ↓
If no consent:
    show consent widget
  ↓
If consent:
    process document
    create safe summary
    store document context
  ↓
Health Context Capability
  ↓
Response
```

## Output

```text
Этот файл похож на медицинский документ.
Чтобы использовать его как health context, нужно разрешение на обработку.

[Разрешить обработку] [Не обрабатывать]
```

## Important rule

```text
Medical documents do not automatically create plan changes.
They can only become health context after consent.
```

---

# 18. Flow H — User Asks Why AI Suggested Change

## Example

```text
Почему ты хочешь заменить тренировку?
```

## Flow

```text
User message
  ↓
Message Understanding
  - signals: explanation_request
  - capabilityHints: proposal_explainer
  ↓
System Planner
  - load last relevant proposal
  - responseMode: explanation
  ↓
Context Engine
  - proposal context
  - evidence used
  ↓
Coach Reasoning LLM or template
  ↓
Response
```

## Output

```text
Я предложил заменить тренировку потому что:
- ты сообщил плохой сон
- сегодня в плане тяжёлая нагрузка на ноги
- недавно была волейбольная активность
- цель — сохранить прогресс без перегруза
```

---

---

# 19. Multi-LLM Call Strategy

## Главная идея

Не каждый запрос должен проходить через несколько LLM-вызовов.

Система должна выбирать минимально достаточный flow:

```text
Simple request → 0 LLM
Simple explanation → 1 LLM
Personalized answer → 1 LLM + context
Ambiguous request → understanding LLM + coach LLM
Large context → context compression LLM + coach LLM
State change → coach LLM + proposal validation
```

---

## Когда LLM не нужна

LLM не нужна, если пользователь явно просит показать или отметить уже известное состояние.

Примеры:

```text
Что сегодня по плану?
Отметь тренировку выполненной.
Покажи мой план питания.
Сколько у меня задач на сегодня?
```

Flow:

```text
Message Preprocessor
  ↓
System Planner
  ↓
Direct Read / Direct Action Tool
  ↓
Template response / widget
```

Implementation note:

```text
Это должен быть deterministic path без Coach Reasoning LLM.
```

---

## Когда достаточно одного LLM-вызова

Один LLM-вызов подходит, если:

```text
- intent/capability очевидны
- context slice небольшой
- не нужен complex reasoning
- не нужно сжимать большой контекст
- не нужно выбирать между несколькими доменами
```

Примеры:

```text
Что лучше съесть на ужин?
Стоит ли сегодня делать тренировку?
Почему сон важен для восстановления?
```

Flow:

```text
Preprocessor
  ↓
System Planner selects capability directly
  ↓
Context Engine builds small/medium slice
  ↓
Coach Reasoning LLM
  ↓
Answer / optional proposal
```

Implementation note:

```text
Если rule-based planner уверен в capability, можно пропустить Message Understanding LLM.
```

---

## Когда нужны два LLM-вызова

Два LLM-вызова нужны, если сначала нужно понять запрос, а потом ответить уже с правильным контекстом.

Примеры:

```text
Я устал и не понимаю, что менять.
Вес стоит, тренировки не идут.
Я плохо себя чувствую и не хочу сорваться с плана.
```

Flow:

```text
Message Preprocessor
  ↓
Message Understanding LLM
  ↓
System Planner
  ↓
Context Engine
  ↓
Coach Reasoning LLM
  ↓
Answer / proposal
```

Первый LLM-вызов возвращает:

```json
{
  "signals": ["fatigue", "weight_plateau", "adherence_issue"],
  "capabilityHints": ["workout_coach", "nutrition_coach", "progress_reviewer"],
  "complexity": "complex",
  "needsContext": true,
  "safetyFlags": []
}
```

Второй LLM-вызов уже получает:

```text
- original message
- signals
- selected capabilities
- context slices
- capability prompt
- allowed tools/proposals
```

Implementation note:

```text
Первый LLM не должен отвечать пользователю.
Он только классифицирует смысл и помогает выбрать capabilities.
```

---

## Когда нужны три LLM-вызова

Три LLM-вызова нужны, если контекст большой или multi-domain.

Типичный случай:

```text
Пользователь просит глубокий анализ прогресса за месяц.
Пользователь говорит, что вес стоит, усталость растёт, питание не идёт.
Пользователь просит перестроить общий план.
```

Flow:

```text
Message Understanding LLM
  ↓
System Planner
  ↓
Context Engine loads large raw/aggregated context
  ↓
Context Compression / Summary LLM
  ↓
Coach Reasoning LLM
  ↓
Answer / proposal cards
```

Зачем нужен Context Compression LLM:

```text
- большой контекст нельзя целиком отдавать Coach LLM
- нужно убрать шум
- нужно выделить тренды
- нужно оставить только релевантные факты
- нужно сохранить ссылки на источники/периоды
```

Example compression output:

```json
{
  "summaryType": "progress_analysis_context",
  "period": "30d",
  "keyFindings": [
    "Workout adherence is high on weekdays but low on weekends.",
    "Nutrition adherence drops after 19:00.",
    "Sleep average decreased from 7.1h to 6.2h.",
    "Weight trend is flat for 18 days."
  ],
  "relevantRisks": [
    "Fatigue trend is increasing."
  ],
  "recommendedFocusAreas": [
    "recovery",
    "evening nutrition",
    "training load distribution"
  ]
}
```

Implementation note:

```text
Context Compression LLM должен возвращать typed summary, а не свободный текст.
Этот summary становится новым compact context slice для Coach Reasoning LLM.
```

---

## Когда нужен Context Expansion Loop

Иногда Coach Reasoning LLM получает контекст и понимает, что данных не хватает.

Это допустимо, но только как bounded loop.

Flow:

```text
Coach Reasoning LLM
  ↓
requests additional context
  ↓
Backend checks policy
  ↓
Context Engine loads extra slice
  ↓
Coach Reasoning LLM finalizes answer
```

Allowed example:

```json
{
  "needsMoreContext": true,
  "reason": "Need recent sleep and fatigue check-ins before suggesting lower-body workout change.",
  "requestedSlices": [
    {
      "slice": "daily_checkin",
      "depth": "small",
      "range": "7d"
    }
  ]
}
```

Limits:

```text
maxExpansionRounds = 1 for MVP
maxExpansionRounds = 2 later
maxContextSlices = 3
maxDepth = medium by default
documents disabled unless explicitly required
raw data disabled by default
```

Implementation note:

```text
LLM может запросить дополнительный контекст, но backend решает, разрешить ли это.
```

---

## Когда делать Context Compression

Context Compression нужен, если:

```text
- context слишком большой
- period больше 14–30 дней
- много meal/workout/check-in logs
- нужно сравнить тренды
- нужно сделать weekly/monthly review
- запрос multi-domain
```

Примеры:

```text
Проанализируй мой месяц.
Почему я не худею?
Почему я устаю от плана?
Перестрой мне тренировочный и пищевой план.
```

Compression не нужен, если:

```text
- пользователь спрашивает про сегодня
- нужно отметить задачу выполненной
- нужно изменить одну тренировку
- context slice уже compact
```

Implementation note:

```text
Context Engine должен уметь вернуть raw/aggregated context,
а Context Compression LLM должен сделать compact typed summary.
```

---

## Response Mode Table

| Request Type | LLM Calls | Flow |
|---|---:|---|
| Show today plan | 0 | Direct read |
| Mark workout done | 0 | Direct action |
| General explanation | 1 | Coach LLM only |
| Obvious workout question | 1 | Context + Coach LLM |
| Ambiguous wellbeing message | 2 | Understanding LLM + Coach LLM |
| Multi-domain issue | 2–3 | Understanding + Context + Coach |
| Large monthly review | 3 | Understanding + Compression + Coach |
| Missing context after coach reasoning | +1 | Bounded context expansion |
| Plan change | 1–3 | Coach returns proposal, backend validates |

---

# 20. Implementation Notes

## Suggested modules

```text
ai/
  conversation-pipeline/
    conversation-turn.pipeline.ts

  preprocessing/
    message-preprocessor.service.ts

  understanding/
    message-understanding.service.ts
    message-understanding.schema.ts

  planning/
    system-planner.service.ts
    response-mode.policy.ts

  capabilities/
    capability-registry.service.ts
    capability-pack.loader.ts

  context/
    context-engine.service.ts
    context-compression.service.ts
    context-budget.policy.ts

  reasoning/
    coach-reasoning.service.ts
    coach-response.schema.ts

  actions/
    action-resolver.service.ts
    action-policy.service.ts
```

---

## What should be config, not hardcode

Move these out of scattered code and into capability packs:

```text
- prompts
- when_to_use descriptions
- examples
- default context strategy
- allowed tools
- allowed proposals
- widgets
- safety notes
```

Recommended structure:

```text
packages/ai-behavior/capabilities/
  workout-coach/
    capability.yaml
    prompt.md
    examples.yaml

  nutrition-coach/
    capability.yaml
    prompt.md
    examples.yaml

  today-assistant/
    capability.yaml
    prompt.md

  health-context/
    capability.yaml
    prompt.md
    safety.md
```

---

## What should stay in code

These should remain in backend code:

```text
- domain validations
- permission checks
- ownership checks
- proposal apply logic
- direct action execution
- safety boundaries
- consent enforcement
- database writes
```

Rule:

```text
Prompts and behavior descriptions can be config.
Business rules and mutations stay in code.
```

---

## Context Budget Policy

Every context request should be limited.

Example:

```json
{
  "maxSlices": 3,
  "maxDepth": "medium",
  "maxRawItems": 50,
  "maxLookbackDays": 30,
  "allowDocuments": false,
  "allowSensitiveHealthContext": false
}
```

For deep review:

```json
{
  "maxSlices": 4,
  "maxDepth": "large",
  "maxRawItems": 200,
  "maxLookbackDays": 90,
  "requiresCompression": true
}
```

Implementation note:

```text
System Planner should create a context budget before Context Engine loads data.
```

---

## Safety boundary placement

Safety should happen before Coach Reasoning LLM when possible.

```text
Message Preprocessor
  ↓
Safety Boundary Check
  ↓
Message Understanding
  ↓
System Planner
```

For severe cases:

```text
Safety Boundary → deterministic response → no Coach LLM → no proposals
```

---

## Proposal rule

```text
LLM never mutates plan directly.
LLM returns proposal action.
Backend validates.
User applies.
Domain service creates revision.
```

---

## Direct action rule

Direct actions are allowed only when user command is explicit.

Examples:

```text
Отметь тренировку выполненной.
Запиши, что я съел курицу с рисом.
Добавь воду в чеклист.
```

Not direct actions:

```text
Я устал.
Я плохо себя чувствую.
Мне тяжело соблюдать план.
```

Those should produce answer/proposal, not direct mutation.

---

## Final architecture rule

```text
Chat stays generic.
Capabilities know domains.
Tools execute controlled actions.
Planner chooses flow.
Context Engine controls data.
LLM reasons only inside allowed boundaries.
```

# 21. Flow Selection Rules

| User Message | Flow | LLM Calls | State Change |
|---|---|---:|---|
| “Что сегодня?” | Direct read | 0 | No |
| “Отметь тренировку выполненной” | Direct action | 0 | Yes |
| “Стоит ли тренироваться?” | Contextual recommendation | 1–2 | Maybe proposal |
| “Сделай тренировку легче” | Proposal required | 2 | After apply |
| “Вот мой обед” + photo | Attachment recognition + meal widget | 0–1 after recognition | After confirm |
| “Я плохо себя чувствую” | Safety + contextual check-in | 1–2 | Maybe proposal |
| “Загружаю анализы” | Consent/document flow | 0–1 | No plan mutation |
| “Почему ты советуешь это?” | Explanation flow | 0–1 | No |

---

# 22. Final Rules

```text
Chat must stay generic.
Domain logic belongs to capabilities.
LLM should understand, not own orchestration.
System Planner decides the flow.
Context Engine provides user slices.
Tools execute controlled actions.
Plan changes always go through proposals.
Explicit completion/log commands may be direct actions.
Medical documents require consent.
Safety boundaries can short-circuit the AI coach.
```
