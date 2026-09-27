import { describe, it, expect, vi } from "vitest";
import fastify from "fastify";
import { createErrorHandler, registerErrorHandler, errorHandlerPlugin, formatValidationError } from "../src/fastify.js";
import { ValidationError, AuthenticationError, NotFoundError, InternalError, AppError } from "../src/index.js";

describe("Fastify error handler", () => {
  it("handles AppError instances", async () => {
    const app = fastify();
    app.setErrorHandler(createErrorHandler());

    app.get("/test", async () => {
      throw new ValidationError("Invalid input", { email: ["required"] });
    });

    const response = await app.inject({ method: "GET", url: "/test" });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.fields).toEqual({ email: ["required"] });
  });

  it("handles AuthenticationError", async () => {
    const app = fastify();
    app.setErrorHandler(createErrorHandler());

    app.get("/protected", async () => {
      throw new AuthenticationError("Token expired");
    });

    const response = await app.inject({ method: "GET", url: "/protected" });
    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error.code).toBe("AUTHENTICATION_ERROR");
  });

  it("handles NotFoundError", async () => {
    const app = fastify();
    app.setErrorHandler(createErrorHandler());

    app.get("/not-found", async () => {
      throw new NotFoundError("User", 123);
    });

    const response = await app.inject({ method: "GET", url: "/not-found" });
    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("handles plain Error", async () => {
    const app = fastify();
    app.setErrorHandler(createErrorHandler());

    app.get("/error", async () => {
      throw new Error("Something broke");
    });

    const response = await app.inject({ method: "GET", url: "/error" });
    expect(response.statusCode).toBe(500);
    const body = response.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });

  it("handles unknown throw values", async () => {
    const app = fastify();
    app.setErrorHandler(createErrorHandler());

    app.get("/unknown", async () => {
      throw "string error";
    });

    const response = await app.inject({ method: "GET", url: "/unknown" });
    expect(response.statusCode).toBe(500);
    const body = response.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });

  it("includes timestamp and request info", async () => {
    const app = fastify();
    app.setErrorHandler(createErrorHandler());

    app.get("/test", async () => {
      throw new ValidationError("test", {});
    });

    const response = await app.inject({ method: "GET", url: "/test" });
    const body = response.json();
    expect(body.timestamp).toBeDefined();
    expect(body.path).toBe("/test");
    expect(body.requestId).toBeDefined();
  });

  it("excludes stack by default", async () => {
    const app = fastify();
    app.setErrorHandler(createErrorHandler());

    app.get("/test", async () => {
      throw new ValidationError("test", {});
    });

    const response = await app.inject({ method: "GET", url: "/test" });
    const body = response.json();
    expect(body.error.stack).toBeUndefined();
  });

  it("includes stack when option enabled", async () => {
    const app = fastify();
    app.setErrorHandler(createErrorHandler({ includeStack: true }));

    app.get("/test", async () => {
      throw new ValidationError("test", {});
    });

    const response = await app.inject({ method: "GET", url: "/test" });
    const body = response.json();
    expect(body.error.stack).toBeDefined();
  });

  it("uses custom handler when provided", async () => {
    const customHandler = vi.fn().mockResolvedValue(undefined);
    const app = fastify();
    app.setErrorHandler(createErrorHandler({ customHandler }));

    app.get("/test", async () => {
      throw new ValidationError("test", {});
    });

    await app.inject({ method: "GET", url: "/test" });
    expect(customHandler).toHaveBeenCalled();
  });

  it("registerErrorHandler registers globally", async () => {
    const app = fastify();
    await registerErrorHandler(app);

    app.get("/test", async () => {
      throw new ValidationError("test", {});
    });

    const response = await app.inject({ method: "GET", url: "/test" });
    expect(response.statusCode).toBe(400);
  });

  it("errorHandlerPlugin works as Fastify plugin", async () => {
    const app = fastify();
    await app.register(errorHandlerPlugin, { includeStack: true });

    app.get("/test", async () => {
      throw new ValidationError("test", {});
    });

    const response = await app.inject({ method: "GET", url: "/test" });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.stack).toBeDefined();
  });
});

describe("formatValidationError", () => {
  it("formats validation error response", () => {
    const error = new ValidationError("Invalid", { email: ["required"], name: ["too short"] });
    const mockRequest = {
      url: "/test",
      id: "req-123",
    } as any;
    
    const formatted = formatValidationError(error, mockRequest);
    
    expect(formatted.statusCode).toBe(400);
    expect(formatted.error).toBe("Validation Error");
    expect(formatted.fields).toEqual({ email: ["required"], name: ["too short"] });
    expect(formatted.timestamp).toBeDefined();
    expect(formatted.path).toBe("/test");
    expect(formatted.requestId).toBe("req-123");
  });
});