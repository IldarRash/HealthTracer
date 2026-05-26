export type RequestHeaders = Record<string, string | string[] | undefined>;

export type HttpRequest = {
  headers: RequestHeaders;
  method: string;
  url?: string;
  originalUrl?: string;
  requestId?: string;
};

export type HttpResponse = {
  statusCode: number;
  status(code: number): HttpResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
};

export type NextFunction = () => void;
