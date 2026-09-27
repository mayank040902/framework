import { startServer } from "../../dist/index.js";

const greetPlugin = async (server) => {
  server.get("/hello", async () => ({ hello: "world" }));
};

const { address } = await startServer(8080, {
  serviceName: "plugins-demo",
  logger: false,
  plugins: {
    cors: { origin: ["http://localhost:5173"], credentials: true },
    helmet: { contentSecurityPolicy: false },
    cookie: { secret: "change-me" },
    compress: true,
    rateLimit: { max: 100, timeWindow: "1 minute" },
    zod: true,
  },
  extraPlugins: [greetPlugin],
});

console.log(`plugins example listening at ${address}`);
