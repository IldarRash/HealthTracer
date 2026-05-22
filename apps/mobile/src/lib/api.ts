import {
  activeNutritionPlanResponseSchema,
  nutritionAdherenceResponseSchema,
  nutritionPlanRevisionSchema,
  upsertNutritionAdherenceSchema,
  type ActiveNutritionPlanResponse,
  type NutritionAdherenceResponse,
  type NutritionPlanRevision,
  type UpsertNutritionAdherenceInput,
} from "@health/types";
import { z } from "zod";
import { mobileEnv } from "../env";

export type ApiResult<T> = {
  data?: T;
  error?: string;
};

export const mobileQueryKeys = {
  nutritionActive: ["nutrition-active"],
  nutritionAdherenceToday: ["nutrition-adherence-today"],
} as const;

type ApiFetchOptions = {
  method?: "GET" | "PUT";
  body?: unknown;
};

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function apiFetch<TSchema extends z.ZodType>(
  path: string,
  token: string,
  schema: TSchema,
  options: ApiFetchOptions = {},
): Promise<ApiResult<z.infer<TSchema>>> {
  const { method = "GET", body } = options;

  try {
    const response = await fetch(`${mobileEnv.EXPO_PUBLIC_API_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const errorBody = await readResponseBody(response);
      const message =
        typeof errorBody === "string" && errorBody.trim()
          ? errorBody.trim()
          : `${path} returned ${response.status}`;
      return { error: message };
    }

    const responseBody = await readResponseBody(response);
    return { data: schema.parse(responseBody) };
  } catch {
    return { error: `${path} could not be loaded` };
  }
}

export async function getActiveNutritionPlan(
  token: string,
): Promise<ApiResult<ActiveNutritionPlanResponse>> {
  return apiFetch("/nutrition/active", token, activeNutritionPlanResponseSchema);
}

export async function getTodayNutritionAdherence(
  token: string,
): Promise<ApiResult<NutritionAdherenceResponse>> {
  return apiFetch("/nutrition/adherence/today", token, nutritionAdherenceResponseSchema);
}

export async function upsertNutritionAdherence(
  token: string,
  date: string,
  input: UpsertNutritionAdherenceInput,
): Promise<ApiResult<NutritionAdherenceResponse>> {
  const body = upsertNutritionAdherenceSchema.parse(input);
  return apiFetch(
    `/nutrition/adherence/${encodeURIComponent(date)}`,
    token,
    nutritionAdherenceResponseSchema,
    { method: "PUT", body },
  );
}

export async function listNutritionRevisions(
  token: string,
): Promise<ApiResult<NutritionPlanRevision[]>> {
  return apiFetch("/nutrition/revisions", token, nutritionPlanRevisionSchema.array());
}
