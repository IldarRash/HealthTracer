import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, tap } from "rxjs";
import type { HttpRequest, HttpResponse } from "./http.types.js";
import { sanitizePathForLogging } from "./path-sanitizer.js";
import { getRequestId } from "./request-id.js";
import { writeStructuredLog } from "./structured-logger.js";

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const request = context.switchToHttp().getRequest<HttpRequest>();
    const response = context.switchToHttp().getResponse<HttpResponse>();
    const path = sanitizePathForLogging(request.originalUrl ?? request.url);

    const logCompletion = (statusCode: number) => {
      if (path === "/health") {
        writeStructuredLog({
          level: "info",
          message: "Liveness probe completed",
          event: "http.request",
          requestId: getRequestId(request),
          method: request.method,
          path,
          statusCode,
          durationMs: Date.now() - startedAt,
        });
        return;
      }

      writeStructuredLog({
        level: statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info",
        message: "HTTP request completed",
        event: "http.request",
        requestId: getRequestId(request),
        method: request.method,
        path,
        statusCode,
        durationMs: Date.now() - startedAt,
      });
    };

    return next.handle().pipe(
      tap({
        next: () => {
          logCompletion(response.statusCode);
        },
        error: (error: { getStatus?: () => number; status?: number }) => {
          const statusCode =
            typeof error.getStatus === "function"
              ? error.getStatus()
              : (error.status ?? 500);
          logCompletion(statusCode);
        },
      }),
    );
  }
}
