import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { UsersModule } from "../users/users.module.js";
import { DeviceConnectionsController } from "./device-connections.controller.js";
import { DeviceConnectionsRepository } from "./device-connections.repository.js";
import { DeviceConnectionsService } from "./device-connections.service.js";

@Module({
  imports: [DatabaseModule, UsersModule],
  controllers: [DeviceConnectionsController],
  providers: [DeviceConnectionsRepository, DeviceConnectionsService],
  exports: [DeviceConnectionsService, DeviceConnectionsRepository],
})
export class DeviceConnectionsModule {}
