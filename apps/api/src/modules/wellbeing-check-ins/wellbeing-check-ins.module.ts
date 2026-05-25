import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { UsersModule } from "../users/users.module.js";
import { WellbeingAiContextService } from "./wellbeing-ai-context.service.js";
import { WellbeingCheckInsController } from "./wellbeing-check-ins.controller.js";
import { WellbeingCheckInsRepository } from "./wellbeing-check-ins.repository.js";
import { WellbeingCheckInsService } from "./wellbeing-check-ins.service.js";

@Module({
  imports: [DatabaseModule, UsersModule],
  controllers: [WellbeingCheckInsController],
  providers: [
    WellbeingCheckInsRepository,
    WellbeingCheckInsService,
    WellbeingAiContextService,
  ],
  exports: [WellbeingCheckInsService, WellbeingAiContextService],
})
export class WellbeingCheckInsModule {}
