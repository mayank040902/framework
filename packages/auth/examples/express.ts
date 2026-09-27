import { createAuth, expressAdapter } from "../src/index.js";
import type { ExpressRequestLike, ExpressResponseLike } from "../src/types.js";

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
  body?: { id?: string | number; email?: string; roles?: string[] };
  params?: { provider?: string };
}

interface ExampleResponse extends ExpressResponseLike {
  json?(body: unknown): unknown;
  redirect?(url: string): unknown;
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

export function registerAuthRoutes(app: ExampleApp): void {
  app.post("/auth/login", async (req, res) => {
    const session = await auth.login({
      id: req.body?.id as string | number,
      email: req.body?.email,
      roles: req.body?.roles ?? ["user"],
    });
    res.json?.(session);
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

  app.get("/me", authenticate(), (req, res) => {
    res.json?.({ user: req.user });
  });

  app.get("/stats", authenticate(), requirePermission("stats.read"), (req, res) => {
    res.json?.({ ok: true, userId: req.user?.userId });
  });
}
