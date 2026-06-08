import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { UsersModule } from "../users/users.module.js";
import { BodyController } from "./body.controller.js";
import { BodyRepository } from "./body.repository.js";
import { BodyService } from "./body.service.js";

@Module({
  imports: [DatabaseModule, UsersModule],
  controllers: [BodyController],
  providers: [BodyRepository, BodyService],
  exports: [BodyService, BodyRepository],
})
export class BodyModule {}
