import test from "node:test";
import assert from "node:assert/strict";
import {
    KafkaClient,
    createAdmin,
    createConsumer,
    createKafkaClient,
    createProducer,
    consumeMessages,
    subscribeToTopic,
    KafkaConfigError,
    KafkaConnectionError,
    parseKafkaMessage,
    silentLogger,
} from "../src/index.js";
import { createMockKafka, memoryLogger } from "./helpers.js";
import { Partitioners } from "kafkajs";

test("KafkaClient send encodes JSON payloads", async () => {
    const kafka = createMockKafka();
    const client = createKafkaClient({
        kafka,
        logger: silentLogger,
        brokers: "localhost:9092",
    });

    await client.send("demo-events", { storyId: "abc", action: "published" });
    assert.equal(kafka._producer.connectCalls, 1);
    assert.equal(kafka._producer.sent[0].topic, "demo-events");
    assert.deepEqual(
        JSON.parse(kafka._producer.sent[0].messages[0].value.toString()),
        { storyId: "abc", action: "published" },
    );
});

test("KafkaClient send and consume support a custom codec adapter", async () => {
    const kafka = createMockKafka();
    const codec = {
        name: "prefix",
        encode(value) {
            return Buffer.from(`p:${JSON.stringify(value)}`);
        },
        decode(bytes) {
            return JSON.parse(Buffer.from(bytes).toString().slice(2));
        },
    };
    const client = new KafkaClient(silentLogger, {
        kafka,
        brokers: "localhost:9092",
        groupId: "workers",
        codec,
    });

    await client.send("demo-events", { packed: true });
    const produced = kafka._producer.sent[0].messages[0];
    assert.deepEqual(parseKafkaMessage(produced, codec).value, { packed: true });

    const received = [];
    await client.consume("demo-events", async (payload) => {
        received.push(payload.value);
    });

    await kafka._consumer.emit({
        topic: "demo-events",
        partition: 0,
        message: produced,
    });
    assert.deepEqual(received, [{ packed: true }]);
});

test("KafkaClient consume decodes JSON messages", async () => {
    const kafka = createMockKafka();
    const client = createKafkaClient({
        kafka,
        logger: silentLogger,
        brokers: "localhost:9092",
        groupId: "workers",
    });

    const received = [];
    await client.consume("demo-events", async (payload) => {
        received.push(payload);
    });

    await kafka._consumer.emit({
        topic: "demo-events",
        partition: 0,
        message: {
            offset: "1",
            key: Buffer.from("story-1"),
            value: Buffer.from(JSON.stringify({ action: "published" })),
        },
    });

    assert.equal(kafka._consumer.subscriptions[0].topic, "demo-events");
    assert.equal(received[0].value.action, "published");
    assert.equal(received[0].key, "story-1");
    assert.equal(received[0].topic, "demo-events");
});

test("send applies a per-call codec instead of the client codec", async () => {
    const kafka = createMockKafka();
    const codec = {
        name: "prefix",
        encode(value) {
            return Buffer.from(`p:${JSON.stringify(value)}`);
        },
        decode(bytes) {
            return JSON.parse(Buffer.from(bytes).toString().slice(2));
        },
    };
    const client = createKafkaClient({
        kafka,
        logger: silentLogger,
        brokers: "localhost:9092",
    });

    await client.send("demo-events", { packed: true }, { codec });
    const produced = kafka._producer.sent[0].messages[0];
    assert.equal(produced.value.toString(), `p:${JSON.stringify({ packed: true })}`);
    assert.deepEqual(parseKafkaMessage(produced, codec).value, { packed: true });
});

test("send accepts a named codec per call", async () => {
    const kafka = createMockKafka();
    const client = createKafkaClient({
        kafka,
        logger: silentLogger,
        brokers: "localhost:9092",
    });

    await client.send("demo-events", { packed: true }, { codec: "bytes" });
    const produced = kafka._producer.sent[0].messages[0];
    assert.equal(produced.value.toString(), JSON.stringify({ packed: true }));
});

test("send per-call codec overrides the client codec", async () => {
    const kafka = createMockKafka();
    const client = createKafkaClient({
        kafka,
        logger: silentLogger,
        brokers: "localhost:9092",
        codec: {
            name: "json-string",
            encode: (value) => Buffer.from(`j:${JSON.stringify(value)}`),
            decode: (bytes) => JSON.parse(Buffer.from(bytes).toString().slice(2)),
        },
    });

    await client.send("demo-events", { a: 1 }, { codec: "json" });
    assert.equal(kafka._producer.sent[0].messages[0].value.toString(), JSON.stringify({ a: 1 }));
});

test("send keeps topic and messages authoritative over options.send", async () => {
    const kafka = createMockKafka();
    const client = createKafkaClient({
        kafka,
        logger: silentLogger,
        brokers: "localhost:9092",
    });

    await client.send("real-topic", { a: 1 }, { send: { topic: "other-topic", messages: [] } });
    assert.equal(kafka._producer.sent[0].topic, "real-topic");
    assert.equal(kafka._producer.sent[0].messages.length, 1);
});

test("consume decodes with a per-call codec", async () => {
    const kafka = createMockKafka();
    const codec = {
        name: "prefix",
        encode(value) {
            return Buffer.from(`p:${JSON.stringify(value)}`);
        },
        decode(bytes) {
            return JSON.parse(Buffer.from(bytes).toString().slice(2));
        },
    };
    const client = createKafkaClient({
        kafka,
        logger: silentLogger,
        brokers: "localhost:9092",
        groupId: "workers",
    });

    const received = [];
    await client.consume("demo-events", async (payload) => {
        received.push(payload.value);
    }, { codec });

    await kafka._consumer.emit({
        topic: "demo-events",
        partition: 0,
        message: { value: Buffer.from(`p:${JSON.stringify({ packed: true })}`) },
    });

    assert.deepEqual(received, [{ packed: true }]);
});

test("consume keeps client-only options out of the KafkaJS consumer config", async () => {
    const kafka = createMockKafka();
    const client = createKafkaClient({
        kafka,
        logger: silentLogger,
        brokers: "localhost:9092",
        groupId: "workers",
    });

    await client.consume("demo-events", async () => {}, { parseJson: true, fromBeginning: false });

    const config = kafka._consumer.lastConfig;
    assert.equal(config.groupId, "workers");
    assert.equal("parseJson" in config, false);
    assert.equal("fromBeginning" in config, false);
});

test("consume keeps message metadata alongside decoded key and value", async () => {
    const kafka = createMockKafka();
    const client = createKafkaClient({
        kafka,
        logger: silentLogger,
        brokers: "localhost:9092",
        groupId: "workers",
    });

    const received = [];
    // mirrors the handler shape used by examples/consumer.js
    await client.consume("demo-events", async ({ key, value, partition, message }) => {
        received.push({ key, value, partition, offset: message.offset, headers: message.headers });
    });

    await kafka._consumer.emit({
        topic: "demo-events",
        partition: 0,
        message: {
            offset: "42",
            timestamp: "1700000000000",
            headers: { "x-source": "api" },
            key: Buffer.from("story-1"),
            value: Buffer.from(JSON.stringify({ action: "published" })),
        },
    });

    assert.equal(received[0].offset, "42");
    assert.equal(received[0].headers["x-source"], "api");
    assert.equal(received[0].key, "story-1");
    assert.deepEqual(received[0].value, { action: "published" });
});

test("subscribing the same topic twice is a no-op", async () => {
    const kafka = createMockKafka();
    const client = createKafkaClient({
        kafka,
        logger: silentLogger,
        brokers: "localhost:9092",
        groupId: "workers",
    });

    await client.subscribe("orders");
    await client.subscribe("orders");
    await client.consume("orders", async () => {});
    await client.consume("payments", async () => {});

    assert.deepEqual(
        kafka._consumer.subscriptions.map((entry) => entry.topic),
        ["orders", "payments"],
    );

    await client.disconnect();
    await client.consume("orders", async () => {});
    assert.equal(kafka._consumer.subscriptions.length, 3);
    assert.equal(kafka._consumer.subscriptions[2].topic, "orders");
});

test("concurrent consume and subscribe do not double-subscribe", async () => {
    const kafka = createMockKafka();
    const client = createKafkaClient({
        kafka,
        logger: silentLogger,
        brokers: "localhost:9092",
        groupId: "workers",
    });

    await Promise.all([
        client.consume("orders", async () => {}),
        client.consume("orders", async () => {}),
        client.subscribe("orders"),
        client.subscribe("payments"),
    ]);

    assert.deepEqual(
        kafka._consumer.subscriptions.map((entry) => entry.topic),
        ["orders", "payments"],
    );
});

test("disconnect during an in-flight connect does not leak the client", async () => {
    const kafka = createMockKafka();
    let release;
    const gate = new Promise((resolve) => {
        release = resolve;
    });
    const originalConnect = kafka._producer.connect.bind(kafka._producer);
    kafka._producer.connect = async () => {
        await gate;
        return originalConnect();
    };

    const client = createKafkaClient({
        kafka,
        logger: silentLogger,
        brokers: "localhost:9092",
    });

    const pending = client.getProducer();
    await client.disconnect();
    release();
    await assert.rejects(() => pending, KafkaConnectionError);

    assert.equal(client.producer, null);
    assert.equal(kafka._producer.disconnectCalls, 1);

    // The client must still be usable afterwards.
    kafka._producer.connect = originalConnect;
    await client.getProducer();
    assert.ok(client.producer);
    await client.disconnect();
    assert.equal(kafka._producer.disconnectCalls, 2);
});

test("a failed subscribe can be retried", async () => {
    const kafka = createMockKafka();
    let fail = true;
    kafka._consumer.subscribe = async (options) => {
        if (fail) {
            throw new Error("subscribe failed");
        }
        kafka._consumer.subscriptions.push(options);
    };

    const client = createKafkaClient({
        kafka,
        logger: silentLogger,
        brokers: "localhost:9092",
        groupId: "workers",
    });

    await assert.rejects(() => client.subscribe("orders"), /subscribe failed/);

    fail = false;
    await client.subscribe("orders");
    assert.deepEqual(kafka._consumer.subscriptions.map((entry) => entry.topic), ["orders"]);
});

test("concurrent getProducer, getConsumer, and getAdmin create one client each", async () => {
    const kafka = createMockKafka();
    const client = createKafkaClient({
        kafka,
        logger: silentLogger,
        brokers: "localhost:9092",
        groupId: "workers",
    });

    await Promise.all([client.getProducer(), client.getProducer(), client.getProducer()]);
    await Promise.all([client.getConsumer(), client.getConsumer()]);
    await Promise.all([client.getAdmin(), client.getAdmin()]);

    assert.equal(kafka.producerCalls, 1);
    assert.equal(kafka.consumerCalls, 1);
    assert.equal(kafka.adminCalls, 1);

    await client.disconnect();
    assert.equal(kafka._producer.disconnectCalls, 1);
    assert.equal(kafka._consumer.disconnectCalls, 1);
    assert.equal(kafka._admin.disconnectCalls, 1);
});

test("concurrent sends share a single producer and none leak", async () => {
    const kafka = createMockKafka();
    const client = createKafkaClient({
        kafka,
        logger: silentLogger,
        brokers: "localhost:9092",
    });

    await Promise.all([
        client.send("demo-events", { a: 1 }),
        client.send("demo-events", { a: 2 }),
        client.send("demo-events", { a: 3 }),
    ]);

    assert.equal(kafka.producerCalls, 1);
    await client.disconnect();
    assert.equal(kafka._producer.disconnectCalls, 1);
});

test("a failed connect does not poison later retries", async () => {
    const kafka = createMockKafka();
    kafka._producer.failConnect = true;
    const client = createKafkaClient({
        kafka,
        logger: silentLogger,
        brokers: "localhost:9092",
    });

    const settled = await Promise.allSettled([client.send("demo-events", { a: 1 }), client.send("demo-events", { a: 2 })]);
    assert.equal(settled.every((result) => result.status === "rejected"), true);
    assert.equal(client.producer, null);
    assert.equal(kafka.producerCalls, 1);

    kafka._producer.failConnect = false;
    await client.send("demo-events", { a: 3 });
    assert.equal(kafka.producerCalls, 2);
    assert.equal(kafka._producer.connectCalls, 2);
});

test("low-level producer, consumer, and admin work without a logger", async () => {
    const kafka = createMockKafka();
    const producer = await createProducer(kafka);
    const consumer = await createConsumer(kafka, "workers");
    const admin = await createAdmin(kafka);

    await subscribeToTopic(consumer, "demo-events", { fromBeginning: false });
    const seen = [];
    await consumeMessages(consumer, async ({ topic }) => {
        seen.push(topic);
    });
    await kafka._consumer.emit({ topic: "demo-events", partition: 0, message: { value: Buffer.from("ok") } });

    assert.equal(producer, kafka._producer);
    assert.equal(consumer.lastConfig.groupId, "workers");
    assert.equal(kafka._consumer.subscriptions[0].fromBeginning, false);
    assert.deepEqual(seen, ["demo-events"]);
    assert.deepEqual(await admin.listTopics(), ["demo-events"]);
});

test("framework logger is accepted by low-level factories", async () => {
    const kafka = createMockKafka();
    const logger = memoryLogger();
    await createProducer(kafka, logger);
    await createConsumer(kafka, logger, "workers");
    await createAdmin(kafka, logger);
    assert.ok(logger.entries.some((entry) => entry.message.includes("producer connected")));
    assert.ok(logger.entries.some((entry) => entry.message.includes("consumer \"workers\" connected")));
    assert.ok(logger.entries.some((entry) => entry.message.includes("admin connected")));
});

test("createConsumer requires a group id", async () => {
    const kafka = createMockKafka();
    await assert.rejects(() => createConsumer(kafka, silentLogger, {}), KafkaConfigError);
});

test("subscribeToTopic requires a topic in every argument form", async () => {
    const kafka = createMockKafka();
    const consumer = await createConsumer(kafka, "workers");

    await assert.rejects(() => subscribeToTopic(consumer, silentLogger, { fromBeginning: false }), KafkaConfigError);
    await assert.rejects(() => subscribeToTopic(consumer, silentLogger, { topic: "   " }), KafkaConfigError);
    assert.deepEqual(kafka._consumer.subscriptions, []);

    await subscribeToTopic(consumer, silentLogger, { topic: "demo-events" });
    assert.equal(kafka._consumer.subscriptions[0].topic, "demo-events");
});

test("createPartitioner accepts a partitioner name instead of forwarding a string", async () => {
    const kafka = createMockKafka();
    const producer = await createProducer(kafka, silentLogger, { createPartitioner: "legacy" });
    assert.equal(kafka._producer.lastConfig.createPartitioner, Partitioners.LegacyPartitioner);
    assert.equal(typeof kafka._producer.lastConfig.createPartitioner, "function");
    assert.equal(producer, kafka._producer);
});

test("client-level partitioner options reach the producer", async () => {
    const kafka = createMockKafka();
    const client = createKafkaClient({
        kafka,
        logger: silentLogger,
        brokers: "localhost:9092",
        partitioner: "java-compatible",
    });
    await client.getProducer();
    assert.equal(kafka._producer.lastConfig.createPartitioner, Partitioners.JavaCompatiblePartitioner);
});

test("producer-specific partitioner options win over client-level ones", async () => {
    const kafka = createMockKafka();
    const client = createKafkaClient({
        kafka,
        logger: silentLogger,
        brokers: "localhost:9092",
        partitioner: "legacy",
        producer: { partitioner: "default" },
    });
    await client.getProducer();
    assert.equal(kafka._producer.lastConfig.createPartitioner, Partitioners.DefaultPartitioner);
});

test("connection failures wrap KafkaConnectionError", async () => {
    const kafka = createMockKafka();
    kafka._producer.failConnect = true;
    kafka._consumer.failConnect = true;
    kafka._admin.failConnect = true;

    await assert.rejects(() => createProducer(kafka, silentLogger), KafkaConnectionError);
    await assert.rejects(() => createConsumer(kafka, silentLogger, "workers"), KafkaConnectionError);
    await assert.rejects(() => createAdmin(kafka, silentLogger), KafkaConnectionError);
    assert.equal(kafka._producer.disconnectCalls, 1);
    assert.equal(kafka._consumer.disconnectCalls, 1);
    assert.equal(kafka._admin.disconnectCalls, 1);
});

test("KafkaClient disconnects all attached clients", async () => {
    const kafka = createMockKafka();
    const client = createKafkaClient({
        kafka,
        logger: silentLogger,
        brokers: "localhost:9092",
        groupId: "workers",
    });

    await client.getProducer();
    await client.getConsumer();
    await client.getAdmin();
    await client.disconnect();

    assert.equal(kafka._producer.disconnectCalls, 1);
    assert.equal(kafka._consumer.disconnectCalls, 1);
    assert.equal(kafka._admin.disconnectCalls, 1);
    assert.equal(client.producer, null);
});
