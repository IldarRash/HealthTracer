import type * as schema from "@health/db";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

export type HealthDatabase = PostgresJsDatabase<typeof schema>;
