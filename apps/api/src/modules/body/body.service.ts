import type {
  BodyCompositionAnalysis,
  SaveBodyAnalysisProposalPayload,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import { BodyRepository } from "./body.repository.js";

@Injectable()
export class BodyService {
  constructor(private readonly bodyRepository: BodyRepository) {}

  /**
   * Returns the latest body-composition analysis for the given user, or null.
   * Read API — ownership-scoped.
   */
  async getLatestAnalysis(userId: string): Promise<BodyCompositionAnalysis | null> {
    return this.bodyRepository.findLatestAnalysisByUserId(userId);
  }

  /**
   * Returns all body-composition analyses for the given user (newest first, up to 8).
   * Read API — ownership-scoped.
   */
  async listAnalyses(userId: string): Promise<BodyCompositionAnalysis[]> {
    return this.bodyRepository.listAnalysesByUserId(userId);
  }

  /**
   * Applies an accepted save_body_analysis proposal, persisting the new record.
   * Called only from ProposalApplyService; photos are never accepted.
   *
   * Returns a reference string of the form "body_analysis:<id>".
   */
  async applyBodyAnalysisProposal(
    userId: string,
    sourceProposalId: string,
    payload: SaveBodyAnalysisProposalPayload,
  ): Promise<string> {
    const record = await this.bodyRepository.createAnalysis(
      userId,
      sourceProposalId,
      payload,
    );

    return `body_analysis:${record.id}`;
  }
}
