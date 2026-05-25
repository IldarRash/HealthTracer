import { createGoalSchema, goalListQuerySchema, updateGoalSchema } from "@health/types";
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { ClerkAuthGuard } from "../../auth.guard.js";
import { parseBody, parseQuery } from "../../common/zod.js";
import { CurrentAuth } from "../../current-auth.decorator.js";
import { GoalsService } from "./goals.service.js";

@Controller("goals")
@UseGuards(ClerkAuthGuard)
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Get()
  listGoals(@CurrentAuth() auth: ClerkAuthContext, @Query() query: unknown) {
    return this.goalsService.listCurrentGoals(
      auth,
      parseQuery(goalListQuerySchema, query),
    );
  }

  @Post()
  createGoal(@CurrentAuth() auth: ClerkAuthContext, @Body() body: unknown) {
    return this.goalsService.createCurrentGoal(
      auth,
      parseBody(createGoalSchema, body),
    );
  }

  @Patch(":goalId")
  updateGoal(
    @CurrentAuth() auth: ClerkAuthContext,
    @Param("goalId") goalId: string,
    @Body() body: unknown,
  ) {
    return this.goalsService.updateCurrentGoal(
      auth,
      goalId,
      parseBody(updateGoalSchema, body),
    );
  }
}
