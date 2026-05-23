import type {
  CreateExerciseInput,
  Exercise,
  ExerciseListQuery,
  ExerciseListResponse,
} from "@health/types";
import { buildExerciseDedupeKeyFromName, createExerciseInputSchema } from "@health/types";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { UsersService } from "../users/users.service.js";
import { assertExerciseRow, toExercise } from "./exercise.mapper.js";
import { ExercisesRepository } from "./exercises.repository.js";

@Injectable()
export class ExercisesService {
  constructor(
    private readonly exercisesRepository: ExercisesRepository,
    private readonly usersService: UsersService,
  ) {}

  async listExercises(
    filters: ExerciseListQuery,
    auth?: ClerkAuthContext,
  ): Promise<ExerciseListResponse> {
    const userId = auth ? (await this.usersService.resolveFromAuth(auth)).id : null;
    const rows = await this.exercisesRepository.listActiveExercises(filters, userId);

    return {
      exercises: rows.map(toExercise),
    };
  }

  async getExercise(exerciseId: string, auth?: ClerkAuthContext): Promise<Exercise> {
    const userId = auth ? (await this.usersService.resolveFromAuth(auth)).id : null;
    const row = await this.exercisesRepository.findActiveExerciseById(exerciseId, userId);

    if (!row) {
      throw new NotFoundException("Exercise not found.");
    }

    return toExercise(row);
  }

  async createExercise(auth: ClerkAuthContext, input: CreateExerciseInput): Promise<Exercise> {
    const parsed = createExerciseInputSchema.parse(input);
    const user = await this.usersService.resolveFromAuth(auth);

    return this.findOrCreateExercise({
      ...parsed,
      userId: user.id,
    });
  }

  async findOrCreateExercise(
    input: CreateExerciseInput & { userId: string | null },
  ): Promise<Exercise> {
    const parsed = createExerciseInputSchema.parse(input);
    const dedupeKey = buildExerciseDedupeKeyFromName({
      name: parsed.name,
      equipment: parsed.equipment,
      primaryMuscles: parsed.primaryMuscles,
    });
    const existing = await this.exercisesRepository.findActiveByDedupeKey(
      dedupeKey,
      input.userId,
    );

    if (existing) {
      return toExercise(existing);
    }

    const created = await this.exercisesRepository.createExercise({
      ...parsed,
      userId: input.userId,
    });

    return toExercise(assertExerciseRow(created));
  }

  async resolveExerciseIds(
    exerciseIds: string[],
    userId: string,
  ): Promise<Exercise[]> {
    const rows = await this.exercisesRepository.findActiveExercisesByIds(
      exerciseIds,
      userId,
    );

    if (rows.length !== exerciseIds.length) {
      throw new BadRequestException("One or more exercises were not found in the catalog.");
    }

    return rows.map(toExercise);
  }

  async findInaccessibleExerciseIds(
    exerciseIds: readonly string[],
    userId: string,
  ): Promise<string[]> {
    if (exerciseIds.length === 0) {
      return [];
    }

    const uniqueIds = [...new Set(exerciseIds)];
    const rows = await this.exercisesRepository.findActiveExercisesByIds(uniqueIds, userId);
    const accessibleIds = new Set(rows.map((row) => row.id));

    return uniqueIds.filter((exerciseId) => !accessibleIds.has(exerciseId));
  }
}
