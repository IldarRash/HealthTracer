import type {
  ProposalRepairProvider,
  ProposalRepairRequest,
  ProposalRepairResult,
} from "@health/ai";
import { fetchOpenAiJsonCompletionWithRetry, stripExplicitNulls } from "./openai-http.js";

export const PROPOSAL_REPAIR_SCHEMA_NAME = "proposal_repair" as const;

/** Error-message label threaded into the shared OpenAI HTTP helper. */
const PROVIDER_ERROR_LABEL = "OpenAI proposal repair provider";

/**
 * Wire schema for the repair response: one root object carrying only the
 * corrected payload. strict:false — the per-intent payload shapes are
 * open-ended (additionalProperties:true), which OpenAI strict mode rejects.
 * The FULL proposal validation stack re-validates the payload after repair,
 * so the wire schema only guides generation.
 */
const proposalRepairWireSchema = {
  type: "object",
  properties: {
    proposedChanges: {
      type: "object",
      additionalProperties: true,
    },
  },
  required: ["proposedChanges"],
  additionalProperties: false,
} as const;

export interface OpenAiProposalRepairProviderOptions {
  apiKey: string;
  model: string;
}

/**
 * OpenAI-backed proposal self-repair provider.
 *
 * One bounded payload-only repair call: the model previously emitted a proposal
 * payload that failed validation; this call re-emits ONLY the corrected JSON
 * payload, changing nothing beyond what the validation errors require. It is
 * NEVER a decision-maker re-run (post-refactor the decision-maker selects
 * proposals by id and does not write payloads).
 *
 * Safety / privacy:
 *  - The envelope (intent/targetDomain/title/reason) is never rewritten here —
 *    `ProposalRepairService` keeps the original envelope fields.
 *  - This provider performs NO logging; payload contents must never be logged.
 *  - Only schema/domain-class failures reach this provider (ChatService gates
 *    eligibility) — it is never asked to write around safety floors.
 */
export class OpenAiProposalRepairProvider implements ProposalRepairProvider {
  constructor(private readonly options: OpenAiProposalRepairProviderOptions) {
    if (!options.apiKey.trim()) {
      throw new Error(
        "OpenAiProposalRepairProvider requires OPENAI_API_KEY, but it is not configured.",
      );
    }
  }

  async repairProposal(
    request: ProposalRepairRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ProposalRepairResult> {
    const { payload, usage } = await fetchOpenAiJsonCompletionWithRetry({
      apiKey: this.options.apiKey,
      body: {
        model: this.options.model,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: PROPOSAL_REPAIR_SCHEMA_NAME,
            strict: false,
            schema: proposalRepairWireSchema,
          },
        },
        messages: [
          { role: "system", content: buildRepairSystemPrompt(request.intent) },
          { role: "user", content: buildRepairUserMessage(request) },
        ],
      },
      model: this.options.model,
      signal: options?.signal,
      errorLabel: PROVIDER_ERROR_LABEL,
    });

    // Unwrap the root `proposedChanges` wrapper, tolerating models that emit
    // the corrected payload directly without the wrapper.
    const unwrapped =
      payload !== null && typeof payload === "object" && "proposedChanges" in payload
        ? (payload as { proposedChanges: unknown }).proposedChanges
        : payload;

    // Strip OpenAI explicit nulls so the repaired payload is normalized the same
    // way as every other provider payload before the Zod validation stack.
    const proposedChanges = stripExplicitNulls(unwrapped);

    if (proposedChanges === null || typeof proposedChanges !== "object" || Array.isArray(proposedChanges)) {
      // Error message intentionally carries no payload contents.
      throw new Error(`${PROVIDER_ERROR_LABEL} returned a non-object payload.`);
    }

    return { proposedChanges, usage };
  }
}

function buildRepairSystemPrompt(intent: string): string {
  return [
    `You previously emitted a proposal payload for intent "${intent}" in an AI health coach, and it failed validation.`,
    "Re-emit ONLY the corrected JSON payload as {\"proposedChanges\": { ... }}.",
    "Fix exactly what the validation errors require and change nothing else: keep every other field and value identical to the original payload.",
    "Do not add commentary, do not rename or invent fields beyond what the errors require, and do not include diagnosis, treatment, or medical-certainty language.",
  ].join("\n");
}

function buildRepairUserMessage(request: ProposalRepairRequest): string {
  const errorLines = request.validationErrors.map((error) => `- ${error}`).join("\n");

  return [
    "Validation errors:",
    errorLines,
    "",
    "Original payload JSON:",
    JSON.stringify(request.proposedChanges),
  ].join("\n");
}
