import type { FastifyInstance } from "fastify";

export interface RealtimeServerPluginOptions {
  websocketLibrary?: "fastify" | "ws";
  path?: string;
  routes?: (app: FastifyInstance) => Promise<void>;
}

async function realtimePlugin(
  server: FastifyInstance,
  options: RealtimeServerPluginOptions = {},
): Promise<void> {
  let registerRealtime: (app: FastifyInstance, options: Record<string, unknown>) => Promise<{ close: () => void }>;

  try {
    const realtimeModule = await import("@bootstrap-framework/realtime") as {
      registerRealtime: typeof registerRealtime;
    };
    registerRealtime = realtimeModule.registerRealtime;
  } catch (err) {
    server.log.warn({ err }, "realtime package not installed, realtime plugin disabled");
    return;
  }

  const { routes, ...realtimeOptions } = options;

  const hub = await registerRealtime(server, realtimeOptions);

  if (routes) {
    await routes(server);
  }

  server.addHook("onClose", async () => {
    hub.close();
  });
}

export default realtimePlugin;
export { realtimePlugin };
