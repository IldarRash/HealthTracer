import { upsertUserProfileSchema } from "@health/types";
import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { ClerkAuthGuard } from "../../auth.guard.js";
import { parseBody } from "../../common/zod.js";
import { CurrentAuth } from "../../current-auth.decorator.js";
import { ProfilesService } from "./profiles.service.js";

@Controller("profile")
@UseGuards(ClerkAuthGuard)
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get()
  getProfile(@CurrentAuth() auth: ClerkAuthContext) {
    return this.profilesService.getCurrentProfile(auth);
  }

  @Put()
  upsertProfile(@CurrentAuth() auth: ClerkAuthContext, @Body() body: unknown) {
    return this.profilesService.upsertCurrentProfile(
      auth,
      parseBody(upsertUserProfileSchema, body),
    );
  }
}
