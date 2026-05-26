import { Injectable, NestMiddleware } from "@nestjs/common";
import type { HttpRequest, HttpResponse, NextFunction } from "./http.types.js";
import {
  REQUEST_ID_HEADER,
  resolveRequestId,
} from "./request-id.js";

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: HttpRequest, response: HttpResponse, next: NextFunction): void {
    const requestId = resolveRequestId(request.headers[REQUEST_ID_HEADER]);
    request.requestId = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  }
}
