import { users } from "@health/db";
import type { UpdateCurrentUserInput } from "@health/types";
import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { ClerkAuthContext } from "../../auth.types.js";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";

@Injectable()
export class UsersRepository {
  constructor(@Inject(DATABASE) private readonly db: HealthDatabase) {}

  async findByClerkUserId(clerkUserId: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, clerkUserId))
      .limit(1);

    return user ?? null;
  }

  async upsertFromAuth(auth: ClerkAuthContext) {
    const [user] = await this.db
      .insert(users)
      .values({
        clerkUserId: auth.clerkUserId,
        displayName: auth.displayName,
        email: auth.email,
      })
      .onConflictDoUpdate({
        target: users.clerkUserId,
        set: {
          displayName: auth.displayName,
          email: auth.email,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!user) {
      throw new Error("Failed to upsert user.");
    }

    return user;
  }

  async update(userId: string, input: UpdateCurrentUserInput) {
    const [user] = await this.db
      .update(users)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    return user ?? null;
  }
}
