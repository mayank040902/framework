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
