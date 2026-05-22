import { userProfiles } from "@health/db";
import type { UpsertUserProfileInput } from "@health/types";
import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";

@Injectable()
export class ProfilesRepository {
  constructor(@Inject(DATABASE) private readonly db: HealthDatabase) {}

  async findByUserId(userId: string) {
    const [profile] = await this.db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    return profile ?? null;
  }

  async upsert(userId: string, input: UpsertUserProfileInput) {
    const values = {
      ...input,
      userId,
      updatedAt: new Date(),
    };

    const [profile] = await this.db
      .insert(userProfiles)
      .values(values)
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: values,
      })
      .returning();

    if (!profile) {
      throw new Error("Failed to upsert profile.");
    }

    return profile;
  }
}
