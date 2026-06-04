import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { UsersModule } from "../users/users.module.js";
import { BillingController } from "./billing.controller.js";
import { BillingRepository } from "./billing.repository.js";
import { BillingService } from "./billing.service.js";
import { BillingWebhookController } from "./billing-webhook.controller.js";
import { BillingWebhookService } from "./billing-webhook.service.js";
import { EntitlementsService } from "./entitlements.service.js";
import { StripeClient } from "./stripe.client.js";

@Module({
  imports: [DatabaseModule, UsersModule],
  controllers: [BillingController, BillingWebhookController],
  providers: [
    StripeClient,
    BillingRepository,
    BillingService,
    BillingWebhookService,
    EntitlementsService,
  ],
  exports: [EntitlementsService, BillingService],
})
export class BillingModule {}
