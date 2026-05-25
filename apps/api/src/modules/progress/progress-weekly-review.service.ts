import type {
  ProgressSourceAggregates,
  RawAiProposal,
  WeeklyProgressSummaryResponse,
  WeeklyReviewCandidateProposal,
  WeeklyReviewLane,
  WeeklyReviewLaneOutcome,
  WeeklyReviewResponse,
} from "@health/types";
import {
  evaluateWeeklyReviewLaneEligibility,
  markExplanationOnlyLanes,
  packWeeklyReviewProposals,
  weeklyReviewLaneSchema,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { ProposalsRepository } from "../proposals/proposals.repository.js";
import { UsersService } from "../users/users.service.js";
import { ProgressService } from "./progress.service.js";

const LANE_PENDING_INTENTS: Record<WeeklyReviewLane, readonly string[]> = {
  workout: [
    "create_workout_plan",
    "adapt_workout_plan",
    "adapt_workout_plan_from_progress",
  ],
  nutrition: ["create_nutrition_plan", "adjust_nutrition_plan"],
  habits_recovery: [
    "create_habit_plan",
    "adapt_habit_plan",
    "create_today_checklist",
  ],
};

@Injectable()
export class ProgressWeeklyReviewService {
  constructor(
    private readonly progressService: ProgressService,
    private readonly proposalsRepository: ProposalsRepository,
    private readonly usersService: UsersService,
  ) {}

  async buildWeeklyReview(
    auth: ClerkAuthContext,
    input: { weekStart?: string; refresh?: boolean; candidates?: WeeklyReviewCandidateProposal[] },
  ): Promise<WeeklyReviewResponse> {
    const summary = await this.progressService.generateWeeklySummary(auth, {
      weekStart: input.weekStart,
      refresh: input.refresh ?? false,
    });

    const user = await this.usersService.resolveFromAuth(auth);
    const laneOutcomes = await this.evaluateLaneOutcomes(user.id, summary);
    const packed = packWeeklyReviewProposals({
      laneOutcomes,
      candidates: input.candidates ?? [],
    });

    return {
      summary,
      laneOutcomes: markExplanationOnlyLanes(laneOutcomes, packed.explanationOnlyLanes),
      packMeta: packed.meta,
      candidateProposals: packed.packed,
    };
  }

  async packChatWeeklyReviewProposals(
    auth: ClerkAuthContext,
    rawProposals: readonly RawAiProposal[],
  ): Promise<{
    summary: WeeklyProgressSummaryResponse;
    laneOutcomes: WeeklyReviewLaneOutcome[];
    proposalsToPersist: RawAiProposal[];
    packMeta: ReturnType<typeof packWeeklyReviewProposals>["meta"];
  }> {
    const summary = await this.progressService.generateWeeklySummary(auth, {
      refresh: false,
    });
    const user = await this.usersService.resolveFromAuth(auth);
    const laneOutcomes = await this.evaluateLaneOutcomes(user.id, summary);
    const packed = this.filterBoundedProposals(summary, laneOutcomes, rawProposals);

    return {
      summary,
      laneOutcomes: markExplanationOnlyLanes(laneOutcomes, packed.explanationOnlyLanes),
      proposalsToPersist: packed.packed.map(candidateToRawProposal),
      packMeta: packed.meta,
    };
  }

  async evaluateLaneOutcomes(
    userId: string,
    summary: WeeklyProgressSummaryResponse,
  ): Promise<WeeklyReviewLaneOutcome[]> {
    const aggregates = summary.summary.sourceAggregates;
    const pendingByLane = await this.proposalsRepository.findPendingIntentsByUserId(userId);

    return weeklyReviewLaneSchema.options.map((lane) =>
      evaluateWeeklyReviewLaneEligibility({
        lane,
        aggregates: normalizeAggregates(aggregates),
        hasPendingProposalInLaneFamily: LANE_PENDING_INTENTS[lane].some((intent) =>
          pendingByLane.includes(intent),
        ),
      }),
    );
  }

  filterBoundedProposals(
    summary: WeeklyProgressSummaryResponse,
    laneOutcomes: WeeklyReviewLaneOutcome[],
    rawProposals: readonly RawAiProposal[],
  ): {
    packed: WeeklyReviewCandidateProposal[];
    meta: ReturnType<typeof packWeeklyReviewProposals>["meta"];
    explanationOnlyLanes: ReturnType<typeof packWeeklyReviewProposals>["explanationOnlyLanes"];
  } {
    const candidates = rawProposals.flatMap((proposal) =>
      mapRawProposalToCandidate(proposal, summary),
    );

    return packWeeklyReviewProposals({
      laneOutcomes,
      candidates,
    });
  }
}

function normalizeAggregates(aggregates: ProgressSourceAggregates) {
  return {
    workout: aggregates.workout,
    today: aggregates.today ?? null,
    nutrition: aggregates.nutrition ?? null,
    habits: aggregates.habits ?? null,
    recovery: aggregates.recovery ?? null,
  };
}

function mapRawProposalToCandidate(
  proposal: RawAiProposal,
  summary: WeeklyProgressSummaryResponse,
): WeeklyReviewCandidateProposal[] {
  const lane = intentToLane(proposal.intent);

  if (!lane) {
    return [];
  }

  return [
    {
      lane,
      intent: proposal.intent,
      targetDomain: proposal.targetDomain,
      title: proposal.title,
      reason: proposal.reason,
      proposedChanges: attachProgressProvenance(proposal, summary),
      confidence: laneConfidence(lane, summary.summary.sourceAggregates),
    },
  ];
}

function intentToLane(intent: RawAiProposal["intent"]): WeeklyReviewLane | null {
  switch (intent) {
    case "adapt_workout_plan_from_progress":
      return "workout";
    case "adjust_nutrition_plan":
      return "nutrition";
    case "adapt_habit_plan":
      return "habits_recovery";
    default:
      return null;
  }
}

function laneConfidence(
  lane: WeeklyReviewLane,
  aggregates: ProgressSourceAggregates,
): number {
  const outcome = evaluateWeeklyReviewLaneEligibility({
    lane,
    aggregates: normalizeAggregates(aggregates),
    hasPendingProposalInLaneFamily: false,
  });

  return outcome.confidence;
}

function attachProgressProvenance(
  proposal: RawAiProposal,
  summary: WeeklyProgressSummaryResponse,
): unknown {
  if (proposal.intent === "adapt_workout_plan_from_progress") {
    return {
      ...(proposal.proposedChanges as Record<string, unknown>),
      sourceSummaryId: summary.summary.id,
      sourceTrendObservationIds: summary.trends.slice(0, 3).map((trend) => trend.id),
    };
  }

  if (proposal.intent === "adjust_nutrition_plan") {
    const changes = proposal.proposedChanges;

    if (changes && typeof changes === "object" && "plan" in changes) {
      return {
        ...changes,
        sourceSummaryId: summary.summary.id,
        sourceTrendObservationIds: summary.trends.slice(0, 3).map((trend) => trend.id),
      };
    }

    return {
      plan: changes,
      sourceSummaryId: summary.summary.id,
      sourceTrendObservationIds: summary.trends.slice(0, 3).map((trend) => trend.id),
    };
  }

  if (proposal.intent === "adapt_habit_plan") {
    const changes = proposal.proposedChanges;

    if (changes && typeof changes === "object" && "plan" in changes) {
      return {
        ...changes,
        sourceSummaryId: summary.summary.id,
        sourceTrendObservationIds: summary.trends.slice(0, 3).map((trend) => trend.id),
      };
    }

    return {
      plan: changes,
      sourceSummaryId: summary.summary.id,
      sourceTrendObservationIds: summary.trends.slice(0, 3).map((trend) => trend.id),
    };
  }

  return proposal.proposedChanges;
}

function candidateToRawProposal(candidate: WeeklyReviewCandidateProposal): RawAiProposal {
  return {
    intent: candidate.intent,
    targetDomain: candidate.targetDomain,
    title: candidate.title,
    reason: candidate.reason,
    proposedChanges: candidate.proposedChanges,
  } as RawAiProposal;
}
