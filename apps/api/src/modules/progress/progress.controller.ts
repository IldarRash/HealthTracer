import { generateWeeklyProgressSummarySchema, weeklyReviewRequestSchema } from "@health/types";
import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { ClerkAuthGuard } from "../../auth.guard.js";
import { parseBody } from "../../common/zod.js";
import { CurrentAuth } from "../../current-auth.decorator.js";
import { ProgressService } from "./progress.service.js";
import { ProgressWeeklyReviewService } from "./progress-weekly-review.service.js";

@Controller("progress")
@UseGuards(ClerkAuthGuard)
export class ProgressController {
  constructor(
    private readonly progressService: ProgressService,
    private readonly progressWeeklyReviewService: ProgressWeeklyReviewService,
  ) {}

  @Get("weekly/latest")
  getLatestSummary(@CurrentAuth() auth: ClerkAuthContext) {
    return this.progressService.getLatestSummary(auth);
  }

  @Get("weekly/current")
  getCurrentWeekSummary(@CurrentAuth() auth: ClerkAuthContext) {
    return this.progressService.getCurrentWeekSummary(auth);
  }

  @Post("weekly/generate")
  generateWeeklySummary(@CurrentAuth() auth: ClerkAuthContext, @Body() body: unknown) {
    return this.progressService.generateWeeklySummary(
      auth,
      parseBody(generateWeeklyProgressSummarySchema, body ?? {}),
    );
  }

  @Post("weekly/review")
  buildWeeklyReview(@CurrentAuth() auth: ClerkAuthContext, @Body() body: unknown) {
    const input = parseBody(weeklyReviewRequestSchema, body ?? {});

    return this.progressWeeklyReviewService.buildWeeklyReview(auth, input);
  }
}
