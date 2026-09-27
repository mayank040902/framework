import type { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from "fastify";
import { 
  AppError, 
  isAppError, 
  formatError, 
  getErrorStatusCode,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InternalError,
  ConfigurationError,
  DatabaseError,
  ConnectionError,
  ExternalServiceError,
  KafkaError,
  RedisError,
  WebSocketError,
  EncryptionError,
  SerializationError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError
} from "./errors.js";

export interface ErrorHandlerOptions {
  includeStack?: boolean;
  logErrors?: boolean;
  customHandler?: (error: AppError, request: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

export function createErrorHandler(options: ErrorHandlerOptions = {}) {
  const { includeStack = false, logErrors = true, customHandler } = options;

  return async function errorHandler(
    error: FastifyError,
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    let appError: AppError;

    if (isAppError(error)) {
      appError = error;
    } else if (error.validation) {
      const fields: Record<string, string[]> = {};
      for (const issue of error.validation) {
        const path = issue.instancePath || issue.keyword || "unknown";
        if (!fields[path]) fields[path] = [];
        fields[path].push(issue.message || "Validation failed");
      }
      appError = new ValidationError("Request validation failed", fields);
    } else if (error.statusCode === 401) {
      appError = new AuthenticationError(error.message);
    } else if (error.statusCode === 403) {
      appError = new AuthorizationError(error.message);
    } else if (error.statusCode === 404) {
      appError = new NotFoundError("Resource", undefined, { path: request.url });
    } else if (error.statusCode === 409) {
      appError = new ConflictError(error.message);
    } else if (error.statusCode === 413) {
      appError = new PayloadTooLargeError();
    } else if (error.statusCode === 415) {
      appError = new UnsupportedMediaTypeError();
    } else if (error.statusCode === 429) {
      appError = new RateLimitError(error.message);
    } else if (error.statusCode && error.statusCode >= 500) {
      appError = new InternalError(error.message, error);
    } else {
      appError = new InternalError(error.message, error);
    }

    if (logErrors) {
      request.log.error({ err: appError, path: request.url, method: request.method }, "Request error");
    }

    if (customHandler) {
      await customHandler(appError, request, reply);
      return;
    }

    const statusCode = getErrorStatusCode(appError);
    const response = formatError(appError);
    
    if (!includeStack) {
      delete response.stack;
    }

    reply.status(statusCode).send({
      error: response,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId: request.id,
    });
  };
}

export async function registerErrorHandler(
  server: FastifyInstance,
  options: ErrorHandlerOptions = {}
): Promise<void> {
  server.setErrorHandler(createErrorHandler(options));
}

export async function errorHandlerPlugin(
  server: FastifyInstance,
  options: ErrorHandlerOptions = {}
): Promise<void> {
  server.setErrorHandler(createErrorHandler(options));
}

Object.assign(errorHandlerPlugin, {
  [Symbol.for("skip-override")]: true,
  [Symbol.for("plugin-meta")]: {
    name: "@bootstrap-framework/errors",
  },
});

export interface ValidationErrorResponse {
  statusCode: 400;
  error: "Validation Error";
  message: string;
  fields: Record<string, string[]>;
  timestamp: string;
  path: string;
  requestId: string;
}

export function formatValidationError(
  error: ValidationError,
  request: FastifyRequest
): ValidationErrorResponse {
  return {
    statusCode: 400,
    error: "Validation Error",
    message: error.message,
    fields: error.fields,
    timestamp: new Date().toISOString(),
    path: request.url,
    requestId: request.id,
  };
}

export const ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  AUTHENTICATION_ERROR: "AUTHENTICATION_ERROR",
  AUTHORIZATION_ERROR: "AUTHORIZATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  BAD_REQUEST: "BAD_REQUEST",
  UNPROCESSABLE_ENTITY: "UNPROCESSABLE_ENTITY",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  TIMEOUT: "TIMEOUT",
  CONFIGURATION_ERROR: "CONFIGURATION_ERROR",
  DATABASE_ERROR: "DATABASE_ERROR",
  CONNECTION_ERROR: "CONNECTION_ERROR",
  EXTERNAL_SERVICE_ERROR: "EXTERNAL_SERVICE_ERROR",
  KAFKA_ERROR: "KAFKA_ERROR",
  REDIS_ERROR: "REDIS_ERROR",
  WEBSOCKET_ERROR: "WEBSOCKET_ERROR",
  ENCRYPTION_ERROR: "ENCRYPTION_ERROR",
  SERIALIZATION_ERROR: "SERIALIZATION_ERROR",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  UNSUPPORTED_MEDIA_TYPE: "UNSUPPORTED_MEDIA_TYPE",
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

export function isErrorCode(code: string): code is ErrorCode {
  return Object.values(ERROR_CODES).includes(code as ErrorCode);
}

export function createErrorResponse(
  code: ErrorCode,
  message: string,
  statusCode: number,
  details?: Record<string, unknown>
): Record<string, unknown> {
  return {
    error: code,
    message,
    statusCode,
    details,
    timestamp: new Date().toISOString(),
  };
}