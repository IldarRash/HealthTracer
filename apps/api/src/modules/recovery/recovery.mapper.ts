import type { recoveryCheckIns, recoveryContextSnapshots } from "@health/db";
import {
  recoveryCheckInRecordSchema,
  recoveryContextPayloadSchema,
  recoveryContextSnapshotSchema,
  type RecoveryCheckInRecord,
  type RecoveryContextPayload,
  type RecoveryContextSnapshot,
  type UpsertRecoveryCheckInInput,
} from "@health/types";
import { InternalServerErrorException } from "@nestjs/common";

type RecoveryCheckInRow = typeof recoveryCheckIns.$inferSelect;
type RecoveryContextSnapshotRow = typeof recoveryContextSnapshots.$inferSelect;

function parseStoredValue<T>(
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
  value: unknown,
  field: string,
): T {
  const result = schema.safeParse(value);

  if (!result.success || result.data === undefined) {
    throw new InternalServerErrorException(`Invalid stored recovery ${field}.`);
  }

  return result.data;
}

export function toRecoveryCheckInRecord(row: RecoveryCheckInRow): RecoveryCheckInRecord {
  return recoveryCheckInRecordSchema.parse({
    id: row.id,
    userId: row.userId,
    date: row.date,
    soreness: row.soreness,
    fatigue: row.fatigue,
    moodScore: row.moodScore,
    perceivedStress: row.perceivedStress,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export function toRecoveryContextSnapshot(row: RecoveryContextSnapshotRow): RecoveryContextSnapshot {
  const payload = parseStoredValue(recoveryContextPayloadSchema, row.payload, "context payload");

  return recoveryContextSnapshotSchema.parse({
    id: row.id,
    userId: row.userId,
    date: row.date,
    band: row.band,
    payload,
    calculatedAt: row.calculatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export function serializeRecoveryContextPayload(payload: RecoveryContextPayload) {
  return recoveryContextPayloadSchema.parse(payload);
}

export function normalizeOptionalScore(value: number | null | undefined): number | null {
  return value ?? null;
}

export function normalizeCheckInInput(input: UpsertRecoveryCheckInInput) {
  return {
    soreness: input.soreness,
    fatigue: input.fatigue,
    moodScore: normalizeOptionalScore(input.moodScore),
    perceivedStress: normalizeOptionalScore(input.perceivedStress),
    source: input.source ?? "user_entry",
  };
}
