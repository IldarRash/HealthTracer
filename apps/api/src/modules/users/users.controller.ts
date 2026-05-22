import { updateCurrentUserSchema } from "@health/types";
import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { ClerkAuthGuard } from "../../auth.guard.js";
import { parseBody } from "../../common/zod.js";
import { CurrentAuth } from "../../current-auth.decorator.js";
import { UsersService } from "./users.service.js";

@Controller("users")
@UseGuards(ClerkAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  getCurrentUser(@CurrentAuth() auth: ClerkAuthContext) {
    return this.usersService.resolveFromAuth(auth);
  }

  @Patch("me")
  updateCurrentUser(@CurrentAuth() auth: ClerkAuthContext, @Body() body: unknown) {
    return this.usersService.updateCurrentUser(
      auth,
      parseBody(updateCurrentUserSchema, body),
    );
  }
}
