import { AuthError, ForbiddenError, UnauthorizedError } from "./errors.js";
import type { Auth } from "./auth.js";
import type {
  ExpressNext,
  ExpressRequestLike,
  ExpressResponseLike,
  ExtractTokenOptions,
  FastifyLike,
  FastifyReplyLike,
  FastifyRequestLike,
  KoaContextLike,
  UwsHandler,
  UwsHttpRequest,
  UwsHttpResponse,
  UwsRequestSnapshot,
} from "./types.js";

function sendError(reply: ExpressResponseLike, error: unknown): void {
  const err = error as AuthError;
  const status = err.status ?? 401;
  const body = {
    error: err.code ?? "AUTH_ERROR",
    message: err.message,
  };

  if (typeof reply.status === "function" && typeof reply.send === "function") {
    const next = reply.status(status);
    if (next && typeof next.send === "function") {
      next.send(body);
    } else {
      reply.send(body);
    }
    return;
  }
  if (typeof reply.code === "function") {
    const coded = reply.code(status);
    const send = coded.send ?? reply.send;
    if (typeof send === "function") {
      send.call(coded, body);
      return;
    }
  }
  if (typeof reply.status === "function") {
    reply.status(status);
    reply.body = body;
    return;
  }
  throw error;
}

export function expressAdapter(auth: Auth) {
  return {
    initialize() {
      return (req: ExpressRequestLike, _res: ExpressResponseLike, next?: ExpressNext) => {
        req.auth = auth;
        next?.();
      };
    },

    authenticate(options: ExtractTokenOptions = {}) {
      return async (req: ExpressRequestLike, res: ExpressResponseLike, next?: ExpressNext) => {
        try {
          req.user = await auth.verifyRequest(req, options);
          req.token = auth.extractToken(req, options);
          next?.();
        } catch (error) {
          if (options.optional && error instanceof UnauthorizedError) {
            req.user = null;
            next?.();
            return;
          }
          if (options.passthrough) {
            next?.(error);
            return;
          }
          sendError(res, error);
        }
      };
    },

    requirePermission(...permissions: string[]) {
      return (req: ExpressRequestLike, res: ExpressResponseLike, next?: ExpressNext) => {
        try {
          if (!req.user) {
            throw new UnauthorizedError("Authentication required");
          }
          auth.authorize(req.user, permissions);
          next?.();
        } catch (error) {
          sendError(res, error);
        }
      };
    },

    requireRole(...roles: string[]) {
      return (req: ExpressRequestLike, res: ExpressResponseLike, next?: ExpressNext) => {
        try {
          if (!req.user) {
            throw new UnauthorizedError("Authentication required");
          }
          if (!auth.hasRole(req.user, roles)) {
            throw new ForbiddenError("Insufficient role");
          }
          next?.();
        } catch (error) {
          sendError(res, error);
        }
      };
    },
  };
}

export function fastifyAdapter(auth: Auth) {
  return async function plugin(fastify: FastifyLike, options: ExtractTokenOptions = {}) {
    fastify.decorate("auth", auth);
    fastify.decorateRequest("user", null);

    fastify.decorate("authenticate", (opts: ExtractTokenOptions = {}) => async (request: FastifyRequestLike, reply: FastifyReplyLike) => {
      try {
        request.user = await auth.verifyRequest(request, { ...options, ...opts });
      } catch (error) {
        if (opts.optional && error instanceof UnauthorizedError) {
          request.user = null;
          return;
        }
        const err = error as AuthError;
        return reply.code(err.status ?? 401).send({
          error: err.code ?? "AUTH_ERROR",
          message: err.message,
        });
      }
    });

    fastify.decorate("requirePermission", (...permissions: string[]) => async (request: FastifyRequestLike, reply: FastifyReplyLike) => {
      if (!request.user) {
        return reply.code(401).send({ error: "UNAUTHORIZED", message: "Authentication required" });
      }
      if (!auth.can(request.user, permissions)) {
        return reply.code(403).send({ error: "FORBIDDEN", message: "Missing permission" });
      }
    });

    fastify.decorate("requireRole", (...roles: string[]) => async (request: FastifyRequestLike, reply: FastifyReplyLike) => {
      if (!request.user) {
        return reply.code(401).send({ error: "UNAUTHORIZED", message: "Authentication required" });
      }
      if (!auth.hasRole(request.user, roles)) {
        return reply.code(403).send({ error: "FORBIDDEN", message: "Insufficient role" });
      }
    });
  };
}

export function koaAdapter(auth: Auth) {
  return {
    authenticate(options: ExtractTokenOptions = {}) {
      return async (ctx: KoaContextLike, next: () => Promise<void>) => {
        try {
          ctx.state.user = await auth.verifyRequest(ctx.request, options);
          ctx.state.token = auth.extractToken(ctx.request, options);
          await next();
        } catch (error) {
          if (options.optional && error instanceof UnauthorizedError) {
            ctx.state.user = null;
            await next();
            return;
          }
          const err = error as AuthError;
          ctx.status = err.status ?? 401;
          ctx.body = { error: err.code ?? "AUTH_ERROR", message: err.message };
        }
      };
    },

    requirePermission(...permissions: string[]) {
      return async (ctx: KoaContextLike, next: () => Promise<void>) => {
        if (!ctx.state.user) {
          ctx.status = 401;
          ctx.body = { error: "UNAUTHORIZED", message: "Authentication required" };
          return;
        }
        if (!auth.can(ctx.state.user, permissions)) {
          ctx.status = 403;
          ctx.body = { error: "FORBIDDEN", message: "Missing permission" };
          return;
        }
        await next();
      };
    },
  };
}

function jsonResponse(res: UwsHttpResponse, status: number, body: unknown): void {
  if (typeof res.cork === "function") {
    res.cork(() => {
      res.writeStatus?.(String(status));
      res.writeHeader?.("Content-Type", "application/json; charset=utf-8");
      res.end?.(JSON.stringify(body));
    });
    return;
  }

  if (typeof res.writeStatus === "function") {
    res.writeStatus(String(status));
    res.writeHeader?.("Content-Type", "application/json; charset=utf-8");
    res.end?.(JSON.stringify(body));
  }
}

function attachAbort(res: UwsHttpResponse): () => boolean {
  let aborted = false;
  if (typeof res.onAborted === "function") {
    res.onAborted(() => {
      aborted = true;
    });
  }
  return () => aborted;
}

export function snapshotUwsRequest(
  res: UwsHttpResponse,
  req: UwsHttpRequest,
  extra: Partial<UwsRequestSnapshot> = {},
): UwsRequestSnapshot {
  const headers: Record<string, string> = {};
  if (typeof req.forEach === "function") {
    req.forEach((key, value) => {
      headers[key] = value;
    });
  } else {
    const authorization = req.getHeader?.("authorization");
    const cookie = req.getHeader?.("cookie");
    if (authorization) headers.authorization = authorization;
    if (cookie) headers.cookie = cookie;
  }

  return {
    method: req.getMethod?.() ?? extra.method,
    url: req.getUrl?.() ?? extra.url,
    query: req.getQuery?.() ?? extra.query,
    headers,
    cookies: extra.cookies,
    res,
  };
}

export function uwsAdapter(auth: Auth) {
  return {
    snapshot: snapshotUwsRequest,

    authenticate(options: ExtractTokenOptions = {}) {
      return (handler: UwsHandler): UwsHandler => async (res, req) => {
        const aborted = attachAbort(res);
        const request = snapshotUwsRequest(res, req);

        try {
          request.user = await auth.verifyRequest(request, options);
          request.token = auth.extractToken(request, options);
          if (aborted()) {
            return;
          }
          return await handler(res, req, request);
        } catch (error) {
          if (options.optional && error instanceof UnauthorizedError) {
            request.user = null;
            if (aborted()) {
              return;
            }
            return await handler(res, req, request);
          }
          if (aborted()) {
            return;
          }
          const err = error as AuthError;
          jsonResponse(res, err.status ?? 401, {
            error: err.code ?? "AUTH_ERROR",
            message: err.message,
          });
        }
      };
    },

    requirePermission(...permissions: string[]) {
      const requested = permissions.flat();
      return (handler: UwsHandler): UwsHandler => async (res, req, request) => {
        const snapshot = request ?? snapshotUwsRequest(res, req);
        if (!snapshot.user) {
          jsonResponse(res, 401, { error: "UNAUTHORIZED", message: "Authentication required" });
          return;
        }
        if (!auth.can(snapshot.user, requested)) {
          jsonResponse(res, 403, { error: "FORBIDDEN", message: "Missing permission" });
          return;
        }
        return await handler(res, req, snapshot);
      };
    },

    requireRole(...roles: string[]) {
      const requested = roles.flat();
      return (handler: UwsHandler): UwsHandler => async (res, req, request) => {
        const snapshot = request ?? snapshotUwsRequest(res, req);
        if (!snapshot.user) {
          jsonResponse(res, 401, { error: "UNAUTHORIZED", message: "Authentication required" });
          return;
        }
        if (!auth.hasRole(snapshot.user, requested)) {
          jsonResponse(res, 403, { error: "FORBIDDEN", message: "Insufficient role" });
          return;
        }
        return await handler(res, req, snapshot);
      };
    },

    json: jsonResponse,
  };
}

export function createAdapters(auth: Auth) {
  return {
    express: expressAdapter(auth),
    fastify: fastifyAdapter(auth),
    koa: koaAdapter(auth),
    uws: uwsAdapter(auth),
    uWebSockets: uwsAdapter(auth),
  };
}
