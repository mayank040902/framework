import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createAuth, createAdapters } from "../src/index.js";
import type { JwtPayload } from "../src/index.js";

const SECRET = "adapter-secret-key-for-tests-123456";

describe("adapters", () => {
  it("creates express, fastify, and koa adapters", () => {
    const auth = createAuth({ secret: SECRET });
    const adapters = createAdapters(auth);
    assert.equal(typeof adapters.express.authenticate, "function");
    assert.equal(typeof adapters.fastify, "function");
    assert.equal(typeof adapters.koa.authenticate, "function");
    assert.equal(typeof adapters.uws.authenticate, "function");
  });

  it("koa authenticate sets ctx.state.user", async () => {
    const auth = createAuth({ secret: SECRET });
    const { accessToken } = await auth.login({ id: 5, roles: ["user"] });
    const { koa } = createAdapters(auth);
    const ctx = {
      request: { headers: { authorization: `Bearer ${accessToken}` } },
      state: {} as { user?: JwtPayload | null },
      status: 200,
      body: null as unknown,
    };
    let called = false;
    await koa.authenticate()(ctx, async () => {
      called = true;
    });
    assert.equal(called, true);
    assert.equal(ctx.state.user?.userId, 5);
  });

  it("koa requirePermission blocks missing grants", async () => {
    const auth = createAuth({
      secret: SECRET,
      rbac: { roles: { user: { permissions: ["read"] } } },
    });
    const { koa } = createAdapters(auth);
    const ctx = {
      request: { headers: {} },
      state: { user: { roles: ["user"] } },
      status: 200,
      body: null as unknown,
    };
    await koa.requirePermission("write")(ctx, async () => {});
    assert.equal(ctx.status, 403);
  });
});
