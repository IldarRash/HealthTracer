import type { UpsertUserProfileInput, UserProfile } from "@health/types";
import { Injectable } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { UsersService } from "../users/users.service.js";
import { toUserProfile } from "./profile.mapper.js";
import { ProfilesRepository } from "./profiles.repository.js";

@Injectable()
export class ProfilesService {
  constructor(
    private readonly profilesRepository: ProfilesRepository,
    private readonly usersService: UsersService,
  ) {}

  async getCurrentProfile(auth: ClerkAuthContext): Promise<UserProfile | null> {
    const user = await this.usersService.resolveFromAuth(auth);
    const profile = await this.profilesRepository.findByUserId(user.id);

    return profile ? toUserProfile(profile) : null;
  }

  async upsertCurrentProfile(
    auth: ClerkAuthContext,
    input: UpsertUserProfileInput,
  ): Promise<UserProfile> {
    const user = await this.usersService.resolveFromAuth(auth);
    const profile = await this.profilesRepository.upsert(user.id, input);

    return toUserProfile(profile);
  }
}
