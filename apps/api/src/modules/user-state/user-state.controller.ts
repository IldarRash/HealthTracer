import { Controller, Get, UseGuards } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { ClerkAuthGuard } from "../../auth.guard.js";
import { CurrentAuth } from "../../current-auth.decorator.js";
import { UserStateService } from "./user-state.service.js";

@Controller("users")
@UseGuards(ClerkAuthGuard)
export class UserStateController {
  constructor(private readonly userStateService: UserStateService) {}

  @Get("me/state")
  getCurrentUserState(@CurrentAuth() auth: ClerkAuthContext) {
    return this.userStateService.getCurrentUserState(auth);
  }
}
