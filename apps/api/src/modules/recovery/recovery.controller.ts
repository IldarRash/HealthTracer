import {
  recoveryContextQuerySchema,
  recoveryWeeklyContextQuerySchema,
  upsertRecoveryCheckInSchema,
} from "@health/types";
import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { ClerkAuthGuard } from "../../auth.guard.js";
import { parseBody, parseQuery } from "../../common/zod.js";
import { CurrentAuth } from "../../current-auth.decorator.js";
import { RecoveryContextService } from "./recovery-context.service.js";

@Controller("recovery")
@UseGuards(ClerkAuthGuard)
export class RecoveryController {
  constructor(private readonly recoveryContextService: RecoveryContextService) {}

  @Get("context")
  getContext(@CurrentAuth() auth: ClerkAuthContext, @Query() query: unknown) {
    const parsedQuery = parseQuery(recoveryContextQuerySchema, query);

    return this.recoveryContextService.getContextForDate(auth, parsedQuery.date);
  }

  @Get("context/weekly")
  getWeeklyContext(@CurrentAuth() auth: ClerkAuthContext, @Query() query: unknown) {
    const parsedQuery = parseQuery(recoveryWeeklyContextQuerySchema, query);

    return this.recoveryContextService.getWeeklyContext(auth, parsedQuery.weekStart);
  }

  @Post("check-in")
  upsertCheckIn(@CurrentAuth() auth: ClerkAuthContext, @Body() body: unknown) {
    return this.recoveryContextService.upsertCheckIn(
      auth,
      parseBody(upsertRecoveryCheckInSchema, body),
    );
  }
}
