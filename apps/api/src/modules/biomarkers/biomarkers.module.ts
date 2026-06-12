import { Module } from "@nestjs/common";
import { env } from "../../env.js";
import { DatabaseModule } from "../../database/database.module.js";
import { UsersModule } from "../users/users.module.js";
import { BiomarkersController } from "./biomarkers.controller.js";
import { BiomarkersRepository } from "./biomarkers.repository.js";
import { BiomarkersService } from "./biomarkers.service.js";
import { createLabExtractionProviderFromEnv } from "./lab-extraction-provider.factory.js";
import { LAB_EXTRACTION_PROVIDER } from "./lab-extraction.tokens.js";
import { LabReportsService } from "./lab-reports.service.js";

@Module({
  imports: [DatabaseModule, UsersModule],
  controllers: [BiomarkersController],
  providers: [
    BiomarkersRepository,
    LabReportsService,
    BiomarkersService,
    {
      provide: LAB_EXTRACTION_PROVIDER,
      useFactory: () => createLabExtractionProviderFromEnv(env),
    },
  ],
  // BiomarkersRepository is exported for ProposalValidationService's
  // biomarker_reading evidence ownership checks.
  exports: [LabReportsService, BiomarkersService, BiomarkersRepository],
})
export class BiomarkersModule {}
