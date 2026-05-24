import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { ClerkAuthGuard } from "../../auth.guard.js";
import { parseQuery } from "../../common/zod.js";
import { CurrentAuth } from "../../current-auth.decorator.js";
import { habitAdherenceQuerySchema } from "@health/types";
import { HabitsService } from "./habits.service.js";

@Controller("habits")
@UseGuards(ClerkAuthGuard)
export class HabitsController {
  constructor(private readonly habitsService: HabitsService) {}

  @Get("templates")
  listTemplates() {
    return this.habitsService.listTemplates();
  }

  @Get("plan")
  getActivePlan(@CurrentAuth() auth: ClerkAuthContext) {
    return this.habitsService.getCurrentActivePlan(auth);
  }

  @Get("plan/revisions")
  listRevisions(@CurrentAuth() auth: ClerkAuthContext) {
    return this.habitsService.listCurrentRevisions(auth);
  }

  @Get("adherence")
  getAdherence(@CurrentAuth() auth: ClerkAuthContext, @Query() query: unknown) {
    const { window } = parseQuery(habitAdherenceQuerySchema, query);

    return this.habitsService.getAdherence(auth, window);
  }
}
