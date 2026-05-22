import { connectDeviceSchema, grantDeviceConsentSchema } from "@health/types";
import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { ClerkAuthGuard } from "../../auth.guard.js";
import { parseBody } from "../../common/zod.js";
import { CurrentAuth } from "../../current-auth.decorator.js";
import { DeviceConnectionsService } from "./device-connections.service.js";

@Controller("device-connections")
@UseGuards(ClerkAuthGuard)
export class DeviceConnectionsController {
  constructor(private readonly deviceConnectionsService: DeviceConnectionsService) {}

  @Post("consent")
  grantConsent(@CurrentAuth() auth: ClerkAuthContext, @Body() body: unknown) {
    return this.deviceConnectionsService.grantConsent(
      auth,
      parseBody(grantDeviceConsentSchema, body),
    );
  }

  @Get()
  listConnections(@CurrentAuth() auth: ClerkAuthContext) {
    return this.deviceConnectionsService.listConnections(auth);
  }

  @Post()
  connectDevice(@CurrentAuth() auth: ClerkAuthContext, @Body() body: unknown) {
    return this.deviceConnectionsService.connectDevice(
      auth,
      parseBody(connectDeviceSchema, body),
    );
  }

  @Post(":connectionId/revoke")
  revokeConnection(
    @CurrentAuth() auth: ClerkAuthContext,
    @Param("connectionId") connectionId: string,
  ) {
    return this.deviceConnectionsService.revokeConnection(auth, connectionId);
  }
}
