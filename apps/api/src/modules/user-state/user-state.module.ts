import { Module } from "@nestjs/common";
import { GoalsModule } from "../goals/goals.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { UsersModule } from "../users/users.module.js";
import { UserStateController } from "./user-state.controller.js";
import { UserStateService } from "./user-state.service.js";

@Module({
  imports: [UsersModule, ProfilesModule, GoalsModule],
  controllers: [UserStateController],
  providers: [UserStateService],
  exports: [UserStateService],
})
export class UserStateModule {}
