import type { TodayChecklistPayload } from "@health/types";
import { Injectable } from "@nestjs/common";
import { TodayRepository } from "./today.repository.js";

@Injectable()
export class TodayService {
  constructor(private readonly todayRepository: TodayRepository) {}

  async applyTodayChecklistProposal(
    userId: string,
    payload: TodayChecklistPayload,
  ): Promise<string> {
    const checklist = await this.todayRepository.createChecklist(
      userId,
      payload,
      "ai_proposal",
    );

    return `daily_checklist:${checklist.id}`;
  }
}
