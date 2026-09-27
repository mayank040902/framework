import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

export type PluginConfig<T extends object = Record<string, unknown>> = boolean | T;

export interface DatabasePluginOptions {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  ssl?: boolean | object;
  application_name?: string;
  logQueries?: boolean;
  logParameters?: boolean;
  slowQueryMs?: number;
  queryTimeout?: number;
  connectTimeout?: number;
  retry?: boolean | number | object;
  onQuery?: (info: { sql?: string; parameters?: unknown[]; durationMs: number; rowCount?: number; success: boolean }) => void;
  onError?: (info: { error: Error; sql?: string; durationMs: number }) => void;
  onRetry?: (info: { attempt: number; error: Error }) => void;
}

export interface KafkaPluginOptions {
  brokers?: string | string[];
  clientId?: string;
  groupId?: string;
  ssl?: boolean | object;
  sasl?: boolean | object;
  retry?: object;
  logLevel?: string;
  partitioner?: string;
  autoConnectProducer?: boolean;
  consumerGroupId?: string;
  subscribeTopics?: string | string[];
  onMessage?: (payload: { topic: string; partition: number; key: unknown; value: unknown }) => Promise<void>;
  producer?: object;
  consumer?: object;
  admin?: object;
}

export interface RedisPluginOptions {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  lazyConnect?: boolean;
  healthCheck?: boolean;
  healthCheckPath?: string;
  [key: string]: unknown;
}

export interface RealtimePluginOptions {
  websocketLibrary?: "fastify" | "ws";
  path?: string;
  routes?: (app: FastifyInstance) => Promise<void>;
}

export interface ErrorHandlerPluginOptions {
  includeStack?: boolean;
  logErrors?: boolean;
  customHandler?: (error: unknown, request: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

export interface MsgpackPluginOptions {
  enableBuiltin?: boolean;
  extensions?: unknown[];
}

export interface BuiltinPluginsOptions {
  cors?: PluginConfig;
  helmet?: PluginConfig;
  cookie?: PluginConfig;
  compress?: PluginConfig;
  rateLimit?: PluginConfig;
  zod?: boolean;
  logger?: PluginConfig<LoggerPluginOptions>;
  database?: PluginConfig<DatabasePluginOptions>;
  kafka?: PluginConfig<KafkaPluginOptions>;
  redis?: PluginConfig<RedisPluginOptions>;
  realtime?: PluginConfig<RealtimePluginOptions>;
  errorHandler?: PluginConfig<ErrorHandlerPluginOptions>;
  msgpack?: PluginConfig<MsgpackPluginOptions>;
}

export interface LoggerPluginOptions {
  useHttpLogger?: boolean;
  serviceName?: string;
  mode?: "development" | "production" | "test";
  serializers?: Record<string, unknown>;
  childBindings?: Record<string, unknown>;
}

interface PluginSpec {
  key: keyof Omit<BuiltinPluginsOptions, "zod">;
  specifier: string;
  defaults: Record<string, unknown>;
}

export const DEFAULT_BUILTIN_PLUGINS: BuiltinPluginsOptions = {
  cors: { origin: true, credentials: true },
  helmet: true,
  cookie: true,
  compress: true,
  rateLimit: { max: 1000, timeWindow: "1 minute" },
  zod: true,
  logger: { useHttpLogger: true },
  database: { logQueries: false },
  kafka: { autoConnectProducer: false },
  redis: { healthCheck: false },
  realtime: { websocketLibrary: "fastify" },
  errorHandler: { includeStack: false, logErrors: true },
  msgpack: { enableBuiltin: true },
};

const OPTIONAL_PLUGINS: PluginSpec[] = [
  {
    key: "cors",
    specifier: "@fastify/cors",
    defaults: { origin: true, credentials: true },
  },
  {
    key: "helmet",
    specifier: "@fastify/helmet",
    defaults: {},
  },
  {
    key: "cookie",
    specifier: "@fastify/cookie",
    defaults: {},
  },
  {
    key: "compress",
    specifier: "@fastify/compress",
    defaults: {},
  },
  {
    key: "rateLimit",
    specifier: "@fastify/rate-limit",
    defaults: { max: 1000, timeWindow: "1 minute" },
  },
  {
    key: "logger",
    specifier: "./logger.js",
    defaults: { useHttpLogger: true },
  },
  {
    key: "database",
    specifier: "./database.js",
    defaults: { logQueries: false },
  },
  {
    key: "kafka",
    specifier: "./kafka.js",
    defaults: { autoConnectProducer: false },
  },
  {
    key: "redis",
    specifier: "./redis.js",
    defaults: { healthCheck: false },
  },
  {
    key: "realtime",
    specifier: "./realtime.js",
    defaults: { websocketLibrary: "fastify" },
  },
  {
    key: "errorHandler",
    specifier: "./errors.js",
    defaults: { includeStack: false, logErrors: true },
  },
  {
    key: "msgpack",
    specifier: "../lib/msgpack.js",
    defaults: { enableBuiltin: true },
  },
];

async function loadModule(specifier: string): Promise<{ default?: unknown } | null> {
  try {
    return await import(specifier) as { default?: unknown };
  } catch {
    return null;
  }
}

async function registerOptionalPlugin(
  server: FastifyInstance,
  spec: PluginSpec,
  config: PluginConfig | undefined,
): Promise<void> {
  if (config === false) {
    return;
  }

  const pluginOptions = config === true || config === undefined ? spec.defaults : config;
  const mod = await loadModule(spec.specifier);

  if (!mod) {
    if (config !== undefined && config !== true) {
      throw new Error(`Missing optional dependency "${spec.specifier}"`);
    }
    return;
  }

  const plugin = (mod.default ?? mod) as Parameters<FastifyInstance["register"]>[0];
  await server.register(plugin, pluginOptions);
}

export async function applyZodTypeProvider(server: FastifyInstance): Promise<void> {
  const mod = await loadModule("fastify-type-provider-zod");
  if (!mod) {
    return;
  }

  const provider = (mod as {
    serializerCompiler?: unknown;
    validatorCompiler?: unknown;
    default?: {
      serializerCompiler?: unknown;
      validatorCompiler?: unknown;
    };
  });
  const serializerCompiler = provider.serializerCompiler ?? provider.default?.serializerCompiler;
  const validatorCompiler = provider.validatorCompiler ?? provider.default?.validatorCompiler;

  if (typeof validatorCompiler === "function") {
    server.setValidatorCompiler(validatorCompiler as Parameters<FastifyInstance["setValidatorCompiler"]>[0]);
  }
  if (typeof serializerCompiler === "function") {
    server.setSerializerCompiler(serializerCompiler as Parameters<FastifyInstance["setSerializerCompiler"]>[0]);
  }
}

function withoutUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}

export function mergeBuiltinPlugins(
  ...layers: Array<BuiltinPluginsOptions | undefined>
): BuiltinPluginsOptions {
  return Object.assign(
    {},
    DEFAULT_BUILTIN_PLUGINS,
    ...layers.filter(Boolean).map((layer) => withoutUndefined(layer as BuiltinPluginsOptions)),
  );
}

export async function registerBuiltinPlugins(
  server: FastifyInstance,
  options: BuiltinPluginsOptions = {},
): Promise<void> {
  if (options.zod !== false) {
    await applyZodTypeProvider(server);
  }

  for (const spec of OPTIONAL_PLUGINS) {
    await registerOptionalPlugin(server, spec, options[spec.key] as PluginConfig | undefined);
  }
}
