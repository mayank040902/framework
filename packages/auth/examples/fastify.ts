import { createAuth, fastifyAdapter } from "../src/index.js";
import type { FastifyLike, FastifyRequestLike } from "../src/types.js";

interface ExampleFastify extends FastifyLike {
  register(plugin: unknown): Promise<void> | void;
  post(path: string, handler: (request: FastifyRequestLike) => unknown): unknown;
  get(
    path: string,
    options: { preHandler: unknown[] },
    handler: (request: FastifyRequestLike) => unknown,
  ): unknown;
  authenticate(): unknown;
}

export async function registerFastifyAuth(fastify: ExampleFastify): Promise<void> {
  const auth = createAuth({
    secret: process.env.AUTH_SECRET ?? "change-me-in-production",
    rbac: {
      roles: {
        user: { permissions: ["me.read"] },
      },
    },
  });

  await fastify.register(fastifyAdapter(auth));

  fastify.post("/auth/login", async (request) => {
    const body = (request.body ?? {}) as { id?: string | number; email?: string };
    return auth.login({
      id: body.id as string | number,
      email: body.email,
      roles: ["user"],
    });
  });

  fastify.get("/me", { preHandler: [fastify.authenticate()] }, async (request) => {
    return request.user;
  });
}
