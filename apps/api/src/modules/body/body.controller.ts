import type {
  BodyCompositionAnalysis,
  BodyCompositionAnalysisResponse,
} from "@health/types";
import { Controller, Get, UseGuards } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { ClerkAuthGuard } from "../../auth.guard.js";
import { CurrentAuth } from "../../current-auth.decorator.js";
import { UsersService } from "../users/users.service.js";
import { BodyService } from "./body.service.js";

@Controller("body")
@UseGuards(ClerkAuthGuard)
export class BodyController {
  constructor(
    private readonly bodyService: BodyService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * GET /body/analysis/latest
   * Returns the most recent body-composition analysis for the authenticated user.
   * Ownership-scoped; numbers only — photos are never stored or returned.
   */
  @Get("analysis/latest")
  async getLatestAnalysis(
    @CurrentAuth() auth: ClerkAuthContext,
  ): Promise<BodyCompositionAnalysisResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const analysis = await this.bodyService.getLatestAnalysis(user.id);

    return { analysis };
  }

  /**
   * GET /body/analysis
   * Returns all body-composition analyses for the authenticated user (newest first).
   */
  @Get("analysis")
  async listAnalyses(
    @CurrentAuth() auth: ClerkAuthContext,
  ): Promise<{ analyses: BodyCompositionAnalysis[] }> {
    const user = await this.usersService.resolveFromAuth(auth);
    const analyses = await this.bodyService.listAnalyses(user.id);

    return { analyses };
  }
}
