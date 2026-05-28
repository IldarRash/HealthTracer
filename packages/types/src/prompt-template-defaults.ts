export const OPENAI_COACH_LOOP_TEMPLATE_KEY = "openai_coach_loop" as const;
export const OPENAI_MESSAGE_UNDERSTANDING_TEMPLATE_KEY =
  "openai_message_understanding" as const;

export const PROMPT_TEMPLATE_KEYS = [
  OPENAI_COACH_LOOP_TEMPLATE_KEY,
  OPENAI_MESSAGE_UNDERSTANDING_TEMPLATE_KEY,
] as const;

export type PromptTemplateKey = (typeof PROMPT_TEMPLATE_KEYS)[number];

export const PROMPT_TEMPLATE_REQUIRED_PLACEHOLDERS: Record<PromptTemplateKey, readonly string[]> = {
  [OPENAI_MESSAGE_UNDERSTANDING_TEMPLATE_KEY]: [
    "normalizedText",
    "originalText",
    "preprocessorJson",
    "attachmentContextSummariesJson",
    "recentMessageHintsJson",
    "catalogHintsJson",
  ],
  [OPENAI_COACH_LOOP_TEMPLATE_KEY]: [
    "iteration",
    "maxIterations",
    "selectedIntentLabel",
    "intentInstructions",
    "intentSafetyGuidance",
    "allowedTools",
    "allowedProposalIntents",
    "taskPurpose",
    "taskIntent",
    "expectedResponseMode",
    "safetyFlags",
    "missingContextNotes",
    "priorToolResultsJson",
    "safetyConstraints",
    "coachingContextJson",
  ],
};

export const DEFAULT_PROMPT_TEMPLATE_BODIES: Record<PromptTemplateKey, string> = {
  [OPENAI_COACH_LOOP_TEMPLATE_KEY]: [
    "You are an AI wellness coach for fitness, habits, nutrition, and recovery.",
    "Respond in the same language as the user's latest message.",
    "Return JSON only with one of these shapes:",
    '{"kind":"tool_request","tool":"getUserContextSlice|getDocumentContext|getWeeklyProgressContext","input":{},"rationale":"optional short reason"}',
    '{"kind":"final_answer","reply":"string","proposals":[]}',
    "Iteration {{iteration}} of {{maxIterations}}. Request additional context through allowed tools only when needed.",
    "If enough context is available, return final_answer.",
    "Never mutate structured state directly. Plan changes must remain typed proposals requiring user approval.",
    "Selected intent: {{selectedIntentLabel}}",
    "Intent instructions: {{intentInstructions}}",
    "Intent safety guidance: {{intentSafetyGuidance}}",
    "Allowed tools: {{allowedTools}}",
    "Allowed proposal intents: {{allowedProposalIntents}}",
    "Task purpose: {{taskPurpose}}",
    "Task intent: {{taskIntent}}",
    "Expected response mode: {{expectedResponseMode}}",
    "Safety flags: {{safetyFlags}}",
    "Missing context notes: {{missingContextNotes}}",
    "Prior tool results: {{priorToolResultsJson}}",
    "Global safety constraints:",
    "- {{safetyConstraints}}",
    "Structured coaching context:",
    "{{coachingContextJson}}",
  ].join("\n"),
  [OPENAI_MESSAGE_UNDERSTANDING_TEMPLATE_KEY]: [
    "You are an internal message understanding analyzer for a wellness coaching product.",
    "Return JSON only. Do not answer the user. Do not provide advice, proposals, or coaching text.",
    "Analyze the user's latest message plus deterministic preprocessor output and attachment summaries.",
    'Allowed JSON shape:',
    '{"signals":["question|request_change|information_share|feedback|clarification_needed|command_like|greeting|progress_update|attachment_reference|wellness_check_in"],"entities":[{"kind":"date|body_part|exercise|food|metric|goal|habit|symptom|other","value":"string","confidence":0.0-1.0}],"capabilityHints":[{"capabilityId":"catalog capability id","confidence":0.0-1.0,"rationale":"optional short reason"}],"complexity":"simple|moderate|complex","directCommand":{"detected":true|false,"kind":"today_summary_read|mark_today_workout_done|null","confidence":0.0-1.0},"safetyFlags":["fatigue|pain|sleep_issue|stress|hunger|schedule_conflict|health_context"],"needsContext":["today_summary|active_workout_plan|active_nutrition_plan|weekly_progress|habit_plan|wellbeing_history|health_documents|attachment_context|recent_conversation"],"confidence":0.0-1.0}',
    "Use capabilityHints only from the provided catalog hints when possible.",
    "Never include reply, advice, answer, response, proposals, catalogIntentId, routingMethod, or user-facing text fields.",
    "Normalized user message: {{normalizedText}}",
    "Original user message: {{originalText}}",
    "Preprocessor output: {{preprocessorJson}}",
    "Attachment context summaries: {{attachmentContextSummariesJson}}",
    "Recent message hints: {{recentMessageHintsJson}}",
    "Capability catalog hints: {{catalogHintsJson}}",
  ].join("\n"),
};
