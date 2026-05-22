import {
  todayHistoryQuerySchema,
  updateTodayFeedbackSchema,
  updateTodayItemStatusSchema,
} from "@health/types";
import { Controller, Get, Param, Patch, Query, Body, UseGuards } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { ClerkAuthGuard } from "../../auth.guard.js";
import { parseBody, parseQuery } from "../../common/zod.js";
import { CurrentAuth } from "../../current-auth.decorator.js";
import { TodayService } from "./today.service.js";

@Controller("today")
@UseGuards(ClerkAuthGuard)
export class TodayController {
  constructor(private readonly todayService: TodayService) {}

  @Get("history")
  getRecentHistory(@CurrentAuth() auth: ClerkAuthContext, @Query() query: unknown) {
    const { limit } = parseQuery(todayHistoryQuerySchema, query);

    return this.todayService.getRecentHistory(auth, limit);
  }

  @Get(":date")
  getDay(@CurrentAuth() auth: ClerkAuthContext, @Param("date") date: string) {
    return this.todayService.getOrGenerateDay(auth, date);
  }

  @Patch(":date/items/:itemId")
  updateItemStatus(
    @CurrentAuth() auth: ClerkAuthContext,
    @Param("date") date: string,
    @Param("itemId") itemId: string,
    @Body() body: unknown,
  ) {
    return this.todayService.updateItemStatus(
      auth,
      date,
      itemId,
      parseBody(updateTodayItemStatusSchema, body),
    );
  }

  @Patch(":date/feedback")
  updateFeedback(
    @CurrentAuth() auth: ClerkAuthContext,
    @Param("date") date: string,
    @Body() body: unknown,
  ) {
    return this.todayService.updateFeedback(auth, date, parseBody(updateTodayFeedbackSchema, body));
  }
}
