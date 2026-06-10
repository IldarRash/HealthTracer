import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { BillingWebhookController } from "./billing-webhook.controller.js";

function createServiceMock() {
  return {
    constructEvent: vi.fn(),
    handleEvent: vi.fn(),
  };
}

function makeRawRequest(overrides: { rawBody?: Buffer; signature?: string } = {}) {
  return {
    rawBody: overrides.rawBody ?? Buffer.from('{"type":"test"}'),
    headers: {} as Record<string, string | undefined>,
  };
}

describe("BillingWebhookController", () => {
  describe("handleStripeWebhook — signature verification required", () => {
    it("rejects with 401 when stripe-signature header is missing", async () => {
      const service = createServiceMock();
      const controller = new BillingWebhookController(service as never);

      await expect(
        controller.handleStripeWebhook(makeRawRequest() as never, undefined),
      ).rejects.toThrow(UnauthorizedException);
      expect(service.constructEvent).not.toHaveBeenCalled();
    });

    it("rejects with 401 when signature is empty string", async () => {
      const service = createServiceMock();
      const controller = new BillingWebhookController(service as never);

      await expect(
        controller.handleStripeWebhook(makeRawRequest() as never, ""),
      ).rejects.toThrow(UnauthorizedException);
      expect(service.constructEvent).not.toHaveBeenCalled();
    });

    it("rejects with 400 when rawBody is missing from request", async () => {
      const service = createServiceMock();
      const controller = new BillingWebhookController(service as never);
      const reqWithoutBody = { rawBody: undefined, headers: {} };

      await expect(
        controller.handleStripeWebhook(reqWithoutBody as never, "t=123,v1=abc"),
      ).rejects.toThrow(BadRequestException);
      expect(service.constructEvent).not.toHaveBeenCalled();
    });

    it("rejects with 401 when constructEvent throws (invalid signature)", async () => {
      const service = createServiceMock();
      service.constructEvent.mockImplementation(() => {
        throw new Error("No signatures found matching the expected signature for payload.");
      });
      const controller = new BillingWebhookController(service as never);

      await expect(
        controller.handleStripeWebhook(
          makeRawRequest() as never,
          "t=bad,v1=invalid",
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("handleStripeWebhook — correct service delegation", () => {
    it("delegates to constructEvent and handleEvent on a valid signed request", async () => {
      const service = createServiceMock();
      const fakeEvent = { type: "customer.subscription.created", id: "evt_test" };
      service.constructEvent.mockReturnValue(fakeEvent);
      service.handleEvent.mockResolvedValue(undefined);
      const controller = new BillingWebhookController(service as never);
      const rawBody = Buffer.from('{"type":"customer.subscription.created"}');

      const result = await controller.handleStripeWebhook(
        makeRawRequest({ rawBody }) as never,
        "t=123,v1=validhash",
      );

      expect(service.constructEvent).toHaveBeenCalledWith(rawBody, "t=123,v1=validhash");
      expect(service.handleEvent).toHaveBeenCalledWith(fakeEvent);
      expect(result).toEqual({ received: true });
    });

    it("passes the raw body buffer (not a string) to constructEvent", async () => {
      const service = createServiceMock();
      const fakeEvent = { type: "test" };
      service.constructEvent.mockReturnValue(fakeEvent);
      service.handleEvent.mockResolvedValue(undefined);
      const controller = new BillingWebhookController(service as never);
      const rawBody = Buffer.from("raw-payload");

      await controller.handleStripeWebhook(
        makeRawRequest({ rawBody }) as never,
        "sig",
      );

      const [passedBody] = service.constructEvent.mock.calls[0]!;
      expect(Buffer.isBuffer(passedBody)).toBe(true);
      expect(passedBody).toBe(rawBody);
    });
  });
});
