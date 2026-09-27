import { createServer } from "http";
import { registerRealtime, createRealtimeHub } from "../src/index.js";

async function main() {
  const server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("WebSocket server running\n");
  });

  const app = {
    register: async (plugin: unknown) => {},
    decorate: (key: string, value: unknown) => { (app as any)[key] = value; },
    addHook: (event: string, fn: () => void) => { if (event === "onClose") (app as any)._onClose = fn; },
    log: { info: console.log, warn: console.warn, error: console.error },
  } as any;

  const hub = await registerRealtime(app, {
    websocketLibrary: "ws",
    path: "/ws",
    routes: async () => {},
  });

  server.on("upgrade", (request, socket, head) => {
    if (request.url?.startsWith("/ws")) {
      const { WebSocketServer } = await import("ws");
      const wss = new WebSocketServer({ noServer: true });
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  const port = 3001;
  server.listen(port, "0.0.0.0", () => {
    console.log(`Native WS server running at ws://localhost:${port}/ws`);
  });

  const { _onClose } = app;
  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    await _onClose?.();
    server.close(() => process.exit(0));
  });
}

main().catch(console.error);