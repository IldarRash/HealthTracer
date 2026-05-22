import { dailyChecklists } from "@health/db";
import type { TodayChecklistPayload } from "@health/types";
import { Inject, Injectable } from "@nestjs/common";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";

@Injectable()
export class TodayRepository {
  constructor(@Inject(DATABASE) private readonly db: HealthDatabase) {}

  async createChecklist(
    userId: string,
    payload: TodayChecklistPayload,
    source: string,
  ) {
    const [checklist] = await this.db
      .insert(dailyChecklists)
      .values({
        userId,
        date: payload.date,
        items: payload.items,
        source,
      })
      .returning();

    if (!checklist) {
      throw new Error("Failed to create daily checklist.");
    }

    return checklist;
  }
}
