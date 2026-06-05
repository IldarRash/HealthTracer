import { env } from "../env.js";

export type IntegrationStatus = "enabled" | "disabled" | "misconfigured";

export type ConfigDiagnostics = {
  clerkJwks: IntegrationStatus;
  aiCoachProvider: "openai";
  openai: IntegrationStatus;
  corsOrigins: "configured" | "reflect_origin";
  documentStorage: "configured";
  databaseUrl: "configured";
};

export type ReadinessCheckName =
  | "clerk_jwks"
  | "openai_api_key"
  | "database_connectivity";

export type ReadinessCheck = {
  name: ReadinessCheckName;
  status: "ok" | "error";
  message?: string;
};

export function getConfigDiagnostics(): ConfigDiagnostics {
  const configuredOrigins = env.CORS_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    clerkJwks: env.CLERK_JWKS_URL ? "enabled" : "disabled",
    aiCoachProvider: env.AI_COACH_PROVIDER,
    openai: env.OPENAI_API_KEY ? "enabled" : "misconfigured",
    corsOrigins: configuredOrigins?.length ? "configured" : "reflect_origin",
    documentStorage: "configured",
    databaseUrl: "configured",
  };
}

export function getStaticReadinessChecks(): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [];

  if (!env.CLERK_JWKS_URL) {
    checks.push({
      name: "clerk_jwks",
      status: "error",
      message: "CLERK_JWKS_URL is not configured",
    });
  } else {
    checks.push({ name: "clerk_jwks", status: "ok" });
  }

  if (!env.OPENAI_API_KEY) {
    checks.push({
      name: "openai_api_key",
      status: "error",
      message: "OPENAI_API_KEY is required for the AI coach provider",
    });
  } else {
    checks.push({ name: "openai_api_key", status: "ok" });
  }

  return checks;
}

export function isReadinessReady(checks: ReadinessCheck[]): boolean {
  return checks.every((check) => check.status === "ok");
}
