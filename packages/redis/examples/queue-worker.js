import { createClient, createQueue, createWorker, silentLogger } from "../dist/index.js";

const url = process.env.REDIS_URL ?? "redis://localhost:6379";
const queueName = "demo-jobs";

const client = createClient({ 
    url,
    maxRetriesPerRequest: null,
}, process.env.REDIS_SILENT === "true" ? silentLogger : undefined);

const queue = createQueue({ name: queueName, connection: client });

console.log("Created queue:", queueName);

await queue.add("welcome", { userId: "user-1", message: "Welcome!" });
await queue.add("notification", { type: "email", to: "user@example.com" });
await queue.add("report", { format: "pdf", date: new Date().toISOString() });

console.log("Added 3 jobs to queue");

const worker = createWorker({
    name: queueName,
    connection: client,
    concurrency: 2,
    processor: async (job) => {
        console.log(`Processing job ${job.id}:`, job.name, job.data);
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { processed: true, jobId: job.id };
    },
});

worker.on("completed", (job) => {
    console.log(`Job ${job.id} completed with result:`, job.returnvalue);
});

worker.on("failed", (job, err) => {
    console.error(`Job ${job.id} failed:`, err.message);
});

process.on("SIGINT", async () => {
    console.log("Shutting down...");
    await worker.close();
    await queue.close();
    await shutdown(client);
    process.exit(0);
});

console.log("Worker started. Press Ctrl+C to stop.");