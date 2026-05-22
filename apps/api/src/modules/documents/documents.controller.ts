import {
  createHealthDocumentSchema,
  documentSearchQuerySchema,
  updateDocumentConsentSchema,
  updateDocumentSummaryReviewSchema,
} from "@health/types";
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { ClerkAuthGuard } from "../../auth.guard.js";
import { parseBody, parseQuery } from "../../common/zod.js";
import { CurrentAuth } from "../../current-auth.decorator.js";
import { DocumentsService } from "./documents.service.js";

@Controller("documents")
@UseGuards(ClerkAuthGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  createDocument(@CurrentAuth() auth: ClerkAuthContext, @Body() body: unknown) {
    return this.documentsService.createDocument(auth, parseBody(createHealthDocumentSchema, body));
  }

  @Get()
  listDocuments(@CurrentAuth() auth: ClerkAuthContext) {
    return this.documentsService.listDocuments(auth);
  }

  @Get("search")
  searchDocuments(@CurrentAuth() auth: ClerkAuthContext, @Query() query: unknown) {
    return this.documentsService.searchDocuments(
      auth,
      parseQuery(documentSearchQuerySchema, query),
    );
  }

  @Get(":documentId")
  getDocument(@CurrentAuth() auth: ClerkAuthContext, @Param("documentId") documentId: string) {
    return this.documentsService.getDocument(auth, documentId);
  }

  @Patch(":documentId/consent")
  updateConsent(
    @CurrentAuth() auth: ClerkAuthContext,
    @Param("documentId") documentId: string,
    @Body() body: unknown,
  ) {
    return this.documentsService.updateConsent(
      auth,
      documentId,
      parseBody(updateDocumentConsentSchema, body),
    );
  }

  @Patch(":documentId/summary/review")
  reviewSummary(
    @CurrentAuth() auth: ClerkAuthContext,
    @Param("documentId") documentId: string,
    @Body() body: unknown,
  ) {
    return this.documentsService.reviewSummary(
      auth,
      documentId,
      parseBody(updateDocumentSummaryReviewSchema, body),
    );
  }

  @Post(":documentId/parse")
  parseDocument(@CurrentAuth() auth: ClerkAuthContext, @Param("documentId") documentId: string) {
    return this.documentsService.parseAndSummarize(auth, documentId);
  }

  @Delete(":documentId")
  deleteDocument(@CurrentAuth() auth: ClerkAuthContext, @Param("documentId") documentId: string) {
    return this.documentsService.deleteDocument(auth, documentId);
  }
}
