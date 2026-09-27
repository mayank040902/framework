import { startServer } from "../../dist/index.js";

const { address } = await startServer(8080, {
  serviceName: "hooks-demo",
  logger: false,
  hooks: {
    onRequest: async (request) => {
      request.log.info({ url: request.url }, "incoming");
    },
    preHandler: [
      async (request) => {
        request.headers["x-request-started"] = String(Date.now());
      },
    ],
    onResponse: async (request, reply) => {
      reply.header("x-service", "hooks-demo");
      request.log.info({ statusCode: reply.statusCode }, "responded");
    },
    onError: async (_request, _reply, error) => {
      console.error(error);
    },
  },
  configure: (server) => {
    server.get("/ping", async () => ({ pong: true }));
  },
});

console.log(`hooks example listening at ${address}`);
