import { startServer, type BootstrapPlugin } from "../../dist/index.js";

const authPlugin: BootstrapPlugin = (server, options) => {
  server.addHook("preHandler", async (request, reply) => {
    const token = request.headers.authorization;
    if (options.required && !token) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });
};

const { address } = await startServer({
  port: 8080,
  host: "127.0.0.1",
  serviceName: "custom-demo",
  logger: false,
  cors: false,
  helmet: false,
  cookie: true,
  compress: false,
  rateLimit: false,
  plugins: [
    {
      plugin: authPlugin,
      options: { required: false },
    },
  ],
  hooks: {
    onSend: async (_request, reply, payload) => {
      reply.header("x-powered-by", "bootstrap-server");
      return payload;
    },
  },
  configure: (server) => {
    server.get("/me", async () => ({ id: "anon" }));
  },
});

console.log(`custom example listening at ${address}`);
