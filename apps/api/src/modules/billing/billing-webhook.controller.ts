import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  type RawBodyRequest,
} from "@nestjs/common";
import { BillingWebhookService } from "./billing-webhook.service.js";

/** Minimal request interface — avoids a hard dep on @types/express. */
type HttpRequest = {
  rawBody?: Buffer;
  headers: Record<string, string | string[] | undefined>;
};

/**
 * Unguarded webhook endpoint — authentication is via Stripe signature verification only.
 * CORS is not relevant here (server-to-server from Stripe).
 */
@Controller("webhooks")
export class BillingWebhookController {
  constructor(private readonly billingWebhookService: BillingWebhookService) {}

  @Post("stripe")
  @HttpCode(200)
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<HttpRequest>,
    @Headers("stripe-signature") signature: string | undefined,
  ) {
    if (!signature) {
      throw new UnauthorizedException("Missing stripe-signature header.");
    }

    const rawBody = req.rawBody;

    if (!rawBody) {
      throw new BadRequestException(
        "Raw body is not available. Ensure rawBody: true is set in NestFactory.create.",
      );
    }

    let event;
    try {
      event = this.billingWebhookService.constructEvent(rawBody, signature);
    } catch {
      throw new UnauthorizedException("Invalid Stripe webhook signature.");
    }

    await this.billingWebhookService.handleEvent(event);

    return { received: true };
  }
}
