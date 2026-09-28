import { createAuth, fastifyAdapter } from "@oneunit/auth";
import type { FastifyLike, FastifyRequestLike, UserRecord } from "@oneunit/auth";

interface ExampleFastify extends FastifyLike {
  register(plugin: unknown, options?: unknown): Promise<void> | void;
  post(path: string, handler: (request: FastifyRequestLike) => unknown): unknown;
  get(
    path: string,
    options: { preHandler: unknown[] },
    handler: (request: FastifyRequestLike) => unknown,
  ): unknown;
  authenticate(options?: { optional?: boolean }): unknown;
}

/** Stands in for your database lookup; roles are never read from the body. */
async function findUserByEmail(email: string): Promise<UserRecord> {
  return { id: "user_01", email, name: "Ada", roles: ["user"] };
}

export async function registerFastifyAuth(fastify: ExampleFastify): Promise<void> {
  const auth = createAuth({
    secret: process.env.AUTH_SECRET ?? "change-me-in-production",
    rbac: {
      roles: {
        user: { permissions: ["me.read"] },
        admin: { inherits: "user", permissions: ["stats.read"] },
      },
    },
  });

  // `optional: true` here is inherited by every route, so a route that does not
  // pass its own options still lets anonymous callers through.
  await fastify.register(fastifyAdapter(auth), { optional: true });

  fastify.post("/auth/login", async (request) => {
    const body = (request.body ?? {}) as { email?: string };
    const user = await findUserByEmail(String(body.email ?? ""));
    return auth.login(user);
  });

  fastify.post("/auth/refresh", async (request) => {
    const body = (request.body ?? {}) as { refreshToken?: string };
    // Rotation: the presented token is consumed and cannot be replayed.
    return auth.refresh(String(body.refreshToken ?? ""));
  });

  // Optional at the plugin level, so this route must opt back in explicitly.
  fastify.get(
    "/me",
    { preHandler: [fastify.authenticate({ optional: false })] },
    async (request) => ({ user: request.user }),
  );

  fastify.get(
    "/feed",
    { preHandler: [fastify.authenticate()] },
    async (request) => ({ user: request.user }),
  );
}
