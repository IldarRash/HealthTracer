import {
  exerciseListQuerySchema,
  createExerciseInputSchema,
} from "@health/types";
import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { ClerkAuthGuard } from "../../auth.guard.js";
import { parseBody } from "../../common/zod.js";
import { CurrentAuth } from "../../current-auth.decorator.js";
import { ExercisesService } from "./exercises.service.js";

function parseExerciseListQuery(query: Record<string, unknown>) {
  const parsed = exerciseListQuerySchema.safeParse({
    search: query.search,
    equipment:
      typeof query.equipment === "string"
        ? query.equipment.split(",").filter(Boolean)
        : query.equipment,
    primaryMuscle: query.primaryMuscle,
    movementPattern: query.movementPattern,
    difficulty: query.difficulty,
    source: query.source,
    includeUserCreated: query.includeUserCreated,
  });

  if (!parsed.success) {
    return exerciseListQuerySchema.parse({});
  }

  return parsed.data;
}

@Controller("exercises")
@UseGuards(ClerkAuthGuard)
export class ExercisesController {
  constructor(private readonly exercisesService: ExercisesService) {}

  @Get()
  listExercises(
    @CurrentAuth() auth: ClerkAuthContext,
    @Query() query: Record<string, unknown>,
  ) {
    return this.exercisesService.listExercises(parseExerciseListQuery(query), auth);
  }

  @Post()
  createExercise(@CurrentAuth() auth: ClerkAuthContext, @Body() body: unknown) {
    return this.exercisesService.createExercise(
      auth,
      parseBody(createExerciseInputSchema, body),
    );
  }

  @Get(":exerciseId")
  getExercise(
    @CurrentAuth() auth: ClerkAuthContext,
    @Param("exerciseId") exerciseId: string,
  ) {
    return this.exercisesService.getExercise(exerciseId, auth);
  }
}
