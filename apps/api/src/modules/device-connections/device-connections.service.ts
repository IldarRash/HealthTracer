import type {
  ConnectDeviceInput,
  DeviceConnection,
  DeviceConsent,
  GrantDeviceConsentInput,
} from "@health/types";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { UsersService } from "../users/users.service.js";
import {
  isConnectionActive,
  isConsentActive,
  toDeviceConnection,
  toDeviceConsent,
} from "./device-connection.mapper.js";
import { DeviceConnectionsRepository } from "./device-connections.repository.js";

@Injectable()
export class DeviceConnectionsService {
  constructor(
    private readonly deviceConnectionsRepository: DeviceConnectionsRepository,
    private readonly usersService: UsersService,
  ) {}

  async grantConsent(
    auth: ClerkAuthContext,
    input: GrantDeviceConsentInput,
  ): Promise<DeviceConsent> {
    const user = await this.usersService.resolveFromAuth(auth);
    const consent = await this.deviceConnectionsRepository.createConsent(user.id, input);

    return toDeviceConsent(consent);
  }

  async listConnections(auth: ClerkAuthContext): Promise<DeviceConnection[]> {
    const user = await this.usersService.resolveFromAuth(auth);
    const connections = await this.deviceConnectionsRepository.listConnectionsByUserId(user.id);

    return connections.map(toDeviceConnection);
  }

  async connectDevice(
    auth: ClerkAuthContext,
    input: ConnectDeviceInput,
  ): Promise<DeviceConnection> {
    const user = await this.usersService.resolveFromAuth(auth);
    const consent = await this.deviceConnectionsRepository.findConsentById(
      user.id,
      input.consentId,
    );

    if (!consent) {
      throw new NotFoundException("Device consent not found.");
    }

    if (!isConsentActive(consent)) {
      throw new ForbiddenException("Device consent has been revoked.");
    }

    const connection = await this.deviceConnectionsRepository.upsertConnection(
      user.id,
      consent.id,
      consent.provider,
      consent.grantedScopes,
      input,
    );

    return toDeviceConnection(connection);
  }

  async revokeConnection(
    auth: ClerkAuthContext,
    connectionId: string,
  ): Promise<DeviceConnection> {
    const user = await this.usersService.resolveFromAuth(auth);
    const existing = await this.deviceConnectionsRepository.findConnectionById(
      user.id,
      connectionId,
    );

    if (!existing) {
      throw new NotFoundException("Device connection not found.");
    }

    const connection = await this.deviceConnectionsRepository.revokeConnection(
      user.id,
      connectionId,
    );

    if (!connection) {
      throw new NotFoundException("Device connection not found.");
    }

    await this.deviceConnectionsRepository.revokeConsent(user.id, existing.consentId);

    return toDeviceConnection(connection);
  }

  async requireActiveConnection(userId: string, connectionId: string) {
    const connection = await this.deviceConnectionsRepository.findConnectionById(
      userId,
      connectionId,
    );

    if (!connection) {
      throw new NotFoundException("Device connection not found.");
    }

    if (!isConnectionActive(connection)) {
      throw new ForbiddenException("Device connection is not active.");
    }

    const consent = await this.deviceConnectionsRepository.findConsentById(
      userId,
      connection.consentId,
    );

    if (!consent || !isConsentActive(consent)) {
      throw new ForbiddenException("Active device consent is required for sync.");
    }

    return { connection, consent };
  }

  assertMetricScopeGranted(
    grantedScopes: GrantDeviceConsentInput["grantedScopes"],
    metricScope: GrantDeviceConsentInput["grantedScopes"][number],
  ) {
    if (!grantedScopes.includes(metricScope)) {
      throw new BadRequestException(
        `Metric scope "${metricScope}" is not included in granted consent scopes.`,
      );
    }
  }
}
