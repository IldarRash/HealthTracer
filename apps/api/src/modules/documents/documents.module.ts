import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { UsersModule } from "../users/users.module.js";
import { DocumentsController } from "./documents.controller.js";
import { DocumentsRepository } from "./documents.repository.js";
import { DocumentsService } from "./documents.service.js";

@Module({
  imports: [DatabaseModule, UsersModule],
  controllers: [DocumentsController],
  providers: [DocumentsRepository, DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
