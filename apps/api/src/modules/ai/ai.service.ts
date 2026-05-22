import {
  parseAiStructuredOutput,
  StubCoachAiProvider,
  validateReplySafety,
  type CoachAiProvider,
} from "@health/ai";
import type { AiStructuredOutput } from "@health/types";
import { Injectable } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { CoachingContextService } from "../coaching-context/coaching-context.service.js";

const SAFE_FALLBACK_REPLY =
  "I could not safely process that response. Please try again with a wellness-focused question.";

export interface GenerateCoachResponseInput {
  auth: ClerkAuthContext;
  userMessage: string;
  recentMessages: ReadonlyArray<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
}

export interface GeneratedCoachResponse {
  output: AiStructuredOutput;
  parseErrors: string[];
  replySafetyErrors: string[];
}

@Injectable()
export class AiService {
  private readonly provider: CoachAiProvider = new StubCoachAiProvider();

  constructor(private readonly coachingContextService: CoachingContextService) {}

  async generateCoachResponse(
    input: GenerateCoachResponseInput,
  ): Promise<GeneratedCoachResponse> {
    const snapshot = await this.coachingContextService.buildSnapshot(input.auth);
    const rawOutput = await this.provider.generateCoachResponse({
      userMessage: input.userMessage,
      recentMessages: input.recentMessages,
      coachingContext: this.coachingContextService.toPromptContext(snapshot),
    });

    const parsed = parseAiStructuredOutput(rawOutput);

    if (!parsed.ok) {
      return {
        output: { reply: SAFE_FALLBACK_REPLY, proposals: [] },
        parseErrors: parsed.errors,
        replySafetyErrors: [],
      };
    }

    const replySafetyErrors = validateReplySafety(parsed.value.reply);

    if (replySafetyErrors.length > 0) {
      return {
        output: { reply: SAFE_FALLBACK_REPLY, proposals: [] },
        parseErrors: [],
        replySafetyErrors,
      };
    }

    return {
      output: parsed.value,
      parseErrors: [],
      replySafetyErrors: [],
    };
  }
}
