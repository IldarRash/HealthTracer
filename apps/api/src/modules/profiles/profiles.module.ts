import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { UsersModule } from "../users/users.module.js";
import { ProfilesController } from "./profiles.controller.js";
import { ProfilesRepository } from "./profiles.repository.js";
import { ProfilesService } from "./profiles.service.js";

@Module({
  imports: [DatabaseModule, UsersModule],
  controllers: [ProfilesController],
  providers: [ProfilesRepository, ProfilesService],
  exports: [ProfilesService, ProfilesRepository],
})
export class ProfilesModule {}
