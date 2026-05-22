import {
  activeNutritionPlanResponseSchema,
  activeWorkoutPlanResponseSchema,
  aiProposalSchema,
  chatMessageSchema,
  chatThreadSchema,
  chatTurnResponseSchema,
  completeWorkoutSessionSchema,
  goalSchema,
  nutritionPlanRevisionSchema,
  proposalDecisionSchema,
  scheduleWorkoutSessionSchema,
  workoutPlanRevisionSchema,
  workoutSessionSchema,
  type ActiveNutritionPlanResponse,
  type ActiveWorkoutPlanResponse,
  type AiProposal,
  type ChatMessage,
  type ChatThread,
  type ChatTurnResponse,
  type CompleteWorkoutSessionInput,
  type Goal,
  type NutritionPlanRevision,
  type ScheduleWorkoutSessionInput,
  type User,
  type UserProfile,
  type WorkoutPlanRevision,
  type WorkoutSession,
  userProfileSchema,
  userSchema,
} from "@health/types";
import { z } from "zod";
import { webEnv } from "../env";

export type InspectorState = {
  user: User | null;
  profile: UserProfile | null;
  goals: Goal[];
  errors: string[];
};

export type ChatThreadDetail = {
  thread: ChatThread;
  messages: ChatMessage[];
};

export type ApiResult<T> = {
  data?: T;
  error?: string;
};

export const apiQueryKeys = {
  currentUser: ["current-user"],
  profile: ["profile"],
  goals: ["goals"],
  dashboardState: ["dashboard-state"],
  proposals: ["proposals"],
  workoutActive: ["workout-active"],
  workoutRevisions: ["workout-revisions"],
  nutritionActive: ["nutrition-active"],
  nutritionRevisions: ["nutrition-revisions"],
} as const;

const chatThreadDetailSchema = z.object({
  thread: chatThreadSchema,
  messages: z.array(chatMessageSchema),
});

export async function getCurrentUser(token: string): Promise<ApiResult<User>> {
  return apiFetch("/users/me", token, userSchema);
}

export async function getCurrentProfile(
  token: string,
): Promise<ApiResult<UserProfile | null>> {
  return apiFetch("/profile", token, userProfileSchema.nullable());
}

export async function listGoals(token: string): Promise<ApiResult<Goal[]>> {
  return apiFetch("/goals", token, goalSchema.array());
}

export async function getInspectorState(token: string): Promise<InspectorState> {
  const [user, profile, goals] = await Promise.all([
    getCurrentUser(token),
    getCurrentProfile(token),
    listGoals(token),
  ]);

  return {
    user: user.data ?? null,
    profile: profile.data ?? null,
    goals: goals.data ?? [],
    errors: [user.error, profile.error, goals.error].filter(isString),
  };
}

export async function listChatThreads(token: string): Promise<ApiResult<ChatThread[]>> {
  return apiFetch("/chat/threads", token, chatThreadSchema.array());
}

export async function createChatThread(
  token: string,
  title?: string,
): Promise<ApiResult<ChatThread>> {
  return apiFetch("/chat/threads", token, chatThreadSchema, {
    method: "POST",
    body: title ? { title } : {},
  });
}

export async function getChatThread(
  token: string,
  threadId: string,
): Promise<ApiResult<ChatThreadDetail>> {
  return apiFetch(`/chat/threads/${threadId}`, token, chatThreadDetailSchema);
}

export async function sendChatMessage(
  token: string,
  threadId: string,
  content: string,
): Promise<ApiResult<ChatTurnResponse>> {
  return apiFetch(`/chat/threads/${threadId}/messages`, token, chatTurnResponseSchema, {
    method: "POST",
    body: { content },
  });
}

export async function listProposals(
  token: string,
  threadId?: string,
): Promise<ApiResult<AiProposal[]>> {
  const query = threadId ? `?threadId=${encodeURIComponent(threadId)}` : "";
  return apiFetch(`/proposals${query}`, token, aiProposalSchema.array());
}

export async function getProposal(
  token: string,
  proposalId: string,
): Promise<ApiResult<AiProposal>> {
  return apiFetch(`/proposals/${proposalId}`, token, aiProposalSchema);
}

export async function decideProposal(
  token: string,
  proposalId: string,
  decision: "accept" | "reject",
): Promise<ApiResult<AiProposal>> {
  const body = proposalDecisionSchema.parse({ decision });
  return apiFetch(`/proposals/${proposalId}/decision`, token, aiProposalSchema, {
    method: "POST",
    body,
  });
}

export function getAcceptedProposalRefreshQueryKeys(
  proposal: AiProposal,
): ReadonlyArray<readonly unknown[]> {
  if (proposal.status !== "accepted") {
    return [];
  }

  const commonKeys = [apiQueryKeys.dashboardState, apiQueryKeys.proposals];

  switch (proposal.targetDomain) {
    case "profile":
      return [...commonKeys, apiQueryKeys.profile];
    case "goal":
      return [...commonKeys, apiQueryKeys.goals];
    case "workout":
      return [...commonKeys, apiQueryKeys.workoutActive, apiQueryKeys.workoutRevisions];
    case "nutrition":
      return [
        ...commonKeys,
        apiQueryKeys.nutritionActive,
        apiQueryKeys.nutritionRevisions,
      ];
    case "today":
    case "general":
      return commonKeys;
  }
}

export async function getActiveWorkoutPlan(
  token: string,
): Promise<ApiResult<ActiveWorkoutPlanResponse>> {
  return apiFetch("/workouts/active", token, activeWorkoutPlanResponseSchema);
}

export async function listWorkoutRevisions(
  token: string,
): Promise<ApiResult<WorkoutPlanRevision[]>> {
  return apiFetch("/workouts/revisions", token, workoutPlanRevisionSchema.array());
}

export async function scheduleWorkoutSession(
  token: string,
  input: ScheduleWorkoutSessionInput,
): Promise<ApiResult<WorkoutSession>> {
  const body = scheduleWorkoutSessionSchema.parse(input);
  return apiFetch("/workouts/sessions", token, workoutSessionSchema, {
    method: "POST",
    body,
  });
}

export async function completeWorkoutSession(
  token: string,
  sessionId: string,
  input: CompleteWorkoutSessionInput,
): Promise<ApiResult<WorkoutSession>> {
  const body = completeWorkoutSessionSchema.parse(input);
  return apiFetch(
    `/workouts/sessions/${sessionId}/complete`,
    token,
    workoutSessionSchema,
    { method: "PATCH", body },
  );
}

export async function getActiveNutritionPlan(
  token: string,
): Promise<ApiResult<ActiveNutritionPlanResponse>> {
  return apiFetch("/nutrition/active", token, activeNutritionPlanResponseSchema);
}

export async function listNutritionRevisions(
  token: string,
): Promise<ApiResult<NutritionPlanRevision[]>> {
  return apiFetch("/nutrition/revisions", token, nutritionPlanRevisionSchema.array());
}

type ApiFetchOptions = {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
};

export function parseApiErrorBody(
  path: string,
  status: number,
  body: unknown,
): string {
  const fallback = `${path} returned ${status}`;
  const parts: string[] = [];

  const appendStrings = (values: unknown) => {
    if (!Array.isArray(values)) {
      return;
    }

    for (const value of values) {
      if (typeof value === "string" && value.trim()) {
        parts.push(value.trim());
      }
    }
  };

  const appendZodIssues = (issues: unknown) => {
    if (!Array.isArray(issues)) {
      return;
    }

    for (const issue of issues) {
      if (issue && typeof issue === "object" && "message" in issue) {
        const message = (issue as { message?: unknown }).message;
        if (typeof message === "string" && message.trim()) {
          parts.push(message.trim());
        }
      }
    }
  };

  const appendMessage = (value: unknown) => {
    if (typeof value === "string" && value.trim()) {
      parts.push(value.trim());
      return;
    }

    if (!value || typeof value !== "object") {
      return;
    }

    const record = value as Record<string, unknown>;

    if (typeof record.message === "string" && record.message.trim()) {
      parts.push(record.message.trim());
    }

    appendStrings(record.validationErrors);
    appendZodIssues(record.issues);
  };

  if (typeof body === "string" && body.trim()) {
    return body.trim();
  }

  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    appendMessage(record.message);

    if (Array.isArray(record.message)) {
      appendStrings(record.message);
    }

    appendStrings(record.validationErrors);
    appendZodIssues(record.issues);
  }

  if (parts.length > 0) {
    return [...new Set(parts)].join(" ");
  }

  return fallback;
}

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
    const response = await fetch(`${webEnv.NEXT_PUBLIC_API_BASE_URL}${path}`, {
      cache: "no-store",
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const errorBody = await readResponseBody(response);
      return { error: parseApiErrorBody(path, response.status, errorBody) };
    }

    const responseBody = await readResponseBody(response);
    return { data: schema.parse(responseBody) };
  } catch {
    return { error: `${path} could not be loaded` };
  }
}

function isString(value: string | undefined): value is string {
  return typeof value === "string";
}
