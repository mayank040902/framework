/**
 * Smoke test: exercises the published API end to end against a real broker.
 *
 *   npm run build && npm run smoke
 *
 * Environment:
 *   KAFKA_BROKERS   brokers to test against (default localhost:9092)
 *   KAFKA_TOPIC     topic to use (default smoke-test; created if missing)
 *   KAFKA_TIMEOUT   per-check timeout in ms (default 30000)
 *
 * Exits non-zero if any check fails. Unlike `npm test`, this talks to an actual
 * broker, so it catches the things a mock cannot: wiring, serialization on the
 * wire, and the KafkaJS options we forward.
 */

import {
    createKafka,
    createProducer,
    createConsumer,
    createAdmin,
    subscribeToTopic,
    consumeMessages,
    createKafkaClient,
    createCodecAdapter,
    createConfigAdapter,
    getSslConfig,
    getSaslConfig,
    registerShutdown,
    parseKafkaMessage,
    jsonCodec,
    silentLogger,
    KafkaConfigError,
} from "../src/index.js";

const brokers = process.env.KAFKA_BROKERS ?? "localhost:9092";
const topic = process.env.KAFKA_TOPIC ?? "smoke-test";
const TIMEOUT = Number(process.env.KAFKA_TIMEOUT ?? 30000);

let passed = 0;
const failures = [];

function ok(name) {
    passed += 1;
    console.log(`  ok   ${name}`);
}

function bad(name, error) {
    failures.push({ name, error });
    console.log(`  FAIL ${name}: ${error?.message ?? error}`);
}

async function check(name, fn) {
    try {
        await withTimeout(fn(), TIMEOUT, name);
        ok(name);
    } catch (error) {
        bad(name, error);
    }
}

function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms (${label})`)), ms);
            timer.unref?.();
        }),
    ]);
}

function section(title) {
    console.log(`\n${title}`);
}

const cleanup = [];
function track(client) {
    cleanup.push(client);
    return client;
}

// ---------------------------------------------------------------------------
section("Configuration (no broker required)")
// ---------------------------------------------------------------------------

await check("createKafka throws KafkaConfigError without brokers", async () => {
    try {
        createKafka({ brokers: "   " });
    } catch (error) {
        if (!(error instanceof KafkaConfigError)) throw error;
        return;
    }
    throw new Error("expected KafkaConfigError");
});

await check("createKafka accepts a comma-separated broker list", async () => {
    const kafka = createKafka({ brokers: "a:9092, b:9092", logger: silentLogger });
    if (typeof kafka.producer !== "function") throw new Error("no producer factory");
});

await check("createConfigAdapter supplies brokers", async () => {
    const config = createConfigAdapter({ KAFKA_BROKERS: "a:9092" });
    const kafka = createKafka({ config, logger: silentLogger });
    if (typeof kafka.producer !== "function") throw new Error("no producer factory");
});

await check("getSslConfig stays off without TLS material", async () => {
    if (getSslConfig({ config: createConfigAdapter({}) }) !== undefined) {
        throw new Error("expected undefined");
    }
});

await check("getSaslConfig needs credentials", async () => {
    if (getSaslConfig({ sasl: { mechanism: "plain" } }) !== undefined) {
        throw new Error("expected undefined");
    }
    const ok = getSaslConfig({ sasl: { mechanism: "PLAIN", username: "u", password: "p" } });
    if (ok?.mechanism !== "plain") throw new Error(`unexpected ${JSON.stringify(ok)}`);
});

// ---------------------------------------------------------------------------
section("Broker connectivity")
// ---------------------------------------------------------------------------

const kafka = createKafka({ brokers, clientId: "smoke-test", logger: silentLogger });

let admin;
await check("admin connects and lists topics", async () => {
    admin = track(await createAdmin(kafka, silentLogger));
    const topics = await admin.listTopics();
    if (!Array.isArray(topics)) throw new Error("listTopics did not return an array");
    if (!topics.includes(topic)) {
        await admin.createTopics({ topics: [{ topic, numPartitions: 1, replicationFactor: 1 }] });
        console.log(`       (created topic "${topic}")`);
    }
});

await check("admin reports topic metadata", async () => {
    const metadata = await admin.fetchTopicMetadata({ topics: [topic] });
    const partitions = metadata.topics?.[0]?.partitions?.length ?? 0;
    if (partitions < 1) throw new Error("no partitions reported");
});

if (failures.length > 0) {
    console.log("\nBroker unreachable; skipping functional checks.");
    await disconnectAll();
    process.exit(1);
}

// ---------------------------------------------------------------------------
section("Low-level producer")
// ---------------------------------------------------------------------------

await check("producer connects, sends, and disconnects", async () => {
    const producer = track(await createProducer(kafka, silentLogger));
    const metadata = await producer.send({
        topic,
        messages: [{ key: "smoke-low", value: JSON.stringify({ low: true }) }],
    });
    if (!Array.isArray(metadata) || metadata.length !== 1) {
        throw new Error(`unexpected metadata ${JSON.stringify(metadata)}`);
    }
});

// ---------------------------------------------------------------------------
section("High-level client")
// ---------------------------------------------------------------------------

const client = track(createKafkaClient({
    brokers,
    clientId: "smoke-client",
    groupId: `smoke-${Date.now()}`,
    logger: silentLogger,
}));

await check("client.send encodes a JSON payload", async () => {
    const metadata = await client.send(topic, { kind: "smoke", n: 1 });
    if (metadata.length !== 1) throw new Error("expected one record");
});

await check("client.send accepts a batch", async () => {
    const metadata = await client.send(topic, [
        { key: "a", value: { n: 1 } },
        { key: "b", value: { n: 2 } },
    ]);
    if (metadata.length !== 1) throw new Error("expected one record batch");
});

const prefixCodec = createCodecAdapter({
    name: "prefix",
    encode: (value) => Buffer.from(`p:${JSON.stringify(value)}`),
    decode: (bytes) => JSON.parse(Buffer.from(bytes).toString().slice(2)),
});

await check("client.send honours a per-call codec", async () => {
    await client.send(topic, { packed: true }, { codec: prefixCodec });
    const encoded = prefixCodec.encode({ packed: true });
    if (encoded.toString() !== 'p:{"packed":true}') throw new Error("codec round-trip failed");
});

await check("client.getProducer reuses one connection", async () => {
    const [a, b] = await Promise.all([client.getProducer(), client.getProducer()]);
    if (a !== b) throw new Error("concurrent getProducer returned different clients");
});

await check("client round-trips a message through consume", async () => {
    const payload = { roundTrip: true, at: Date.now() };
    await client.send(topic, { key: "rt", value: payload });

    // A fresh consumer group with fromBeginning replays the whole topic, so wait for
    // the message we just sent rather than assuming it is the first one delivered.
    const value = await collectUntil((v) => v?.roundTrip === true, ({ value }) => value);
    if (value?.roundTrip !== true) {
        throw new Error(`round trip failed: ${JSON.stringify(value)}`);
    }
});

await check("consume exposes offset alongside the decoded value", async () => {
    await client.send(topic, { key: "off", value: { hasOffset: true } });
    const seen = await collectUntil((p) => p?.value?.hasOffset === true, (payload) => payload);
    if (typeof seen?.message?.offset !== "string") {
        throw new Error(`offset missing: ${JSON.stringify(seen?.message)}`);
    }
    if (seen.value?.hasOffset !== true) {
        throw new Error("decoded value missing");
    }
});

await check("a second subscribe to the same topic is a no-op", async () => {
    await client.subscribe(topic);
    await client.subscribe(topic);
    await client.consume(topic, async () => {}, { fromBeginning: false });
});

await check("client.disconnect closes everything and is reusable", async () => {
    await client.disconnect();
    if (client.producer !== null || client.consumer !== null || client.admin !== null) {
        throw new Error("client still holds clients after disconnect");
    }
    await client.getProducer();
    if (!client.producer) throw new Error("client is not reusable after disconnect");
    await client.disconnect();
});

// ---------------------------------------------------------------------------
section("Low-level consumer")
// ---------------------------------------------------------------------------

await check("low-level subscribe + eachMessage receives the message", async () => {
    const consumer = track(await createConsumer(kafka, silentLogger, `smoke-low-${Date.now()}`));
    await subscribeToTopic(consumer, silentLogger, topic, { fromBeginning: true });

    const seen = [];
    const done = new Promise((resolve) => {
        consumeMessages(consumer, silentLogger, async ({ message }) => {
            const value = parseKafkaMessage(message, jsonCodec).value;
            if (value?.lowLevel === true) {
                seen.push(value);
                resolve();
            }
        });
    });

    await new Promise((r) => setTimeout(r, 500));
    await producerSend(kafka, topic, "low-level", { lowLevel: true });
    await withTimeout(done, TIMEOUT, "low-level consume");
    if (seen[0]?.lowLevel !== true) throw new Error(`unexpected ${JSON.stringify(seen[0])}`);
});

await check("graceful shutdown disconnects without exiting", async () => {
    const p = await createProducer(kafka, silentLogger);
    const handle = registerShutdown(silentLogger, { producer: p, exit: false });
    await handle("SIGTERM");
    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("SIGINT");
});

// ---------------------------------------------------------------------------
await disconnectAll();

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
    for (const { name, error } of failures) {
        console.error(`\n${name}\n  ${error?.stack ?? error}`);
    }
    process.exit(1);
}
process.exit(0);

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function producerSend(kafkaInstance, topicName, key, value) {
    const producer = await createProducer(kafkaInstance, silentLogger);
    try {
        await producer.send({
            topic: topicName,
            messages: [{ key, value: JSON.stringify(value) }],
        });
    } finally {
        await producer.disconnect();
    }
}

async function collectUntil(matches, project) {
    const smoke = createKafkaClient({
        brokers,
        groupId: `smoke-collect-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        logger: silentLogger,
    });
    const ready = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("expected message never arrived")), TIMEOUT);
        timer.unref?.();
        smoke.consume(topic, async (payload) => {
            const value = project(payload);
            if (matches(value)) {
                clearTimeout(timer);
                resolve(value);
            }
        }, { fromBeginning: true }).catch(reject);
    });
    try {
        return await ready;
    } finally {
        await smoke.disconnect();
    }
}

async function disconnectAll() {
    for (const client of cleanup) {
        try {
            await client.disconnect();
        } catch {
            // teardown is best effort
        }
    }
}
