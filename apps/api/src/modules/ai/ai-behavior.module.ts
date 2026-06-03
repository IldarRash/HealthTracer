import { Module } from "@nestjs/common";
import { AiBehaviorConfigService } from "./ai-behavior-config.service.js";

@Module({
  providers: [AiBehaviorConfigService],
  exports: [AiBehaviorConfigService],
})
export class AiBehaviorModule {}
