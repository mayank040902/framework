import { createAuth, fastifyAdapter } from "@oneunit/auth";
import { startServer } from "@bootstrap-framework/server";
import { createKafkaBridge } from "@bootstrap-framework/realtime";
import {
  createDatabaseUserStore,
  createMemoryUserStore,
  ensureUsersTable,
} from "./store.js";
import { registerCombinedRoutes } from "./routes.js";

const authSecret = process.env.AUTH_SECRET ?? "change-me-in-production-use-a-long-random-string";
const databaseEnabled = Boolean(process.env.DATABASE_URL || process.env.DATABASE_HOST);
const redisEnabled = Boolean(process.env.REDIS_URL);
const kafkaEnabled = Boolean(process.env.KAFKA_BROKERS);

const memoryStore = createMemoryUserStore();

const auth = createAuth({
  secret: authSecret,
  issuer: process.env.SERVICE_NAME ?? "combined-api",
  accessTokenTtl: "15m",
  refreshTokenTtl: "7d",
  userStore: memoryStore,
  rbac: {
    defaultRole: "member",
    roles: {
      member: { permissions: ["profile.read", "events.write"] },
      admin: { inherits: "member", permissions: ["user.manage"] },
    },
  },
});

const { app, address } = await startServer({
  serviceName: process.env.SERVICE_NAME ?? "combined-api",
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 8080),
  logger: {
    useHttpLogger: true,
    mode: process.env.NODE_ENV === "production" ? "production" : "development",
    serviceName: process.env.SERVICE_NAME ?? "combined-api",
  },
  cors: {
    origin: process.env.CORS_ORIGIN?.split(",") ?? true,
    credentials: true,
  },
  helmet: true,
  cookie: { secret: process.env.COOKIE_SECRET ?? authSecret },
  compress: true,
  rateLimit: { max: 200, timeWindow: "1 minute" },
  database: databaseEnabled ? { application_name: "combined-api" } : false,
  redis: redisEnabled
    ? {
        url: process.env.REDIS_URL,
        maxRetriesPerRequest: null,
        healthCheck: true,
        healthCheckPath: "/health/redis",
      }
    : false,
  kafka: kafkaEnabled
    ? {
        brokers: process.env.KAFKA_BROKERS,
        clientId: process.env.KAFKA_CLIENT_ID ?? "combined-api",
        groupId: process.env.KAFKA_GROUP_ID ?? "combined-workers",
        autoConnectProducer: true,
      }
    : false,
  realtime: {
    websocketLibrary: "fastify",
  },
  extraPlugins: [fastifyAdapter(auth)],
  gracefulShutdown: true,
  configure: async (server) => {
    const appServer = server as typeof server & {
      db?: {
        query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
        queryOne: (sql: string, params?: unknown[]) => Promise<Record<string, unknown> | null>;
      };
      kafka?: { getConsumer: (groupId: string) => Promise<unknown> };
      realtime?: unknown;
      log: { info: (obj: unknown, msg?: string) => void };
    };

    if (appServer.db) {
      await ensureUsersTable(appServer.db);
      auth.userStore = createDatabaseUserStore(appServer.db);
    }

    await registerCombinedRoutes(appServer as never, auth);

    if (appServer.kafka && appServer.realtime) {
      const bridge = createKafkaBridge(appServer.kafka as never, appServer.realtime as never, appServer.log as never, {
        groupId: `${process.env.KAFKA_GROUP_ID ?? "combined-workers"}-realtime`,
        topics: ["user-events"],
        handlers: {
          "user-events": async (payload: { message?: { value?: unknown } }) => {
            const hub = appServer.realtime as { broadcast: (channel: string, message: unknown) => void };
            hub.broadcast("events", decodeKafkaValue(payload.message?.value) ?? payload);
          },
        },
      });
      await bridge.start();
      server.addHook("onClose", async () => {
        await bridge.stop();
      });
    }

    appServer.log.info({
      database: Boolean(appServer.db),
      redis: redisEnabled,
      kafka: kafkaEnabled,
      realtime: true,
      auth: true,
    }, "combined example plugins");
  },
});

app.log.info(`combined example listening at ${address}`);
app.log.info("POST /auth/register  POST /auth/login  GET /me  GET /health  WS /ws/events");

function decodeKafkaValue(value: unknown): unknown {
  if (value == null) {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    const text = value.toString("utf8");
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }
  return value;
}
