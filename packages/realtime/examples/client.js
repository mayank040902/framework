const WS_URL = process.env.WS_URL || "ws://localhost:3000/ws/chat";

const ws = new WebSocket(WS_URL);

ws.onopen = () => {
  console.log("Connected to WebSocket server");
  
  ws.send(JSON.stringify({ type: "join", channel: "general" }));
  
  setInterval(() => {
    ws.send(JSON.stringify({ 
      type: "message", 
      channel: "general", 
      text: `Hello at ${new Date().toISOString()}` 
    }));
  }, 3000);
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log("Received:", message);
};

ws.onclose = () => {
  console.log("Disconnected");
};

ws.onerror = (err) => {
  console.error("Error:", err);
};

process.on("SIGINT", () => {
  ws.close();
  process.exit(0);
});