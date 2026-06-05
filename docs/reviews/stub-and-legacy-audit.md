# Аудит заглушек (stub/fake) и наслоения новой логики поверх старой

**Дата:** 2026-06-05
**Ветка:** `feature/editable-proposals-performed-log`
**Область:** `apps/api`, `apps/web`, `apps/mobile`, `packages/*` (продакшен-код; тестовые файлы
исключены, кроме случаев, где путь покрыт только тестом).
**Тип:** только аудит. Код не менялся. Каждый пункт — это указатель `path:line` плюс рекомендация;
ничего здесь не правится автоматически.

Аудит отвечает на два вопроса:
- **A. Заглушки / фейки** — где мы возвращаем заранее заготовленные данные вместо реального вызова
  (реальная LLM, реальный внешний API, реальное вычисление) и что может **уйти в продакшен как фейк**?
- **B. Новое поверх старого** — где новая логика наложена поверх старого пути, который всё ещё
  присутствует и достижим, чтобы можно было решить, что консолидировать или удалить?

---

## Сводка

| Серьёзность | Заглушки/фейки (A) | Новое-поверх-старого (B) |
|-------------|--------------------|--------------------------|
| **HIGH** | 3 | 1 |
| **MED**  | 4 | 5 |
| **LOW**  | 1 | 3 |

**Топ-3, на что смотреть в первую очередь (все HIGH):**
1. **A1/A2 — AI-коуч по умолчанию работает как фейк.** `AI_COACH_PROVIDER` по умолчанию `"stub"`,
   поэтому если деплой явно не выставил `openai` + `OPENAI_API_KEY`, запущенный API отдаёт коучинг,
   подобранный по ключевым словам, **без вызова LLM**.
2. **A3 — У сжатия контекста (context compression) нет реальной реализации.** Фабрика всегда
   возвращает stub-компрессор; продакшен-пути, который реально сжимает контекст, не существует.
3. **B1 — Два живых пути исполнения AI.** Новый multi-domain fan-out путь работает рядом со старым
   single agent-loop путём (оставлен как fallback / не-router путь). Оба достижимы в продакшене.

---

## Раздел A — Заглушки / фейки (заготовленные данные, без реального вызова)

### A1 — `StubCoachAiProvider` (целиком фейковый LLM-провайдер) — HIGH
- **Где:** `packages/ai/src/stub-provider.ts` и его фикстуры:
  `packages/ai/src/stub-workout-plan.ts`, `stub-habit-plan.ts`, `stub-wellbeing.ts`,
  `stub-weekly-review.ts`, `stub-proposal-revision.ts`.
- **Что фейкается:** все ответы коуча и типизированные proposals формируются сопоставлением по
  ключевым словам (`includes("workout")`, regex для прошедшей активности и т.д.) и захардкоженными
  фикстурами планов (фиксированные id рецептов/упражнений из seed-SQL, фиксированные ставки калорий).
  Никакого вывода модели.
- **Реальная реализация есть?** Да — `apps/api/src/modules/ai/openai-coach-provider.ts`.
- **Риск:** сам по себе это корректный и полезный двойник для тестов/локалки, но он же выбран **по
  умолчанию** (см. A2), поэтому именно он работает в любом окружении, где забыли включить OpenAI.
- **Рекомендация:** оставить как тестовый/dev-двойник. Реальный риск — это **выбор по умолчанию**
  (A2), а не сама заглушка.

### A2 — Провайдер коуча по умолчанию — заглушка — HIGH
- **Где:** `apps/api/src/modules/ai/coach-provider.factory.ts:13-21`, дефолт в
  `apps/api/src/env.ts:19` (`AI_COACH_PROVIDER: z.enum(["stub","openai"]).default("stub")`).
- **Что фейкается:** `createCoachAiProvider()` возвращает `new StubCoachAiProvider()`, если
  `AI_COACH_PROVIDER !== "openai"`. То есть деплой без этой переменной отдаёт фейковый коучинг.
- **Уже есть подстраховка:** `apps/api/src/observability/config-diagnostics.ts:58` поднимает ошибку
  `openai_api_key`, когда выбран `openai`, но ключа нет — но он **не** предупреждает, когда провайдер
  молча откатывается на `stub`.
- **Рекомендация:** (a) убедиться, что прод выставляет `AI_COACH_PROVIDER=openai` + `OPENAI_API_KEY`
  (см. `docs/deployment/railway.md:69-70`); (b) добавить **предупреждение** на старте, когда `stub`
  активен вне test/dev, чтобы фейк-коуч деплой не проходил молча.

### A3 — Сжатие контекста существует только как заглушка (нет реальной реализации) — HIGH
- **Где:** `apps/api/src/modules/coaching-context/context-compression.factory.ts:4-6` всегда
  возвращает `new StubContextCompressionProvider()`;
  реализация — `apps/api/src/modules/coaching-context/stub-context-compression.provider.ts`.
- **Что фейкается:** «сжатие» — это детерминированная сборка строк из ограниченных срезов с
  захардкоженными switch-картами focus-area/domain и эвристикой `dataQuality` по количеству. Не-stub
  провайдера **нет нигде**; подключаемый токен `CONTEXT_COMPRESSION_PROVIDER` всегда резолвится в
  заглушку (связано с B4).
- **Риск:** двухслойная схема primary/fallback в `context-compression.service.ts` (B4)
  бессмысленна, потому что primary == stub. Читающий архитектуру предполагает, что реальный
  компрессор существует — а его нет.
- **Рекомендация:** либо реализовать реальный компрессор за фабрикой, либо схлопнуть
  индирекцию фабрики/провайдера и явно пометить stub как единственную задуманную реализацию с
  условием замены/удаления.

### A4 — `SeededOnlyRecipeCatalogProvider` возвращает `[]` — MED
- **Где:** `apps/api/src/modules/recipes/recipe-catalog.config.ts:9-15`; выбирается через
  `resolveRecipeCatalogProviderMode()` (тот же файл) и подключается в `recipes.module.ts`.
- **Что фейкается:** `fetchByGenericCategories()` возвращает пустой массив. Активируется, когда
  `RECIPE_CATALOG_PROVIDER` ∈ `seeded_only|none|disabled|off`. По умолчанию — **реальный**
  `TheMealDbCatalogProvider`.
- **Риск:** низкий-средний: это намеренный переключатель «без внешнего каталога», но он использует
  `providerName = THEMEALDB_PROVIDER`, что вводит в заблуждение в логах/телеметрии.
- **Рекомендация:** оставить переключатель; дать seeded-only провайдеру собственный `providerName`,
  чтобы диагностика не утверждала TheMealDB, когда он отключён.

### A5 — Плейсхолдер медиа упражнений в активном пути — MED
- **Где:** `apps/api/src/modules/exercises/exercise.mapper.ts:45` и
  `apps/api/src/modules/exercises/exercises.repository.ts:194` —
  `{ refs: [], fallbackLabel: "Demonstration coming soon" }`, когда `media` равно null.
- **Что фейкается:** пользовательское «Demonstration coming soon» подставляется вместо отсутствующего
  медиа упражнения.
- **Рекомендация:** приемлемо как graceful fallback; наполнение реальным медиа вести как
  контент-задачу. Для корректности правки кода не требуется.

### A6 — Дата nutrition-инцидента в UTC, а не в таймзоне пользователя — MED
- **Где:** `apps/api/src/modules/nutrition/nutrition.repository.ts:274` (`TODO(C2)`).
- **Что фейкается:** `incidentDate` выводится из UTC-префикса, а не из таймзоны пользователя, поэтому
  инциденты около полуночи могут попасть на неверный день.
- **Рекомендация:** реальная починка требует прокинуть таймзону пользователя в репозиторий; вести как
  датированный TODO с владельцем.

### A7 — Вложения чата: плейсхолдер «пока только изображения» — MED
- **Где:** `packages/types/src/chat-attachments.ts:59` и `:360` («PDF/text document flow is
  deferred»).
- **Что фейкается:** загрузка PDF/текстовых документов намеренно не реализована; только изображения.
- **Рекомендация:** это документированная отсрочка, согласованная с правилами пайплайна — оставить, а
  PDF/text вести как будущую фичу, не как долг.

### A8 — Fallback-хелперы решений — LOW (не долг)
- **Где:** `createFallbackFinalDecision` / `createFallbackRouterDecision` /
  `createFallbackDomainAnswer` (в `packages/types`), используются router/domain/decision-исполнителями.
- **Почему не долг:** это намеренные безопасно-деградированные выводы, когда шаг LLM падает/таймаутит —
  фича безопасности, а не фейк. Перечислено, чтобы не флагать повторно.

---

## Раздел B — Новая логика поверх старой (двойные пути / legacy-совместимость)

### B1 — Два пути исполнения AI: fan-out поверх single agent-loop — HIGH
- **Где:** `apps/api/src/modules/ai/agent-orchestrator.service.ts:247-288`.
- **НОВОЕ:** `runFanOutTurn()` (строка 295+) — router → по-доменный `DomainLlmExecutorService`
  (параллельно) → `DecisionMakerExecutorService` → `ActionResolver`. Срабатывает при
  `shouldRunRouter && routerResult?.source === "llm" && !isDeterministicResponseModeExecutorMode(...)`.
- **СТАРОЕ:** `ResponseModeExecutorService.execute(...)` (строка 266) — single agent-loop
  (`provider.generateAgentLoopStep` / `generateCoachResponse`) для proposal-revision, explainer,
  fallback при низкой уверенности и детерминированных режимов.
- **Достижимо?** Оба, в продакшене. Старый путь — намеренный fallback / не-router путь.
- **Условие удаления:** не указано. Выглядит намеренно (graceful degradation), но это реальная
  сложность двух путей. По заметке о fan-out-редизайне миграция «phased & pending».
- **Рекомендация:** задокументировать целевое состояние — single-executor путь остаётся постоянным
  fallback или подлежит удалению, когда fan-out покроет все типы турнов? Зафиксировать условие в коде
  или в доке пайплайна.

### B2 — Устаревшие комментарии «Phase 2 — not called by orchestrator yet» — LOW (быстрый фикс)
- **Где:** `packages/ai/src/stub-provider.ts:83` и `:494-497`;
  `apps/api/src/modules/ai/openai-coach-provider.ts:100`;
  `apps/api/src/modules/ai/action-resolver.service.ts:20` («Phase 2 never executes these») и `:157`
  («Phase 2: direct mutation actions are deferred»); эхо в `stub-provider-phase2.spec.ts:5` и
  `openai-coach-provider.spec.ts:184,287,410`.
- **Реальность:** `generateRouterDecision` / `generateDomainStep` / `generateFinalDecision` **уже**
  вызываются в продакшене через fan-out путь (B1). Формулировка «dark / not called yet» устарела.
- **Рекомендация (follow-up, здесь не применяется):** обновить эти комментарии, чтобы отражали, что
  fan-out живой. Важно: комментарий action-resolver «direct mutation actions are deferred» всё ещё
  **корректен** (прямые мутации остаются proposal-only) — устарела только формулировка «dark».

### B3 — Распознавание вложений: `attachment_context_only` поверх `saved_health_document` — MED
- **Где:** `packages/types/src/chat-attachments.ts:136` (новый литерал), `:142-143` (legacy-литерал),
  `:528` (`parseStoredChatAttachmentRecognition`), `:544-554` (`sanitizeMedicalRecognitionForClient`
  нормализует старое → новое).
- **НОВОЕ vs СТАРОЕ:** новые записи используют только `attachment_context_only`; старые сохранённые
  строки `saved_health_document` всё ещё парсятся и санитизируются при чтении.
- **Достижимо?** Только чтение (исторические строки БД). Комментарий помечает «Legacy persisted rows
  only».
- **Условие удаления:** не указано. Безопасно держать, пока существуют старые строки.
- **Рекомендация:** добавить явное условие удаления (например, после миграции/бэкфилла, удаляющего
  строки `saved_health_document`), чтобы у слоя совместимости был выход.

### B4 — Сжатие контекста: двойной слой primary + stub-fallback — MED
- **Где:** `apps/api/src/modules/coaching-context/context-compression.service.ts:38-100`.
- **НОВОЕ vs СТАРОЕ:** пробуем подключённый `CONTEXT_COMPRESSION_PROVIDER`, откатываемся на stub при
  падении/невалидном выводе, затем null. Но фабрика всегда подставляет stub (A3), так что «primary» и
  «fallback» — это одно и то же.
- **Рекомендация:** решать вместе с A3 — как только появится реальный провайдер, двойной слой обретёт
  смысл; до тех пор это мёртвая структура, подразумевающая возможность, которой нет.

### B5 — День тренировки: структурный `weekday` поверх legacy free-text `day` — MED
- **Где:** `packages/types/src/workouts.ts:152` (`weekday`), `:153` («Legacy free-text day label
  retained for older revisions»), `:158-159` (refine «требуется одно из»), `:626`
  (`inferWeekdayFromDayLabel`), `:778-806` (валидация: структурные планы требуют `weekday`, старые
  ревизии grandfathered).
- **Достижимо?** Оба — старые payload-ы только с `day` всё ещё принимаются и конвертируются.
- **Рекомендация:** запланировать бэкфилл, который смапит существующие `day` → `weekday`, затем убрать
  free-text путь и `inferWeekdayFromDayLabel`. Зафиксировать это как условие удаления.

### B6 — Упражнение: структурный объект поверх legacy-строки — MED
- **Где:** `packages/types/src/workouts.ts:75` («Session-level and legacy plan exercise object
  shape»), union, принимающий `string | WorkoutExercise`, `:1458`
  (`normalizeWorkoutSessionExerciseEntry` конвертирует строки → объекты с детерминированными id).
- **Достижимо?** Оба — строковая форма прозрачно нормализуется для исторических данных.
- **Рекомендация:** тот же паттерн, что B5 — бэкфилл + удаление строковой ветки, когда данных в
  строковой форме не останется.

### B7 — Устаревшие значения enum метода маршрутизации — MED
- **Где:** `packages/types/src/agent-context.ts:98-104` — `@deprecated` `"llm_router"`,
  `"message_understanding"`, `"attachment_family"` сохранены в enum рядом с текущими
  `"unified_turn_decision"` / `"rule_based"`.
- **Достижимо?** Только чтение (исторические метаданные турнов); продакшен их никогда не пишет.
- **Рекомендация:** держать для read-совместимости; добавить условие удаления, привязанное к
  retention/миграции старых метаданных чат-турнов.

---

## Раздел C — Просмотрено, намеренно (не долг)

Перечислено, чтобы не флагать повторно в будущих проходах:
- **Режимы response-mode executor** (`packages/types/src/response-mode-executor.ts`) — несколько
  легитимных режимов исполнения (детерминированные read/write vs LLM-варианты), не legacy-дублирование.
  Комментарий «legacy `ExpectedResponseMode` values remain unchanged» лишь отмечает стабильность схемы.
- **Action-resolver «direct mutations deferred»** (`action-resolver.service.ts:157`) — корректно
  обеспечивает инвариант proposal-only; устарела лишь формулировка «Phase 2 dark» (B2).
- **Дефолты consent/generator `v1`** (`packages/types/src/documents.ts`,
  `apps/web/src/lib/documents-ui-state.ts`) — поля прямого версионирования; пути v2 нет, так что нет
  дублирования.
- **Маркеры `phaseN` в `describe()`** в `*.spec.ts` (today, device-metrics, migrations) — метки
  организации тестов, не runtime-пути.

---

## Follow-ups (зафиксировано, в этом аудите не сделано)

1. Проверить/зафиксировать прод `AI_COACH_PROVIDER=openai` и добавить предупреждение на старте, когда
   `stub` активен вне test/dev (A2).
2. Определить направление по сжатию контекста: реализовать реальный провайдер или схлопнуть
   stub-only фабрику/двойной слой (A3 + B4).
3. Обновить устаревшие комментарии «Phase 2 / dark / not called yet» под живой fan-out (B2).
4. Добавить явные условия удаления (и бэкфиллы, где нужно) для слоёв совместимости B3, B5, B6, B7.
5. Дать `SeededOnlyRecipeCatalogProvider` отдельный `providerName` (A4); решить TODO с таймзоной даты
   nutrition-инцидента (A6).
