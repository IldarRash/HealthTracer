/**
 * Golden eval suite for the RouterLlm and DecisionMaker stages.
 *
 * These tests call the real OpenAI API and are ONLY executed when:
 *   LLM_EVALS=1  AND  OPENAI_API_KEY is set in the environment.
 *
 * They are unconditionally SKIPPED in normal `pnpm test` / CI so they never
 * incur API costs unexpectedly.
 *
 * Run command:
 *   LLM_EVALS=1 corepack pnpm --dir apps/api exec vitest run src/modules/ai/evals
 *
 * Pass threshold: ≥80% of router cases and ≥80% of decision cases must pass.
 * Individual failures are printed per case; the suite fails only if the
 * aggregate threshold is not met, tolerating LLM noise.
 *
 * Dataset sizes:
 *   Router golden set   : 40 cases (EN + RU, mix of single-domain, multi-domain, ambiguous, smalltalk)
 *   Decision golden set :  8 cases (proposal-intent selection vs plain reply)
 */

import { describe, it, expect, beforeAll } from "vitest";
import { MessagePreprocessorService } from "../message-preprocessor.service.js";
import { RouterLlmService } from "../router-llm.service.js";
import { DecisionMakerExecutorService } from "../decision-maker-executor.service.js";
import { createAiPolicyTestStack } from "../test-ai-behavior-fixtures.js";
import { createCoachAiProvider } from "../coach-provider.factory.js";
import type { DomainAnswer } from "@health/types";

// ---------------------------------------------------------------------------
// Eval gate — skip unless LLM_EVALS=1 AND OPENAI_API_KEY present
// ---------------------------------------------------------------------------

const EVALS_ENABLED =
  process.env["LLM_EVALS"] === "1" && Boolean(process.env["OPENAI_API_KEY"]);

const PASS_THRESHOLD = 0.8;

// ---------------------------------------------------------------------------
// Router golden dataset
// ---------------------------------------------------------------------------

interface RouterCase {
  id: string;
  message: string;
  /** Domain(s) where at least one must appear in selectedDomains. */
  expectedDomains?: Array<"workout" | "nutrition" | "health">;
  /**
   * If true: expect selectedDomains=[] or confidence < 0.55.
   * Used for smalltalk / greetings that should not trigger domain routing.
   */
  expectNoDomains?: boolean;
}

const ROUTER_GOLDEN_CASES: RouterCase[] = [
  // ── Confident single-domain EN ──────────────────────────────────────────
  {
    id: "R-EN-01",
    message: "Create a 3-day strength training plan for me",
    expectedDomains: ["workout"],
  },
  {
    id: "R-EN-02",
    message: "Add a 45-minute cardio session on Wednesday",
    expectedDomains: ["workout"],
  },
  {
    id: "R-EN-03",
    message: "Log that I did 30 minutes of cycling this morning",
    expectedDomains: ["workout"],
  },
  {
    id: "R-EN-04",
    message: "Build me a calorie-deficit nutrition plan for fat loss",
    expectedDomains: ["nutrition"],
  },
  {
    id: "R-EN-05",
    message: "I just ate chicken and rice for lunch, log it",
    expectedDomains: ["nutrition"],
  },
  {
    id: "R-EN-06",
    message: "How should I structure my meal timing around workouts?",
    expectedDomains: ["nutrition"],
  },
  {
    id: "R-EN-07",
    message: "My knee has been hurting after squats — what should I do?",
    expectedDomains: ["health"],
  },
  {
    id: "R-EN-08",
    message: "I haven't been sleeping well this week, it's affecting my training",
    expectedDomains: ["health"],
  },

  // ── Multi-domain EN ──────────────────────────────────────────────────────
  {
    id: "R-EN-09",
    message: "I want to bulk — give me a workout and nutrition plan",
    expectedDomains: ["workout", "nutrition"],
  },
  {
    id: "R-EN-10",
    message: "My back is sore and I want to adjust my workout this week",
    expectedDomains: ["workout", "health"],
  },

  // ── Confident single-domain RU ──────────────────────────────────────────
  {
    id: "R-RU-01",
    message: "Впиши мне сего сразу в план",
    expectedDomains: ["workout"],
  },
  {
    id: "R-RU-02",
    message: "Сделай трен прогу на 3 дня дома",
    expectedDomains: ["workout"],
  },
  {
    id: "R-RU-03",
    message: "Составь мне тренировочный план на неделю",
    expectedDomains: ["workout"],
  },
  {
    id: "R-RU-04",
    message: "Добавь тренировку на понедельник",
    expectedDomains: ["workout"],
  },
  {
    id: "R-RU-05",
    message: "Записать: сегодня пробежал 5 км за 30 минут",
    expectedDomains: ["workout"],
  },
  {
    id: "R-RU-06",
    message: "Что поесть после трени",
    expectedDomains: ["nutrition"],
  },
  {
    id: "R-RU-07",
    message: "Составь план питания для похудения на 1500 калорий",
    expectedDomains: ["nutrition"],
  },
  {
    id: "R-RU-08",
    message: "Запиши: съел гречку с курицей на обед",
    expectedDomains: ["nutrition"],
  },
  {
    id: "R-RU-09",
    message: "У меня болит колено можно ли бегать",
    expectedDomains: ["health"],
  },
  {
    id: "R-RU-10",
    message: "Плохо сплю уже неделю, как это влияет на восстановление?",
    expectedDomains: ["health"],
  },

  // ── Multi-domain RU ──────────────────────────────────────────────────────
  {
    id: "R-RU-11",
    message: "Хочу набрать мышечную массу — нужен план тренировок и питания",
    expectedDomains: ["workout", "nutrition"],
  },
  {
    id: "R-RU-12",
    message: "Болит спина, нужно скорректировать план тренировок",
    expectedDomains: ["workout", "health"],
  },

  // ── Typo-heavy / informal RU ────────────────────────────────────────────
  {
    id: "R-RU-TYPO-01",
    message: "сделой трен прогу на 3 дня дома плиз",
    expectedDomains: ["workout"],
  },
  {
    id: "R-RU-TYPO-02",
    message: "чот поесть пасле трени",
    expectedDomains: ["nutrition"],
  },
  {
    id: "R-RU-TYPO-03",
    message: "колено болит, мона бегат?",
    expectedDomains: ["health"],
  },
  {
    id: "R-RU-TYPO-04",
    message: "впиши мне это в трен план сегодня",
    expectedDomains: ["workout"],
  },

  // ── Mixed-language ───────────────────────────────────────────────────────
  {
    id: "R-MIX-01",
    message: "Make me a workout plan, хочу тренироваться 3 раза в неделю",
    expectedDomains: ["workout"],
  },

  // ── Smalltalk — expect no domain routing ─────────────────────────────────
  {
    id: "R-SM-01",
    message: "How are you?",
    expectNoDomains: true,
  },
  {
    id: "R-SM-02",
    message: "Thanks, that was helpful!",
    expectNoDomains: true,
  },
  {
    id: "R-SM-03",
    message: "Привет",
    expectNoDomains: true,
  },
  {
    id: "R-SM-04",
    message: "Спасибо большое!",
    expectNoDomains: true,
  },
  {
    id: "R-SM-05",
    message: "What is your name?",
    expectNoDomains: true,
  },

  // ── Explicit plan requests (should always route to workout) ──────────────
  {
    id: "R-EN-PLAN-01",
    message: "Make me a plan",
    expectedDomains: ["workout"],
  },
  {
    id: "R-EN-PLAN-02",
    message: "Build my training program for the next month",
    expectedDomains: ["workout"],
  },
  {
    id: "R-RU-PLAN-01",
    message: "Создай мне план тренировок",
    expectedDomains: ["workout"],
  },
  {
    id: "R-RU-PLAN-02",
    message: "Составь программу тренировок",
    expectedDomains: ["workout"],
  },

  // ── Recovery / fatigue signals → health routing ──────────────────────────
  {
    id: "R-EN-HEALTH-01",
    message: "I feel really exhausted and sore — can I still train?",
    expectedDomains: ["health"],
  },
  {
    id: "R-RU-HEALTH-01",
    message: "Очень устал, сильно болят мышцы, тренироваться или нет?",
    expectedDomains: ["health"],
  },

  // ── Nutrition queries in RU ──────────────────────────────────────────────
  {
    id: "R-RU-NUT-01",
    message: "Сколько белка мне нужно в день?",
    expectedDomains: ["nutrition"],
  },
  {
    id: "R-RU-NUT-02",
    message: "Помоги составить рацион на 2000 ккал",
    expectedDomains: ["nutrition"],
  },

  // ── Long-message (>4000 chars) — router truncation regression guard ───────
  {
    id: "R-RU-LONG-01",
    // Deterministic long RU workout program pasted by the user (>4000 chars).
    // Built by repeating week blocks — no random/Date, fully deterministic.
    message: (() => {
      const weekBlock =
        "Неделя X: Пн — Жим лёжа 4×8, Жим гантелей 3×12, Разводка 3×15, Французский жим 3×12. " +
        "Ср — Приседания 4×8, Жим ногами 3×12, Разгибания 3×15, Подъёмы икр 4×20. " +
        "Пт — Тяга штанги 4×6, Подтягивания 3×10, Тяга гантели 3×12, Молоток 3×12. " +
        "Вс — отдых и лёгкая растяжка 20 минут. ";
      const header = "Сохрани мне эту программу тренировок: ";
      // Repeat the week block enough times to exceed 4000 chars.
      let body = "";
      while ((header + body).length < 4_200) {
        body += weekBlock;
      }
      return header + body;
    })(),
    expectedDomains: ["workout"],
  },
];

// ---------------------------------------------------------------------------
// Decision-maker golden dataset
// ---------------------------------------------------------------------------

interface DecisionCase {
  id: string;
  userMessage: string;
  /** Synthetic domain answers to feed to the decision-maker. */
  domainOutputs: DomainAnswer[];
  /** Candidate proposals to select from (id+intent+title+reason). */
  candidateProposals: Array<{ id: string; intent: string; title: string; reason: string }>;
  /** If true the output must have selectedAction !== null and !== 'plain_reply'. */
  expectsProposalAction: boolean;
}

const DECISION_GOLDEN_CASES: DecisionCase[] = [
  {
    id: "D-EN-01",
    userMessage: "Create a 3-day workout plan for me",
    domainOutputs: [
      {
        kind: "domain_answer",
        domain: "workout",
        summary: "Created a 3-day strength plan.",
        candidateProposals: [
          {
            intent: "create_workout_plan",
            title: "3-Day Strength Plan",
            reason: "User requested a new 3-day workout plan.",
            proposedChanges: {
              title: "3-Day Strength Plan",
              summary: "Full-body strength, 3 days",
            },
          },
        ],
        domainSignals: ["explicit_plan_request"],
      },
    ],
    candidateProposals: [
      {
        id: "cand_workout_0",
        intent: "create_workout_plan",
        title: "3-Day Strength Plan",
        reason: "User requested a new 3-day workout plan.",
      },
    ],
    expectsProposalAction: true,
  },
  {
    id: "D-RU-01",
    userMessage: "Составь мне программу тренировок",
    domainOutputs: [
      {
        kind: "domain_answer",
        domain: "workout",
        summary: "Составлена программа тренировок.",
        candidateProposals: [
          {
            intent: "create_workout_plan",
            title: "Программа тренировок",
            reason: "Пользователь запросил новую программу тренировок.",
            proposedChanges: {
              title: "Программа тренировок",
              summary: "Силовая, 3 дня в неделю",
            },
          },
        ],
        domainSignals: ["explicit_plan_request"],
      },
    ],
    candidateProposals: [
      {
        id: "cand_workout_0",
        intent: "create_workout_plan",
        title: "Программа тренировок",
        reason: "Пользователь запросил новую программу тренировок.",
      },
    ],
    expectsProposalAction: true,
  },
  {
    id: "D-EN-02",
    userMessage: "What is a good source of protein?",
    domainOutputs: [
      {
        kind: "domain_answer",
        domain: "nutrition",
        summary: "Discussed protein sources.",
        candidateProposals: [],
        domainSignals: [],
      },
    ],
    candidateProposals: [],
    expectsProposalAction: false,
  },
  {
    id: "D-RU-02",
    userMessage: "Как ты поживаешь?",
    domainOutputs: [
      {
        kind: "domain_answer",
        domain: "health",
        summary: "Общий вопрос, нет предложений.",
        candidateProposals: [],
        domainSignals: [],
      },
    ],
    candidateProposals: [],
    expectsProposalAction: false,
  },
  {
    id: "D-EN-03",
    userMessage: "Create a high-protein nutrition plan for me",
    domainOutputs: [
      {
        kind: "domain_answer",
        domain: "nutrition",
        summary: "Drafted a high-protein nutrition plan.",
        candidateProposals: [
          {
            intent: "create_nutrition_plan",
            title: "High-Protein Nutrition Plan",
            reason: "User requested a nutrition plan focused on protein.",
            proposedChanges: {
              title: "High-Protein Plan",
              summary: "160g protein daily, moderate carbs",
            },
          },
        ],
        domainSignals: ["explicit_plan_request"],
      },
    ],
    candidateProposals: [
      {
        id: "cand_nutrition_0",
        intent: "create_nutrition_plan",
        title: "High-Protein Nutrition Plan",
        reason: "User requested a nutrition plan focused on protein.",
      },
    ],
    expectsProposalAction: true,
  },
  {
    id: "D-RU-03",
    userMessage: "Составь план питания на неделю",
    domainOutputs: [
      {
        kind: "domain_answer",
        domain: "nutrition",
        summary: "Создан план питания на неделю.",
        candidateProposals: [
          {
            intent: "create_nutrition_plan",
            title: "Рацион на неделю",
            reason: "Пользователь запросил план питания на неделю.",
            proposedChanges: {
              title: "Рацион на неделю",
              summary: "Сбалансированный рацион, 2000 ккал",
            },
          },
        ],
        domainSignals: ["explicit_plan_request"],
      },
    ],
    candidateProposals: [
      {
        id: "cand_nutrition_0",
        intent: "create_nutrition_plan",
        title: "Рацион на неделю",
        reason: "Пользователь запросил план питания на неделю.",
      },
    ],
    expectsProposalAction: true,
  },
  {
    id: "D-EN-04",
    userMessage: "Tell me about the benefits of sleep for recovery",
    domainOutputs: [
      {
        kind: "domain_answer",
        domain: "health",
        summary: "Explained sleep and recovery benefits.",
        candidateProposals: [],
        domainSignals: [],
      },
    ],
    candidateProposals: [],
    expectsProposalAction: false,
  },
  {
    id: "D-MULTI-01",
    userMessage: "I want to bulk — workout and nutrition plan please",
    domainOutputs: [
      {
        kind: "domain_answer",
        domain: "workout",
        summary: "Created a bulking workout plan.",
        candidateProposals: [
          {
            intent: "create_workout_plan",
            title: "Bulking Workout Plan",
            reason: "User wants to bulk up.",
            proposedChanges: { title: "Bulking Workout Plan", summary: "4-day hypertrophy split" },
          },
        ],
        domainSignals: ["explicit_plan_request"],
      },
      {
        kind: "domain_answer",
        domain: "nutrition",
        summary: "Created a caloric surplus nutrition plan.",
        candidateProposals: [
          {
            intent: "create_nutrition_plan",
            title: "Bulking Nutrition Plan",
            reason: "User wants a calorie surplus for muscle gain.",
            proposedChanges: { title: "Bulking Plan", summary: "500 kcal surplus, high protein" },
          },
        ],
        domainSignals: ["explicit_plan_request"],
      },
    ],
    candidateProposals: [
      {
        id: "cand_workout_0",
        intent: "create_workout_plan",
        title: "Bulking Workout Plan",
        reason: "User wants to bulk up.",
      },
      {
        id: "cand_nutrition_0",
        intent: "create_nutrition_plan",
        title: "Bulking Nutrition Plan",
        reason: "User wants a calorie surplus for muscle gain.",
      },
    ],
    expectsProposalAction: true,
  },

  // ── Long-message (>4000 chars) — decision-maker regression guard ──────────
  {
    id: "D-RU-LONG-01",
    // Same long workout program message used in R-RU-LONG-01.
    // Verifies that the decision-maker accepts the create_workout_plan candidate
    // when the userMessage is larger than the old 4000-char cap.
    userMessage: (() => {
      const weekBlock =
        "Неделя X: Пн — Жим лёжа 4×8, Жим гантелей 3×12, Разводка 3×15, Французский жим 3×12. " +
        "Ср — Приседания 4×8, Жим ногами 3×12, Разгибания 3×15, Подъёмы икр 4×20. " +
        "Пт — Тяга штанги 4×6, Подтягивания 3×10, Тяга гантели 3×12, Молоток 3×12. " +
        "Вс — отдых и лёгкая растяжка 20 минут. ";
      const header = "Сохрани мне эту программу тренировок: ";
      let body = "";
      while ((header + body).length < 4_200) {
        body += weekBlock;
      }
      return header + body;
    })(),
    domainOutputs: [
      {
        kind: "domain_answer",
        domain: "workout",
        summary: "Пользователь прислал подробную программу тренировок для сохранения.",
        candidateProposals: [
          {
            intent: "create_workout_plan",
            title: "Пользовательская программа тренировок",
            reason: "Пользователь явно просит сохранить его программу тренировок.",
            proposedChanges: {
              title: "Пользовательская программа тренировок",
              summary: "Силовая программа, 3 дня в неделю.",
            },
          },
        ],
        domainSignals: ["explicit_plan_request"],
      },
    ],
    candidateProposals: [
      {
        id: "cand_workout_0",
        intent: "create_workout_plan",
        title: "Пользовательская программа тренировок",
        reason: "Пользователь явно просит сохранить его программу тренировок.",
      },
    ],
    expectsProposalAction: true,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CaseState = "pass" | "fail" | "error";

/** Print a per-case pass/fail/error table to stdout with final pass-rate line. */
function printCaseSummary(
  label: string,
  results: Array<{ id: string; state: CaseState; reason?: string }>,
): void {
  const errorCount = results.filter((r) => r.state === "error").length;
  const scoredResults = results.filter((r) => r.state !== "error");
  const passedCount = scoredResults.filter((r) => r.state === "pass").length;

  console.log(`\n=== ${label} golden eval: ${results.length} cases (${errorCount} errored, excluded from rate) ===`);

  for (const result of results) {
    const icon =
      result.state === "pass" ? "PASS" : result.state === "error" ? "ERROR" : "FAIL";
    const suffix = result.reason ? ` — ${result.reason}` : "";
    console.log(`  [${icon}] ${result.id}${suffix}`);
  }

  if (scoredResults.length === 0) {
    console.log(`\nResult: 0/0 scored — all cases errored\n`);
  } else {
    const passRate = passedCount / scoredResults.length;
    console.log(
      `\nResult: ${passedCount}/${scoredResults.length} passed (${errorCount} errored, not counted) — ` +
        `${(passRate * 100).toFixed(1)}% (threshold: ${PASS_THRESHOLD * 100}%)\n`,
    );
  }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe.skipIf(!EVALS_ENABLED)(
  "LLM golden evals (live-API gate: LLM_EVALS=1)",
  () => {
    let routerService: RouterLlmService;
    let preprocessorService: MessagePreprocessorService;
    let decisionMakerService: DecisionMakerExecutorService;

    beforeAll(() => {
      // createAiPolicyTestStack() uses only in-memory defaults — no DB or env needed.
      const stack = createAiPolicyTestStack();

      // RouterLlmService calls createCoachAiProvider() (env-based) in its constructor.
      // With LLM_EVALS=1 the OPENAI_API_KEY is present, so this connects to OpenAI.
      routerService = new RouterLlmService(
        stack.aiBehaviorConfigService,
        stack.capabilityRegistryService,
      );

      // MessagePreprocessorService takes DirectChatPathMatcherService.
      preprocessorService = new MessagePreprocessorService(stack.directChatPathMatcherService);

      decisionMakerService = new DecisionMakerExecutorService();
    });

    // -------------------------------------------------------------------------
    // Router golden set
    // -------------------------------------------------------------------------

    it(
      "router golden set: ≥80% route to expected domain(s)",
      async () => {
        const caseResults: Array<{ id: string; state: CaseState; reason?: string }> = [];

        for (const caseItem of ROUTER_GOLDEN_CASES) {
          const preprocessorResult = preprocessorService.preprocess({
            userMessage: caseItem.message,
            hasAttachments: false,
            responseLanguageHint: null,
          });

          const result = await routerService.route({ preprocessorResult });

          // Provider failure: source="fallback" means the LLM call failed (e.g. 401,
          // network error). Mark as error — excluded from pass-rate denominator.
          if (result.source === "fallback") {
            caseResults.push({
              id: caseItem.id,
              state: "error",
              reason: `provider fallback (source=fallback) — likely auth/network failure`,
            });
            continue;
          }

          const selectedDomainNames = result.output.selectedDomains.map((d) => d.domain);
          const confidence = result.output.confidence;

          let state: CaseState;
          let reason: string | undefined;

          if (caseItem.expectNoDomains) {
            const passed = selectedDomainNames.length === 0 || confidence < 0.55;
            state = passed ? "pass" : "fail";
            if (!passed) {
              reason = `Expected no domains (or low confidence) but got [${selectedDomainNames.join(",")}] confidence=${confidence.toFixed(2)}`;
            }
          } else if (caseItem.expectedDomains && caseItem.expectedDomains.length > 0) {
            const hasExpected = caseItem.expectedDomains.some((d) =>
              selectedDomainNames.includes(d),
            );
            const isConfident = confidence >= 0.6;
            state = hasExpected && isConfident ? "pass" : "fail";
            if (state === "fail") {
              reason = `Expected [${caseItem.expectedDomains.join(",")}] with confidence≥0.6 but got [${selectedDomainNames.join(",")}] confidence=${confidence.toFixed(2)}`;
            }
          } else {
            // No specific assertion — auto-pass
            state = "pass";
          }

          caseResults.push({ id: caseItem.id, state, reason });
        }

        printCaseSummary("Router", caseResults);

        // A run where any case errored (provider unavailable) must fail explicitly.
        const errorCount = caseResults.filter((r) => r.state === "error").length;
        if (errorCount > 0) {
          const total = caseResults.length;
          throw new Error(
            `provider unavailable: ${errorCount}/${total} cases errored — check OPENAI_API_KEY`,
          );
        }

        const passedCount = caseResults.filter((r) => r.state === "pass").length;
        const scoredCount = caseResults.filter((r) => r.state !== "error").length;
        const passRate = passedCount / scoredCount;
        expect(passRate).toBeGreaterThanOrEqual(PASS_THRESHOLD);
      },
      // 40 sequential LLM calls — generous timeout
      180_000,
    );

    // -------------------------------------------------------------------------
    // Decision-maker golden set
    // -------------------------------------------------------------------------

    it(
      "decision-maker golden set: ≥80% produce correct proposal vs plain-reply selection",
      async () => {
        // createCoachAiProvider() reads AI_COACH_PROVIDER + OPENAI_API_KEY from env.
        const provider = createCoachAiProvider();

        const actionVariantCatalog = [
          {
            id: "plain_reply",
            label: "Plain reply",
            description: "No structured action needed — reply only.",
            requiresConsent: false,
          },
          {
            id: "create_workout_plan",
            label: "Create workout plan",
            description: "Create a new structured workout plan for the user.",
            requiresConsent: false,
          },
          {
            id: "create_nutrition_plan",
            label: "Create nutrition plan",
            description: "Create a new structured nutrition plan for the user.",
            requiresConsent: false,
          },
        ];

        const caseResults: Array<{ id: string; state: CaseState; reason?: string }> = [];

        for (const caseItem of DECISION_GOLDEN_CASES) {
          const decisionResult = await decisionMakerService.execute({
            userMessage: caseItem.userMessage,
            domainOutputs: caseItem.domainOutputs,
            candidateProposalSummaries: caseItem.candidateProposals,
            actionVariantCatalog,
            safetyFlags: [],
            safetyConstraints: ["Do not diagnose, prescribe, or claim to treat diseases."],
            provider,
            responseLanguage: null,
          });

          // Provider failure: degraded=true means the LLM call failed (e.g. 401,
          // network error). Mark as error — excluded from pass-rate denominator.
          if (decisionResult.degraded) {
            caseResults.push({
              id: caseItem.id,
              state: "error",
              reason: `provider degraded — ${decisionResult.degradedReasons.join("; ") || "unknown"}`,
            });
            continue;
          }

          const selectedAction = decisionResult.output.selectedAction;
          const isProposal = selectedAction !== null && selectedAction !== "plain_reply";

          const state: CaseState = (caseItem.expectsProposalAction ? isProposal : !isProposal)
            ? "pass"
            : "fail";
          const reason =
            state === "fail"
              ? caseItem.expectsProposalAction
                ? `Expected proposal action but got selectedAction=${String(selectedAction)}`
                : `Expected plain reply but got selectedAction=${String(selectedAction)}`
              : undefined;

          caseResults.push({ id: caseItem.id, state, reason });
        }

        printCaseSummary("Decision-maker", caseResults);

        // A run where any case errored (provider unavailable) must fail explicitly.
        const errorCount = caseResults.filter((r) => r.state === "error").length;
        if (errorCount > 0) {
          const total = caseResults.length;
          throw new Error(
            `provider unavailable: ${errorCount}/${total} cases errored — check OPENAI_API_KEY`,
          );
        }

        const passedCount = caseResults.filter((r) => r.state === "pass").length;
        const scoredCount = caseResults.filter((r) => r.state !== "error").length;
        const passRate = passedCount / scoredCount;
        expect(passRate).toBeGreaterThanOrEqual(PASS_THRESHOLD);
      },
      90_000,
    );
  },
);
