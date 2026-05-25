import {
  upsertWellbeingCheckInSchema,
  wellbeingCheckInAggregatesQuerySchema,
  wellbeingCheckInHistoryQuerySchema,
} from "@health/types";
import { Body, Controller, Get, Param, Put, Query, UseGuards } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { ClerkAuthGuard } from "../../auth.guard.js";
import { parseBody, parseQuery } from "../../common/zod.js";
import { CurrentAuth } from "../../current-auth.decorator.js";
import { WellbeingCheckInsService } from "./wellbeing-check-ins.service.js";

@Controller("wellbeing-check-ins")
@UseGuards(ClerkAuthGuard)
export class WellbeingCheckInsController {
  constructor(private readonly wellbeingCheckInsService: WellbeingCheckInsService) {}

  @Get("today")
  getTodayCheckIn(@CurrentAuth() auth: ClerkAuthContext) {
    return this.wellbeingCheckInsService.getCheckInForToday(auth);
  }

  @Put("today")
  upsertTodayCheckIn(@CurrentAuth() auth: ClerkAuthContext, @Body() body: unknown) {
    return this.wellbeingCheckInsService.upsertCheckInForToday(
      auth,
      parseBody(upsertWellbeingCheckInSchema, body),
    );
  }

  @Get("history")
  getHistory(@CurrentAuth() auth: ClerkAuthContext, @Query() query: unknown) {
    return this.wellbeingCheckInsService.getHistory(
      auth,
      parseQuery(wellbeingCheckInHistoryQuerySchema, query),
    );
  }

  @Get("aggregates")
  getAggregates(@CurrentAuth() auth: ClerkAuthContext, @Query() query: unknown) {
    return this.wellbeingCheckInsService.getAggregates(
      auth,
      parseQuery(wellbeingCheckInAggregatesQuerySchema, query),
    );
  }

  @Get(":date")
  getCheckInByDate(@CurrentAuth() auth: ClerkAuthContext, @Param("date") date: string) {
    return this.wellbeingCheckInsService.getCheckInForDate(auth, date);
  }

  @Put(":date")
  upsertCheckInByDate(
    @CurrentAuth() auth: ClerkAuthContext,
    @Param("date") date: string,
    @Body() body: unknown,
  ) {
    return this.wellbeingCheckInsService.upsertCheckInForDate(
      auth,
      date,
      parseBody(upsertWellbeingCheckInSchema, body),
    );
  }
}
