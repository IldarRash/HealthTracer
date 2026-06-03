import { Controller, Get, Post, UseGuards } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { ClerkAuthGuard } from "../../auth.guard.js";
import { CurrentAuth } from "../../current-auth.decorator.js";
import { BillingService } from "./billing.service.js";
import { EntitlementsService } from "./entitlements.service.js";
import { getTodayIsoDateInTimezone } from "@health/types";
import { UsersService } from "../users/users.service.js";

@Controller("billing")
@UseGuards(ClerkAuthGuard)
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly entitlementsService: EntitlementsService,
    private readonly usersService: UsersService,
  ) {}

  @Get("subscription")
  getSubscription(@CurrentAuth() auth: ClerkAuthContext) {
    return this.billingService.getSubscription(auth);
  }

  @Get("entitlement")
  async getEntitlement(@CurrentAuth() auth: ClerkAuthContext) {
    const user = await this.usersService.resolveFromAuth(auth);
    const todayIsoDate = getTodayIsoDateInTimezone(user.timezone);

    return this.entitlementsService.getEntitlement(user.id, todayIsoDate);
  }

  @Post("checkout-session")
  createCheckoutSession(@CurrentAuth() auth: ClerkAuthContext) {
    return this.billingService.createCheckoutSession(auth);
  }

  @Post("portal-session")
  createPortalSession(@CurrentAuth() auth: ClerkAuthContext) {
    return this.billingService.createPortalSession(auth);
  }
}
