import type { AiStructuredOutput } from "@health/types";

export interface CoachAiRequest {
  readonly userMessage: string;
  readonly recentMessages: ReadonlyArray<{
    readonly role: "user" | "assistant" | "system";
    readonly content: string;
  }>;
  readonly coachingContext: Record<string, unknown>;
}

export interface CoachAiProvider {
  generateCoachResponse(request: CoachAiRequest): Promise<AiStructuredOutput>;
}

const SAFE_DEFAULT_REPLY =
  "Thanks for sharing that. I can help with wellness coaching, habit planning, and structured suggestions you can review before anything changes.";

export class StubCoachAiProvider implements CoachAiProvider {
  async generateCoachResponse(request: CoachAiRequest): Promise<AiStructuredOutput> {
    const normalized = request.userMessage.toLowerCase();

    if (normalized.includes("workout") || normalized.includes("training")) {
      return {
        reply:
          "I can suggest a simple strength plan you can review first. Nothing changes until you accept the proposal.",
        proposals: [
          {
            intent: "create_workout_plan",
            targetDomain: "workout",
            title: "Start a three day strength plan",
            reason: "This gives you a repeatable weekly structure to build consistency.",
            proposedChanges: {
              title: "Three day strength base",
              summary: "A simple weekly structure for consistent training.",
              days: [
                {
                  day: "Monday",
                  focus: "Full body strength",
                  exercises: ["Goblet squat", "Push-up"],
                },
                {
                  day: "Wednesday",
                  focus: "Conditioning",
                  exercises: ["Brisk walk", "Plank"],
                },
                {
                  day: "Friday",
                  focus: "Full body strength",
                  exercises: ["Romanian deadlift", "Row"],
                },
              ],
            },
          },
        ],
      };
    }

    if (normalized.includes("nutrition") || normalized.includes("meal")) {
      return {
        reply:
          "Here is a starter nutrition plan outline you can approve or reject before it is saved.",
        proposals: [
          {
            intent: "create_nutrition_plan",
            targetDomain: "nutrition",
            title: "Balanced daily nutrition base",
            reason: "This provides a simple macro and hydration starting point.",
            proposedChanges: {
              title: "Balanced daily nutrition base",
              summary: "A moderate starting point focused on consistency.",
              caloriesPerDay: 2200,
              proteinGrams: 140,
              carbsGrams: 220,
              fatGrams: 70,
              hydrationLiters: 2.5,
              notes: ["Prioritize whole foods and regular meal timing."],
            },
          },
        ],
      };
    }

    if (normalized.includes("today") || normalized.includes("checklist")) {
      return {
        reply: "I drafted a Today checklist you can review before it is saved.",
        proposals: [
          {
            intent: "create_today_checklist",
            targetDomain: "today",
            title: "Today wellness checklist",
            reason: "Small daily actions can support your active goals.",
            proposedChanges: {
              date: new Date().toISOString().slice(0, 10),
              items: [
                { label: "Drink water", kind: "hydration", completed: false },
                { label: "Move for 20 minutes", kind: "workout", completed: false },
              ],
            },
          },
        ],
      };
    }

    return {
      reply: SAFE_DEFAULT_REPLY,
      proposals: [],
    };
  }
}
