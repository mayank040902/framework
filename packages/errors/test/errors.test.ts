import { describe, it, expect } from "vitest";
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InternalError,
  BadRequestError,
  UnprocessableError,
  ServiceUnavailableError,
  TimeoutError,
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
  UnsupportedMediaTypeError,
  isAppError,
  isOperationalError,
  getErrorStatusCode,
  getErrorCode,
  formatError,
} from "../src/index.js";

describe("Error classes", () => {
  it("AppError creates with correct properties", () => {
    const error = new AppError("Test error", "TEST_CODE", 400, { detail: "value" });
    expect(error.message).toBe("Test error");
    expect(error.code).toBe("TEST_CODE");
    expect(error.statusCode).toBe(400);
    expect(error.details).toEqual({ detail: "value" });
    expect(error.name).toBe("AppError");
  });

  it("AppError toJSON includes all properties", () => {
    const error = new AppError("Test", "CODE", 500, { key: "val" });
    const json = error.toJSON();
    expect(json.name).toBe("AppError");
    expect(json.message).toBe("Test");
    expect(json.code).toBe("CODE");
    expect(json.statusCode).toBe(500);
    expect(json.details).toEqual({ key: "val" });
    expect(json.stack).toBeDefined();
  });

  it("ValidationError includes fields", () => {
    const error = new ValidationError("Invalid input", { email: ["invalid format"] }, { extra: "data" });
    expect(error.fields).toEqual({ email: ["invalid format"] });
    expect(error.details).toEqual({ fields: { email: ["invalid format"] }, extra: "data" });
  });

  it("NotFoundError formats message with id", () => {
    const error = new NotFoundError("User", 123);
    expect(error.message).toBe('User with id "123" not found');
    expect(error.details?.resource).toBe("User");
    expect(error.details?.id).toBe(123);
  });

  it("NotFoundError works without id", () => {
    const error = new NotFoundError("Resource");
    expect(error.message).toBe("Resource not found");
  });

  it("RateLimitError includes retryAfter", () => {
    const error = new RateLimitError("Too many", 60);
    expect(error.details?.retryAfter).toBe(60);
  });

  it("InternalError wraps cause", () => {
    const cause = new Error("Original error");
    const error = new InternalError("Wrapped", cause);
    expect(error.cause).toBe(cause);
  });

  it("DatabaseError includes query", () => {
    const error = new DatabaseError("Query failed", "SELECT * FROM users");
    expect(error.details?.query).toBe("SELECT * FROM users");
  });

  it("ConnectionError includes service", () => {
    const error = new ConnectionError("Redis");
    expect(error.message).toBe("Failed to connect to Redis");
    expect(error.details?.service).toBe("Redis");
  });

  it("ExternalServiceError formats correctly", () => {
    const error = new ExternalServiceError("PaymentAPI", "Timeout");
    expect(error.message).toBe("PaymentAPI: Timeout");
    expect(error.details?.service).toBe("PaymentAPI");
  });

  it("KafkaError includes topic", () => {
    const error = new KafkaError("Consumer failed", "orders");
    expect(error.details?.topic).toBe("orders");
  });

  it("RedisError includes operation", () => {
    const error = new RedisError("Get failed", "GET");
    expect(error.details?.operation).toBe("GET");
  });

  it("WebSocketError includes clientId", () => {
    const error = new WebSocketError("Send failed", "client-123");
    expect(error.details?.clientId).toBe("client-123");
  });
});

describe("Type guards", () => {
  it("isAppError returns true for AppError instances", () => {
    expect(isAppError(new AppError("test", "CODE"))).toBe(true);
    expect(isAppError(new ValidationError("test", {}))).toBe(true);
    expect(isAppError(new Error("test"))).toBe(false);
    expect(isAppError("string")).toBe(false);
    expect(isAppError(null)).toBe(false);
  });

  it("isOperationalError returns true for 4xx errors", () => {
    expect(isOperationalError(new ValidationError("test", {}))).toBe(true);
    expect(isOperationalError(new AuthenticationError())).toBe(true);
    expect(isOperationalError(new NotFoundError("test"))).toBe(true);
    expect(isOperationalError(new InternalError())).toBe(false);
  });

  it("getErrorStatusCode returns correct codes", () => {
    expect(getErrorStatusCode(new ValidationError("test", {}))).toBe(400);
    expect(getErrorStatusCode(new AuthenticationError())).toBe(401);
    expect(getErrorStatusCode(new InternalError())).toBe(500);
    expect(getErrorStatusCode(new Error("test"))).toBe(500);
    expect(getErrorStatusCode("string")).toBe(500);
  });

  it("getErrorCode returns correct codes", () => {
    expect(getErrorCode(new ValidationError("test", {}))).toBe("VALIDATION_ERROR");
    expect(getErrorCode(new InternalError())).toBe("INTERNAL_ERROR");
    expect(getErrorCode(new Error("test"))).toBe("INTERNAL_ERROR");
    expect(getErrorCode("string")).toBe("UNKNOWN_ERROR");
  });

  it("formatError works for AppError", () => {
    const error = new ValidationError("Invalid", { field: ["required"] });
    const formatted = formatError(error);
    expect(formatted.code).toBe("VALIDATION_ERROR");
    expect(formatted.statusCode).toBe(400);
    expect(formatted.details).toEqual({ fields: { field: ["required"] } });
  });

  it("formatError works for plain Error", () => {
    const error = new Error("Plain error");
    const formatted = formatError(error);
    expect(formatted.code).toBe("INTERNAL_ERROR");
    expect(formatted.statusCode).toBe(500);
    expect(formatted.message).toBe("Plain error");
  });

  it("formatError works for unknown types", () => {
    const formatted = formatError("string error");
    expect(formatted.code).toBe("UNKNOWN_ERROR");
    expect(formatted.statusCode).toBe(500);
    expect(formatted.message).toBe("string error");
  });
});