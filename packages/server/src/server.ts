import path from "node:path";
import { pathToFileURL } from "node:url";
import { startBootstrapServer, type StartedBootstrapServer } from "./bootstrap.js";
import { serviceConfig } from "./config/env-services.js";

export async function start(): Promise<StartedBootstrapServer> {
  const config = serviceConfig(8080, "127.0.0.1", "server");

  return startBootstrapServer({
    serviceName: config.serviceName,
    host: config.host,
    port: config.port,
    logger: config.isDevelopment,
    gracefulShutdown: true,
  });
}

const entry = process.argv[1];
if (entry !== undefined && pathToFileURL(path.resolve(entry)).href === import.meta.url) {
  const { address } = await start();
  console.log(`Server listening at ${address}`);
}
