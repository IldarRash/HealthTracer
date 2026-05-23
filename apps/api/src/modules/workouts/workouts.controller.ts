import {
  completeWorkoutSessionSchema,
  scheduleWorkoutSessionSchema,
  updateWorkoutSessionExerciseSchema,
} from "@health/types";
import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { ClerkAuthGuard } from "../../auth.guard.js";
import { parseBody } from "../../common/zod.js";
import { CurrentAuth } from "../../current-auth.decorator.js";
import { WorkoutsService } from "./workouts.service.js";

@Controller("workouts")
@UseGuards(ClerkAuthGuard)
export class WorkoutsController {
  constructor(private readonly workoutsService: WorkoutsService) {}

  @Get("active")
  getActivePlan(@CurrentAuth() auth: ClerkAuthContext) {
    return this.workoutsService.getCurrentActivePlan(auth);
  }

  @Get("revisions")
  listRevisions(@CurrentAuth() auth: ClerkAuthContext) {
    return this.workoutsService.listCurrentRevisions(auth);
  }

  @Post("sessions")
  scheduleSession(@CurrentAuth() auth: ClerkAuthContext, @Body() body: unknown) {
    return this.workoutsService.scheduleCurrentSession(
      auth,
      parseBody(scheduleWorkoutSessionSchema, body),
    );
  }

  @Patch("sessions/:sessionId/complete")
  completeSession(
    @CurrentAuth() auth: ClerkAuthContext,
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
  ) {
    return this.workoutsService.completeCurrentSession(
      auth,
      sessionId,
      parseBody(completeWorkoutSessionSchema, body),
    );
  }

  @Post("today/:date/start")
  startTodayWorkout(@CurrentAuth() auth: ClerkAuthContext, @Param("date") date: string) {
    return this.workoutsService.startTodayWorkoutSession(auth, date);
  }

  @Patch("sessions/:sessionId/exercises/:exerciseId")
  updateSessionExercise(
    @CurrentAuth() auth: ClerkAuthContext,
    @Param("sessionId") sessionId: string,
    @Param("exerciseId") exerciseId: string,
    @Body() body: unknown,
  ) {
    return this.workoutsService.updateSessionExercise(
      auth,
      sessionId,
      exerciseId,
      parseBody(updateWorkoutSessionExerciseSchema, body),
    );
  }
}
