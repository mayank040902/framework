import { startServer } from "../../dist/index.js";

const { address, close } = await startServer(8080, {
  serviceName: "api",
  logger: true,
});

console.log(`listening at ${address}`);

process.once("SIGINT", () => {
  void close();
});
