import { proposalDecisionSchema } from "@health/types";
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { ClerkAuthGuard } from "../../auth.guard.js";
import { parseBody } from "../../common/zod.js";
import { CurrentAuth } from "../../current-auth.decorator.js";
import { ProposalsService } from "./proposals.service.js";

@Controller("proposals")
@UseGuards(ClerkAuthGuard)
export class ProposalsController {
  constructor(private readonly proposalsService: ProposalsService) {}

  @Get()
  listProposals(
    @CurrentAuth() auth: ClerkAuthContext,
    @Query("threadId") threadId?: string,
  ) {
    return this.proposalsService.listProposals(auth, threadId);
  }

  @Get(":proposalId")
  getProposal(
    @CurrentAuth() auth: ClerkAuthContext,
    @Param("proposalId") proposalId: string,
  ) {
    return this.proposalsService.getProposal(auth, proposalId);
  }

  @Post(":proposalId/decision")
  decideProposal(
    @CurrentAuth() auth: ClerkAuthContext,
    @Param("proposalId") proposalId: string,
    @Body() body: unknown,
  ) {
    return this.proposalsService.decideProposal(
      auth,
      proposalId,
      parseBody(proposalDecisionSchema, body),
    );
  }
}
