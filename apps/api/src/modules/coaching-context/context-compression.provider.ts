import type {
  AgentContextPacket,
  ContextBudgetPolicy,
  ContextCompressionRequest,
  ContextCompressionSummary,
} from "@health/types";

export interface ContextCompressionInput {
  packet: AgentContextPacket;
  request: ContextCompressionRequest;
  budget: ContextBudgetPolicy;
}

export interface ContextCompressionProvider {
  compress(input: ContextCompressionInput): Promise<ContextCompressionSummary>;
}
