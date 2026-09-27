import { describe, it, expect, beforeEach, vi } from "vitest";
import { registerRealtime, createRealtimeHub } from "../src/plugin.js";

describe("registerRealtime", () => {
  it("decorates app.realtime with a hub", async () => {
    let capturedApp: unknown = null;
    const routes = [];
    const hooks = [];
    const app = {
      decorate(key: string, value: unknown) {
        (this as Record<string, unknown>)[key] = value;
      },
      register(plugin: unknown) {
        (this as Record<string, unknown>)._registeredPlugin = plugin;
      },
      get(path: string, opts: unknown, handler: unknown) {
        routes.push({ path, opts, handler });
      },
      addHook(event: string, fn: unknown) {
        hooks.push({ event, fn });
      },
      log: { info: () => {}, warn: () => {} },
    };

    await registerRealtime(app as any, {
      routes: async (fastify) => {
        capturedApp = fastify;
        fastify.get("/ws/test", { websocket: true }, async () => {});
      },
    });

    expect(app.realtime).toBeDefined();
    expect(app.realtime.channelCount("anything")).toBe(0);
    expect(capturedApp).toBe(app);
    expect(routes.length).toBe(1);
    expect(routes[0].path).toBe("/ws/test");
    expect(hooks.length).toBe(1);
    expect(hooks[0].event).toBe("onClose");
  });

  it("registers routes via options.routes", async () => {
    const routes = [];
    const app = {
      decorate(key: string, value: unknown) {
        (this as Record<string, unknown>)[key] = value;
      },
      register(plugin: unknown) {
        (this as Record<string, unknown>)._registeredPlugin = plugin;
      },
      get(path: string, opts: unknown, handler: unknown) {
        routes.push({ path, opts, handler });
      },
      addHook() {},
      log: { info: () => {}, warn: () => {} },
    };

    await registerRealtime(app as any, {
      routes: async (fastify) => {
        fastify.get("/ws/custom", { websocket: true }, async () => {});
      },
    });

    expect(app._registeredPlugin).toBeDefined();
    expect(routes.length).toBe(1);
    expect(routes[0].path).toBe("/ws/custom");
  });

  it("registers onClose hook that closes the hub", async () => {
    const app = {
      decorate(key: string, value: unknown) {
        (this as Record<string, unknown>)[key] = value;
      },
      register() {},
      get() {},
      addHook(event: string, fn: unknown) {
        if (event === "onClose") {
          (this as Record<string, unknown>)._onClose = fn;
        }
      },
      log: { info: () => {}, warn: () => {} },
    };

    await registerRealtime(app as any, {
      routes: async () => {},
    });

    expect(app.realtime).toBeDefined();
    expect(app.realtime.totalSubscribers()).toBe(0);

    await (app as any)._onClose();

    expect(app.realtime.totalSubscribers()).toBe(0);
    expect(app.realtime.channelCount("anything")).toBe(0);
  });

  it("works without options", async () => {
    const app = {
      decorate(key: string, value: unknown) {
        (this as Record<string, unknown>)[key] = value;
      },
      register() {},
      get() {},
      addHook() {},
      log: { info: () => {}, warn: () => {} },
    };

    await registerRealtime(app as any);

    expect(app.realtime).toBeDefined();
    expect(app.realtime.totalSubscribers()).toBe(0);
  });
});