import { env } from "../env.js";

export type IntegrationStatus = "enabled" | "disabled" | "misconfigured";

export type PerStageModels = {
  /** Resolved model id used for the router (first-LLM) stage. */
  router: string;
  /** Resolved model id used for each domain (fan-out) stage. */
  domain: string;
  /** Resolved model id used for the decision-maker (final synthesis) stage. */
  decision: string;
};

export type ConfigDiagnostics = {
  clerkJwks: IntegrationStatus;
  aiCoachProvider: "openai";
  openai: IntegrationStatus;
  /**
   * Per-stage resolved model ids (override ?? OPENAI_MODEL).
   * Always present — all stages fall back to OPENAI_MODEL when no per-stage
   * override is configured. Never includes the API key.
   */
  openaiModels: PerStageModels;
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

  const defaultModel = env.OPENAI_MODEL;
  const openaiModels: PerStageModels = {
    router: env.OPENAI_MODEL_ROUTER ?? defaultModel,
    domain: env.OPENAI_MODEL_DOMAIN ?? defaultModel,
    decision: env.OPENAI_MODEL_DECISION ?? defaultModel,
  };

  return {
    clerkJwks: env.CLERK_JWKS_URL ? "enabled" : "disabled",
    aiCoachProvider: env.AI_COACH_PROVIDER,
    openai: env.OPENAI_API_KEY ? "enabled" : "misconfigured",
    openaiModels,
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
