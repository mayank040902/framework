export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace?.(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      stack: this.stack,
    };
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public readonly fields: Record<string, string[]>, details?: Record<string, unknown>) {
    super(message, "VALIDATION_ERROR", 400, { fields, ...details });
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      fields: this.fields,
      stack: this.stack,
    };
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Authentication required", details?: Record<string, unknown>) {
    super(message, "AUTHENTICATION_ERROR", 401, details);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "Insufficient permissions", details?: Record<string, unknown>) {
    super(message, "AUTHORIZATION_ERROR", 403, details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string | number, details?: Record<string, unknown>) {
    super(
      id ? `${resource} with id "${id}" not found` : `${resource} not found`,
      "NOT_FOUND",
      404,
      { resource, id, ...details }
    );
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "CONFLICT", 409, details);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests", retryAfter?: number, details?: Record<string, unknown>) {
    super(message, "RATE_LIMIT_EXCEEDED", 429, { retryAfter, ...details });
  }
}

export class InternalError extends AppError {
  constructor(message = "Internal server error", cause?: Error, details?: Record<string, unknown>) {
    super(message, "INTERNAL_ERROR", 500, details, cause);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "BAD_REQUEST", 400, details);
  }
}

export class UnprocessableError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "UNPROCESSABLE_ENTITY", 422, details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = "Service temporarily unavailable", details?: Record<string, unknown>) {
    super(message, "SERVICE_UNAVAILABLE", 503, details);
  }
}

export class TimeoutError extends AppError {
  constructor(message = "Operation timed out", details?: Record<string, unknown>) {
    super(message, "TIMEOUT", 504, details);
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "CONFIGURATION_ERROR", 500, details);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, public readonly query?: string, cause?: Error, details?: Record<string, unknown>) {
    super(message, "DATABASE_ERROR", 500, { query, ...details }, cause);
  }
}

export class ConnectionError extends AppError {
  constructor(service: string, cause?: Error, details?: Record<string, unknown>) {
    super(`Failed to connect to ${service}`, "CONNECTION_ERROR", 503, { service, ...details }, cause);
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, cause?: Error, details?: Record<string, unknown>) {
    super(`${service}: ${message}`, "EXTERNAL_SERVICE_ERROR", 502, { service, ...details }, cause);
  }
}

export class KafkaError extends AppError {
  constructor(message: string, public readonly topic?: string, cause?: Error, details?: Record<string, unknown>) {
    super(message, "KAFKA_ERROR", 500, { topic, ...details }, cause);
  }
}

export class RedisError extends AppError {
  constructor(message: string, public readonly operation?: string, cause?: Error, details?: Record<string, unknown>) {
    super(message, "REDIS_ERROR", 500, { operation, ...details }, cause);
  }
}

export class WebSocketError extends AppError {
  constructor(message: string, public readonly clientId?: string, cause?: Error, details?: Record<string, unknown>) {
    super(message, "WEBSOCKET_ERROR", 500, { clientId, ...details }, cause);
  }
}

export class EncryptionError extends AppError {
  constructor(message: string, cause?: Error, details?: Record<string, unknown>) {
    super(message, "ENCRYPTION_ERROR", 500, details, cause);
  }
}

export class SerializationError extends AppError {
  constructor(message: string, cause?: Error, details?: Record<string, unknown>) {
    super(message, "SERIALIZATION_ERROR", 400, details, cause);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = "Request payload too large", details?: Record<string, unknown>) {
    super(message, "PAYLOAD_TOO_LARGE", 413, details);
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor(message = "Unsupported media type", details?: Record<string, unknown>) {
    super(message, "UNSUPPORTED_MEDIA_TYPE", 415, details);
  }
}

export const isAppError = (error: unknown): error is AppError => {
  return error instanceof AppError;
};

export const isOperationalError = (error: unknown): boolean => {
  if (!isAppError(error)) return false;
  return error.statusCode < 500;
};

export const getErrorStatusCode = (error: unknown): number => {
  if (isAppError(error)) return error.statusCode;
  return 500;
};

export const getErrorCode = (error: unknown): string => {
  if (isAppError(error)) return error.code;
  if (error instanceof Error) return "INTERNAL_ERROR";
  return "UNKNOWN_ERROR";
};

export const formatError = (error: unknown): Record<string, unknown> => {
  if (isAppError(error)) return error.toJSON();
  
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      code: "INTERNAL_ERROR",
      statusCode: 500,
      stack: error.stack,
    };
  }
  
  return {
    name: "UnknownError",
    message: String(error),
    code: "UNKNOWN_ERROR",
    statusCode: 500,
  };
};