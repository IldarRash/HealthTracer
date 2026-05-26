import { Inject, Injectable } from "@nestjs/common";
import type postgres from "postgres";
import { POSTGRES_CLIENT } from "../database/database.tokens.js";
import {
  getStaticReadinessChecks,
  isReadinessReady,
  type ReadinessCheck,
} from "./config-diagnostics.js";

export type ReadinessResponse = {
  service: "api";
  status: "ok" | "error";
  checks: ReadinessCheck[];
};

@Injectable()
export class HealthReadinessService {
  constructor(
    @Inject(POSTGRES_CLIENT) private readonly postgresClient: postgres.Sql,
  ) {}

  async check(): Promise<ReadinessResponse> {
    const checks = [...getStaticReadinessChecks()];

    try {
      await this.postgresClient`SELECT 1`;
      checks.push({ name: "database_connectivity", status: "ok" });
    } catch {
      checks.push({
        name: "database_connectivity",
        status: "error",
        message: "Database connection failed",
      });
    }

    return {
      service: "api",
      status: isReadinessReady(checks) ? "ok" : "error",
      checks,
    };
  }
}
