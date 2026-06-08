import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { HttpRequest, HttpResponse } from "./http.types.js";
import { isMessageKey, translate } from "../i18n/messages.js";
import { resolveRequestLocale } from "../i18n/resolve-locale.js";
import { sanitizePathForLogging } from "./path-sanitizer.js";
import { getRequestId } from "./request-id.js";
import {
  isProductionEnvironment,
  writeStructuredLog,
} from "./structured-logger.js";

export type ErrorCategory =
  | "auth_jwks"
  | "validation"
  | "database"
  | "ai_provider"
  | "document_storage"
  | "unexpected";

export function categorizeException(exception: unknown): {
  statusCode: number;
  category: ErrorCategory;
  clientMessage: string;
} {
  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    const response = exception.getResponse();
    const message = extractExceptionMessage(exception, response);

    if (statusCode === HttpStatus.UNAUTHORIZED) {
      return {
        statusCode,
        category: "auth_jwks",
        clientMessage: message,
      };
    }

    if (statusCode >= 400 && statusCode < 500) {
      return {
        statusCode,
        category: "validation",
        clientMessage: message,
      };
    }

    const category = categorizeErrorMessage(message) ?? "unexpected";
    return {
      statusCode,
      category,
      clientMessage: "Internal server error",
    };
  }

  if (exception instanceof Error) {
    const category = categorizeErrorMessage(`${exception.name} ${exception.message}`);

    if (category) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        category,
        clientMessage: "Internal server error",
      };
    }
  }

  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    category: "unexpected",
    clientMessage: "Internal server error",
  };
}

function extractExceptionMessage(
  exception: HttpException,
  response: string | object,
): string {
  if (typeof response === "string") {
    return response;
  }

  if (
    typeof response === "object" &&
    response !== null &&
    "message" in response &&
    typeof response.message === "string"
  ) {
    return response.message;
  }

  return exception.message;
}

function categorizeErrorMessage(message: string): ErrorCategory | null {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("postgres") ||
    normalized.includes("database") ||
    normalized.includes("connection terminated") ||
    normalized.includes("econnrefused")
  ) {
    return "database";
  }

  if (
    normalized.includes("openai") ||
    normalized.includes("rate limit") ||
    normalized.includes("ai provider")
  ) {
    return "ai_provider";
  }

  if (
    normalized.includes("enoent") ||
    normalized.includes("document storage") ||
    normalized.includes("eacces") ||
    normalized.includes("document_storage")
  ) {
    return "document_storage";
  }

  return null;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<HttpRequest>();
    const response = context.getResponse<HttpResponse>();
    const locale = resolveRequestLocale(null, request);
    const { statusCode, category, clientMessage } = categorizeException(exception);

    if (statusCode >= 500) {
      const includeStack = !isProductionEnvironment();

      writeStructuredLog({
        level: "error",
        message: "Unhandled server error",
        event: "http.exception",
        requestId: getRequestId(request),
        method: request.method,
        path: sanitizePathForLogging(request.originalUrl ?? request.url),
        statusCode,
        errorCategory: category,
        errorName: exception instanceof Error ? exception.name : undefined,
        stack:
          includeStack && exception instanceof Error
            ? exception.stack
            : undefined,
      });
    } else {
      writeStructuredLog({
        level: category === "auth_jwks" ? "warn" : "info",
        message: "Client request rejected",
        event: "http.exception",
        requestId: getRequestId(request),
        method: request.method,
        path: sanitizePathForLogging(request.originalUrl ?? request.url),
        statusCode,
        errorCategory: category,
      });
    }

    if (exception instanceof HttpException) {
      const body = exception.getResponse();

      if (
        typeof body === "object" &&
        body !== null &&
        "code" in body &&
        isMessageKey((body as Record<string, unknown>)["code"])
      ) {
        const code = (body as Record<string, unknown>)["code"] as Parameters<typeof translate>[0];
        const { message: _msg, ...rest } = body as Record<string, unknown>;
        response.status(statusCode).json({
          ...rest,
          statusCode,
          message: translate(code, locale),
        });
      } else {
        response.status(statusCode).json(body);
      }

      return;
    }

    const localizedMessage =
      statusCode >= 500
        ? translate("internal_server_error", locale)
        : clientMessage;

    response.status(statusCode).json({
      statusCode,
      message: localizedMessage,
    });
  }
}
