import { createAuth, expressAdapter } from "@oneunit/auth";
import type { ExpressRequestLike, ExpressResponseLike, UserRecord } from "@oneunit/auth";

const auth = createAuth({
  secret: process.env.AUTH_SECRET ?? "change-me-in-production",
  rbac: {
    roles: {
      user: { permissions: ["me.read"] },
      admin: { inherits: "user", permissions: ["stats.read"] },
    },
  },
  oauth: {
    redirectUri: "http://localhost:3000/auth/google/callback",
    providers: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      },
      github: {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        redirectUri: "http://localhost:3000/auth/github/callback",
      },
    },
  },
});

const { authenticate, requirePermission } = expressAdapter(auth);

interface ExampleRequest extends ExpressRequestLike {
  body?: { id?: string | number; email?: string; password?: string };
  params?: { provider?: string };
}

interface ExampleResponse extends ExpressResponseLike {
  json?(body: unknown): unknown;
  redirect?(url: unknown): unknown;
}

type ExampleHandler = (
  req: ExampleRequest,
  res: ExampleResponse,
  next?: (error?: unknown) => void,
) => unknown;

interface ExampleApp {
  post(path: string, handler: ExampleHandler): unknown;
  get(path: string, ...handlers: ExampleHandler[]): unknown;
}

/**
 * Stands in for your database lookup. Roles come from the store, never from
 * the request body: `auth.login()` signs whatever record it is given, so
 * forwarding `req.body.roles` would let the caller choose their own grants.
 */
async function findUserByEmail(email: string): Promise<UserRecord> {
  return { id: "user_01", email, name: "Ada", roles: ["user"] };
}

export function registerAuthRoutes(app: ExampleApp): void {
  app.post("/auth/login", async (req, res) => {
    const user = await findUserByEmail(String(req.body?.email ?? ""));
    if (!user) {
      res.json?.({ error: "INVALID_CREDENTIALS", message: "Unknown user" });
      return;
    }
    res.json?.(await auth.login(user));
  });

  app.post("/auth/refresh", async (req, res) => {
    const refreshToken = (req.body as { refreshToken?: string } | undefined)?.refreshToken;
    if (!refreshToken) {
      res.json?.({ error: "UNAUTHORIZED", message: "refreshToken is required" });
      return;
    }
    // Rotation: the presented token is consumed and cannot be reused. A second
    // call with the same token fails with UNAUTHORIZED.
    res.json?.(await auth.refresh(refreshToken));
  });

  app.post("/auth/logout", async (req, res) => {
    const refreshToken = (req.body as { refreshToken?: string } | undefined)?.refreshToken;
    res.json?.({ revoked: await auth.logout(refreshToken) });
  });

  app.get("/auth/:provider", async (req, res) => {
    const { url } = await auth.getAuthorizationUrl(String(req.params?.provider));
    res.redirect?.(url);
  });

  app.get("/auth/:provider/callback", async (req, res) => {
    const session = await auth.loginWithOAuth(
      String(req.params?.provider),
      (req.query ?? {}) as Record<string, string>,
    );
    res.json?.(session);
  });

  // `optional: true` lets anonymous callers through; request.user is null.
  app.get("/feed", authenticate({ optional: true }), (req, res) => {
    res.json?.({ user: req.user });
  });

  app.get("/me", authenticate(), (req, res) => {
    res.json?.({ user: req.user });
  });

  app.get("/stats", authenticate(), requirePermission("stats.read"), (req, res) => {
    res.json?.({ ok: true, userId: req.user?.userId });
  });
}
