import fastify, {
  type FastifyInstance,
  type FastifyListenOptions,
  type FastifyPluginOptions,
  type FastifyServerOptions,
} from "fastify";
import { createHealthPlugin, type BootstrapHealthOptions } from "./routes/health.js";
import { serviceConfig } from "./config/env-services.js";
import { loadEnv, type LoadEnvOptions } from "./config/load-env.js";
import {
  mergeBuiltinPlugins,
  registerBuiltinPlugins,
  type BuiltinPluginsOptions,
  type LoggerPluginOptions,
  type DatabasePluginOptions,
} from "./plugins/index.js";
import { registerHooks, type BootstrapHooks } from "./hooks/index.js";

export type BootstrapPlugin = (
  server: FastifyInstance,
  options: FastifyPluginOptions,
  done?: (error?: Error) => void,
) => void | Promise<void>;

export interface BootstrapPluginRegistration {
  plugin: BootstrapPlugin;
  options?: FastifyPluginOptions;
}

export type BootstrapPluginEntry = BootstrapPlugin | BootstrapPluginRegistration;
export type BootstrapConfigurer = (server: FastifyInstance) => void | Promise<void>;

export interface BootstrapServerOptions {
  serviceName?: string;
  host?: string;
  port?: number;
  cors?: BuiltinPluginsOptions["cors"];
  helmet?: BuiltinPluginsOptions["helmet"];
  cookie?: BuiltinPluginsOptions["cookie"];
  compress?: BuiltinPluginsOptions["compress"];
  rateLimit?: BuiltinPluginsOptions["rateLimit"];
  zod?: BuiltinPluginsOptions["zod"];
  logger?: boolean | LoggerPluginOptions | FastifyServerOptions["logger"];
  database?: boolean | DatabasePluginOptions;
  kafka?: boolean | BuiltinPluginsOptions["kafka"];
  realtime?: boolean | BuiltinPluginsOptions["realtime"];
  fastify?: FastifyServerOptions;
  plugins?: BootstrapPluginEntry[] | BuiltinPluginsOptions;
  extraPlugins?: BootstrapPluginEntry[];
  hooks?: BootstrapHooks;
  configure?: BootstrapConfigurer;
  health?: false | BootstrapHealthOptions;
  listen?: FastifyListenOptions;
  env?: false | LoadEnvOptions;
  gracefulShutdown?: boolean;
}

export interface StartedBootstrapServer {
  app: FastifyInstance;
  address: string;
  port: number;
  host: string;
  close: () => Promise<void>;
}

function isPluginList(value: BootstrapServerOptions["plugins"]): value is BootstrapPluginEntry[] {
  return Array.isArray(value);
}

function resolveOptions(
  portOrOptions?: number | BootstrapServerOptions,
  options?: BootstrapServerOptions,
): BootstrapServerOptions {
  if (typeof portOrOptions === "number") {
    return { ...options, port: portOrOptions };
  }

  return { ...portOrOptions, ...options };
}

function resolveBuiltinPluginOptions(options: BootstrapServerOptions): BuiltinPluginsOptions {
  const named = isPluginList(options.plugins) ? undefined : options.plugins;
  const loggerOptions = options.logger === true ? { useHttpLogger: true } : options.logger;
  const databaseOptions = options.database === true ? { logQueries: false } : options.database;
  const kafkaOptions = options.kafka === true ? { autoConnectProducer: false } : options.kafka;
  const realtimeOptions = options.realtime === true ? { websocketLibrary: "fastify" as const } : options.realtime;
  return mergeBuiltinPlugins({
    cors: options.cors,
    helmet: options.helmet,
    cookie: options.cookie,
    compress: options.compress,
    rateLimit: options.rateLimit,
    zod: options.zod,
    logger: typeof loggerOptions === "object" && loggerOptions !== null
      ? { ...loggerOptions, serviceName: options.serviceName }
      : loggerOptions,
    database: databaseOptions,
    kafka: kafkaOptions,
    realtime: realtimeOptions,
  }, named);
}

function resolvePluginEntries(options: BootstrapServerOptions): BootstrapPluginEntry[] {
  const listed = isPluginList(options.plugins) ? options.plugins : [];
  return [...listed, ...(options.extraPlugins ?? [])];
}

async function registerPlugin(
  server: FastifyInstance,
  entry: BootstrapPluginEntry,
): Promise<void> {
  if (typeof entry === "function") {
    await server.register(entry);
  } else {
    await server.register(entry.plugin, entry.options ?? {});
  }
}

function attachGracefulShutdown(server: FastifyInstance): void {
  const shutdown = async () => {
    try {
      await server.close();
    } finally {
      process.exit(0);
    }
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdown();
    });
  }
}

export async function createBootstrapServer(
  portOrOptions?: number | BootstrapServerOptions,
  options?: BootstrapServerOptions,
): Promise<FastifyInstance> {
  const resolved = resolveOptions(portOrOptions, options);

  if (resolved.env !== false) {
    await loadEnv(resolved.env ?? {});
  }

  const defaults = serviceConfig(
    resolved.port ?? 8080,
    resolved.host ?? "127.0.0.1",
    resolved.serviceName ?? "app",
  );

  const logger = resolved.logger === false ? false : (resolved.fastify?.logger ?? !defaults.isTest);
  const server = fastify({
    ...resolved.fastify,
    logger,
  });

  registerHooks(server, resolved.hooks);
  await registerBuiltinPlugins(server, resolveBuiltinPluginOptions(resolved));

  if (resolved.health !== false) {
    const healthOptions = resolved.health ?? {};
    await server.register(createHealthPlugin({
      serviceName: resolved.serviceName ?? defaults.serviceName,
      ...healthOptions,
    }));
  }

  for (const entry of resolvePluginEntries(resolved)) {
    await registerPlugin(server, entry);
  }

  await resolved.configure?.(server);

  return server;
}

export async function startBootstrapServer(
  portOrOptions?: number | BootstrapServerOptions,
  options?: BootstrapServerOptions,
): Promise<StartedBootstrapServer> {
  const resolved = resolveOptions(portOrOptions, options);
  const app = await createBootstrapServer(resolved);

  const defaults = serviceConfig(
    resolved.port ?? 8080,
    resolved.host ?? "127.0.0.1",
    resolved.serviceName ?? "app",
  );

  const listenOptions = resolved.listen ?? {
    host: resolved.host ?? defaults.host,
    port: resolved.port ?? defaults.port,
  };

  const address = await app.listen(listenOptions);
  const addressInfo = app.server.address();
  const boundPort = typeof addressInfo === "object" && addressInfo
    ? addressInfo.port
    : Number(listenOptions.port ?? defaults.port);
  const boundHost = typeof addressInfo === "object" && addressInfo
    ? addressInfo.address
    : String(listenOptions.host ?? defaults.host);

  if (resolved.gracefulShutdown) {
    attachGracefulShutdown(app);
  }

  return {
    app,
    address,
    port: boundPort,
    host: boundHost,
    close: () => app.close(),
  };
}

export type { LoadEnvOptions } from "./config/load-env.js";
export type { BuiltinPluginsOptions, PluginConfig, LoggerPluginOptions, DatabasePluginOptions } from "./plugins/index.js";
export type { BootstrapHooks, HookList } from "./hooks/index.js";

export const createServer = createBootstrapServer;
export const startServer = startBootstrapServer;