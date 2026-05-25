import { recoveryContextSnapshots } from "@health/db";
import type { RecoveryContextPayload, RecoveryReadinessBand } from "@health/types";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";
import { serializeRecoveryContextPayload } from "./recovery.mapper.js";

@Injectable()
export class RecoveryContextRepository {
  constructor(@Inject(DATABASE) private readonly db: HealthDatabase) {}

  async findByIdForUser(userId: string, snapshotId: string) {
    const [row] = await this.db
      .select()
      .from(recoveryContextSnapshots)
      .where(
        and(
          eq(recoveryContextSnapshots.userId, userId),
          eq(recoveryContextSnapshots.id, snapshotId),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  async findByUserAndDate(userId: string, date: string) {
    const [row] = await this.db
      .select()
      .from(recoveryContextSnapshots)
      .where(
        and(eq(recoveryContextSnapshots.userId, userId), eq(recoveryContextSnapshots.date, date)),
      )
      .limit(1);

    return row ?? null;
  }

  async upsertByUserAndDate(
    userId: string,
    date: string,
    band: RecoveryReadinessBand,
    payload: RecoveryContextPayload,
  ) {
    const calculatedAt = new Date();
    const serializedPayload = serializeRecoveryContextPayload(payload);

    const [row] = await this.db
      .insert(recoveryContextSnapshots)
      .values({
        userId,
        date,
        band,
        payload: serializedPayload,
        calculatedAt,
      })
      .onConflictDoUpdate({
        target: [recoveryContextSnapshots.userId, recoveryContextSnapshots.date],
        set: {
          band,
          payload: serializedPayload,
          calculatedAt,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!row) {
      throw new Error("Failed to upsert recovery context snapshot.");
    }

    return row;
  }

  async listByUserAndDateRange(userId: string, startDate: string, endDate: string) {
    return this.db
      .select()
      .from(recoveryContextSnapshots)
      .where(
        and(
          eq(recoveryContextSnapshots.userId, userId),
          gte(recoveryContextSnapshots.date, startDate),
          lte(recoveryContextSnapshots.date, endDate),
        ),
      )
      .orderBy(desc(recoveryContextSnapshots.date));
  }

  async listRecentByUserId(userId: string, limit: number) {
    return this.db
      .select()
      .from(recoveryContextSnapshots)
      .where(eq(recoveryContextSnapshots.userId, userId))
      .orderBy(desc(recoveryContextSnapshots.date))
      .limit(limit);
  }
}
