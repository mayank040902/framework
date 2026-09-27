import { createClient, shutdown, silentLogger } from "../dist/index.js";

const url = process.env.REDIS_URL ?? "redis://localhost:6379";

const publisher = createClient({ url }, process.env.REDIS_SILENT === "true" ? silentLogger : undefined);
const subscriber = createClient({ url }, process.env.REDIS_SILENT === "true" ? silentLogger : undefined);

const channel = "notifications";

subscriber.on("message", (ch, message) => {
    if (ch === channel) {
        console.log(`Received on ${channel}:`, message);
    }
});

subscriber.on("message", (ch, message) => {
    if (ch === "alerts") {
        console.log(`ALERT:`, message);
    }
});

await subscriber.subscribe(channel, "alerts");
console.log("Subscribed to channels:", channel, "alerts");

setTimeout(async () => {
    await publisher.publish(channel, JSON.stringify({ type: "info", message: "Hello subscribers!" }));
}, 100);

setTimeout(async () => {
    await publisher.publish("alerts", JSON.stringify({ level: "warning", message: "High memory usage" }));
}, 200);

setTimeout(async () => {
    await publisher.publish(channel, JSON.stringify({ type: "info", message: "Second message" }));
}, 300);

setTimeout(async () => {
    await subscriber.unsubscribe(channel, "alerts");
    console.log("Unsubscribed");
    await shutdown(publisher);
    await shutdown(subscriber);
}, 1000);