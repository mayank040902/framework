import { createAuth, uwsAdapter } from "@oneunit/auth";
import type { UwsHttpRequest, UwsHttpResponse, UwsRequestSnapshot, UserRecord } from "@oneunit/auth";

interface ExampleUwsResponse extends UwsHttpResponse {
  onAborted(cb: () => void): void;
  onData(cb: (chunk: ArrayBuffer, isLast: boolean) => void): void;
}

interface ExampleUwsRequest extends UwsHttpRequest {
  getParameter?(index: number): string;
}

interface ExampleUwsApp {
  post(
    path: string,
    handler: (res: ExampleUwsResponse, req: ExampleUwsRequest) => void,
  ): ExampleUwsApp;
  get(
    path: string,
    handler: (res: ExampleUwsResponse, req: ExampleUwsRequest) => unknown,
  ): ExampleUwsApp;
  listen(port: number, cb: (token: unknown) => void): unknown;
}

// uWebSockets.js is not an npm dependency of this package — the adapter is pure
// and needs no import, only a server does. Install it from its GitHub package to
// actually run this example.
const uWS = {
  App(): ExampleUwsApp {
    console.log("Install uWebSockets.js to run this example: npm i uNetworking/uWebSockets.js");
    console.log("The uwsAdapter is pure and imports nothing; only the server does.");
    process.exit(0);
  },
};

const auth = createAuth({
  secret: process.env.AUTH_SECRET ?? "change-me-in-production",
  issuer: "uws-example",
  rbac: {
    defaultRole: "user",
    roles: {
      user: { permissions: ["me.read"] },
      admin: { inherits: "user", permissions: ["stats.read"] },
    },
  },
  providers: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: "http://localhost:3000/auth/google/callback",
    },
  },
});

const { authenticate, requirePermission, json } = uwsAdapter(auth);

const port = Number(process.env.PORT ?? 3000);

/**
 * Stands in for your database lookup. Roles come from the store, never from
 * the parsed request body, so a caller cannot choose their own grants.
 */
async function findUserByEmail(email: string): Promise<UserRecord> {
  return { id: "user_01", email, name: "Ada", roles: ["user"] };
}

uWS.App()
  .post("/auth/login", (res, _req) => {
    const aborted = { value: false };
    res.onAborted(() => {
      aborted.value = true;
    });

    let buffer = Buffer.alloc(0);
    res.onData((chunk: ArrayBuffer, isLast: boolean) => {
      buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
      if (!isLast) {
        return;
      }

      Promise.resolve()
        .then(async () => {
          const body = JSON.parse(buffer.toString("utf8") || "{}") as {
            email?: string;
          };
          // Roles come from your store, never from the parsed body. `auth.login()`
          // signs whatever record it is given and performs no authorization.
          const user = await findUserByEmail(String(body.email ?? ""));
          const session = await auth.login(user);
          if (!aborted.value) {
            json(res, 200, session);
          }
        })
        .catch((error: { status?: number; code?: string; message: string }) => {
          if (!aborted.value) {
            json(res, error.status ?? 400, {
              error: error.code ?? "AUTH_ERROR",
              message: error.message,
            });
          }
        });
    });
  })
  .get("/auth/:provider", (res, req) => {
    const provider = req.getParameter?.(0) ?? "";
    let aborted = false;
    res.onAborted(() => {
      aborted = true;
    });

    auth.getAuthorizationUrl(provider)
      .then(({ url }) => {
        if (aborted) {
          return;
        }
        res.cork?.(() => {
          res.writeStatus?.("302 Found");
          res.writeHeader?.("Location", url);
          res.end?.();
        });
      })
      .catch((error: { status?: number; code?: string; message: string }) => {
        if (!aborted) {
          json(res, error.status ?? 400, {
            error: error.code ?? "AUTH_ERROR",
            message: error.message,
          });
        }
      });
  })
  .get("/me", authenticate()((res, _req, request?: UwsRequestSnapshot) => {
    json(res, 200, { user: request?.user });
  }))
  .get("/stats", authenticate()(requirePermission("stats.read")((res, _req, request?: UwsRequestSnapshot) => {
    json(res, 200, { ok: true, userId: request?.user?.userId });
  })))
  .listen(port, (token: unknown) => {
    if (token) {
      console.log(`uWebSockets.js listening on ${port}`);
    } else {
      console.error(`Failed to listen on ${port}`);
    }
  });
