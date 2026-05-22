import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { TodayRepository } from "./today.repository.js";
import { TodayService } from "./today.service.js";

@Module({
  imports: [DatabaseModule],
  providers: [TodayRepository, TodayService],
  exports: [TodayService],
})
export class TodayModule {}
