import { Module } from "@nestjs/common";
import { CoachingContextModule } from "../coaching-context/coaching-context.module.js";
import { AiService } from "./ai.service.js";

@Module({
  imports: [CoachingContextModule],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
