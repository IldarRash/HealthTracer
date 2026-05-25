import { onboardingSchema } from "@health/types";
import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { ClerkAuthGuard } from "../../auth.guard.js";
import { parseBody } from "../../common/zod.js";
import { CurrentAuth } from "../../current-auth.decorator.js";
import { OnboardingService } from "./onboarding.service.js";

@Controller("onboarding")
@UseGuards(ClerkAuthGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post()
  completeOnboarding(@CurrentAuth() auth: ClerkAuthContext, @Body() body: unknown) {
    return this.onboardingService.completeOnboarding(
      auth,
      parseBody(onboardingSchema, body),
    );
  }
}
