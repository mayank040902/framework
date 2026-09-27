import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import {
  createBootstrapServer,
  createServer,
  startBootstrapServer,
  startServer,
  type BootstrapPlugin,
} from "../src/bootstrap.js";

const apps: FastifyInstance[] = [];

function track(app: FastifyInstance): FastifyInstance {
  apps.push(app);
  return app;
}

afterEach(async () => {
  for (const app of apps.splice(0)) {
    try {
      await app.close();
    } catch {
      // ignore close errors
    }
  }
});

describe("createBootstrapServer", () => {
  const baseOptions = {
    logger: false,
    kafka: false as const,
    realtime: false as const,
    env: false,
  };

  it("creates an app with default health route", async () => {
    const app = track(await createBootstrapServer({
      ...baseOptions,
      serviceName: "orders",
      health: {
        path: "/healthz",
        checks: { database: { status: true } },
      },
    }));

    const response = await app.inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ service: string; checks: Record<string, { status: boolean }> }>();
    expect(body.service).toBe("orders");
    expect(body.checks.database?.status).toBe(true);
  });

  it("returns 503 when an explicit health check fails", async () => {
    const app = track(await createBootstrapServer({
      ...baseOptions,
      health: {
        checks: { database: { status: false } },
      },
    }));

    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(503);
    expect(response.json<{ checks: Record<string, { status: boolean }> }>().checks.database?.status).toBe(false);
  });

  it("disables health route when health is false", async () => {
    const app = track(await createBootstrapServer({
      ...baseOptions,
      health: false,
    }));

    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(404);
  });

  it("registers custom plugins", async () => {
    const plugin: BootstrapPlugin = (server, options) => {
      server.get(options.path ?? "/plugin", async () => ({ value: options.value }));
    };

    const app = track(await createBootstrapServer({
      ...baseOptions,
      plugins: [{ plugin, options: { path: "/custom", value: "ok" } }],
      health: false,
    }));

    const response = await app.inject({ method: "GET", url: "/custom" });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ value: string }>();
    expect(body.value).toBe("ok");
  });

  it("calls configure callback", async () => {
    const app = track(await createBootstrapServer({
      ...baseOptions,
      configure: (server) => {
        server.get("/configured", async () => ({ configured: true }));
      },
      health: false,
    }));

    const response = await app.inject({ method: "GET", url: "/configured" });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ configured: boolean }>();
    expect(body.configured).toBe(true);
  });

  it("creates from port only", async () => {
    const app = track(await createServer(0, { logger: false, kafka: false, realtime: false, env: false }));
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
  });

  it("creates a server from port and configs", async () => {
    const app = track(await createServer(0, {
      logger: false,
      kafka: false,
      realtime: false,
      env: false,
      serviceName: "api",
      configure: (server) => {
        server.get("/ready", async () => ({ ok: true }));
      },
    }));

    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json<{ service: string }>().service).toBe("api");

    const ready = await app.inject({ method: "GET", url: "/ready" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json<{ ok: boolean }>().ok).toBe(true);
  });
});

describe("startBootstrapServer", () => {
  it("starts on requested host and ephemeral port", async () => {
    const { app, address, port, close } = await startBootstrapServer({
      logger: false,
      kafka: false,
      realtime: false,
      host: "127.0.0.1",
      port: 0,
      health: false,
      env: false,
    });
    track(app);

    expect(address).toContain("127.0.0.1");
    expect(port).toBeGreaterThan(0);
    expect(app.server.listening).toBe(true);
    await close();
  });

  it("uses default host and port when not specified", async () => {
    const { app, address } = await startBootstrapServer({
      logger: false,
      kafka: false,
      realtime: false,
      health: false,
      env: false,
      port: 0,
    });
    track(app);

    expect(address).toContain("127.0.0.1");
    expect(app.server.listening).toBe(true);
  });

  it("starts from port and configs without boilerplate", async () => {
    const started = await startServer(0, {
      logger: false,
      kafka: false,
      realtime: false,
      host: "127.0.0.1",
      env: false,
      serviceName: "gateway",
    });
    track(started.app);

    expect(started.port).toBeGreaterThan(0);
    expect(started.host).toContain("127.0.0.1");
    expect(started.app.server.listening).toBe(true);
  });
});

describe("plugins and hooks", () => {
  it("accepts named plugin config and extra plugins", async () => {
    const app = track(await createServer(0, {
      logger: false,
      kafka: false,
      realtime: false,
      env: false,
      plugins: {
        cors: { origin: true },
        helmet: false,
        rateLimit: false,
      },
      extraPlugins: [
        (server) => {
          server.get("/extra", async () => ({ extra: true }));
        },
      ],
    }));

    const response = await app.inject({ method: "GET", url: "/extra" });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ extra: boolean }>().extra).toBe(true);
  });

  it("registers request hooks", async () => {
    const app = track(await createServer({
      logger: false,
      kafka: false,
      realtime: false,
      env: false,
      port: 0,
      hooks: {
        onRequest: async (request) => {
          request.headers["x-hooked"] = "1";
        },
        onSend: async (_request, reply, payload) => {
          reply.header("x-service", "test");
          return payload;
        },
      },
      configure: (server) => {
        server.get("/hooked", async (request) => ({
          hooked: request.headers["x-hooked"] === "1",
        }));
      },
    }));

    const response = await app.inject({ method: "GET", url: "/hooked" });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ hooked: boolean }>().hooked).toBe(true);
    expect(response.headers["x-service"]).toBe("test");
  });
});
