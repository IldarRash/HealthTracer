import * as schema from "@health/db";
import { Module } from "@nestjs/common";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env.js";
import { DATABASE, POSTGRES_CLIENT } from "./database.tokens.js";

@Module({
  providers: [
    {
      provide: POSTGRES_CLIENT,
      useFactory: () => postgres(env.DATABASE_URL, { prepare: false }),
    },
    {
      provide: DATABASE,
      inject: [POSTGRES_CLIENT],
      useFactory: (client: postgres.Sql) => drizzle(client, { schema }),
    },
  ],
  exports: [DATABASE, POSTGRES_CLIENT],
})
export class DatabaseModule {}
