import { describe, it, expect, vi } from "vitest";
import { createKafkaBridge } from "../src/kafka-bridge.js";

function makeConsumer() {
  const subscriptions: string[] = [];
  let running = false;
  const messages: Array<{ topic: string; message: { value: Buffer } }> = [];
  let eachMessageHandler: ((msg: { topic: string; message: { value: Buffer } }) => Promise<void>) | null = null;

  const consumer = {
    async connect() {
      (consumer as any)._connected = true;
    },
    async subscribe({ topic }: { topic: string }) {
      subscriptions.push(topic);
    },
    run({ eachMessage }: { eachMessage: (msg: { topic: string; message: { value: Buffer } }) => Promise<void> }) {
      running = true;
      eachMessageHandler = eachMessage;
    },
    async stop() {
      running = false;
    },
    async disconnect() {
      (consumer as any)._connected = false;
    },
    pushMessage(topic: string, value: unknown) {
      messages.push({ topic, message: { value: Buffer.from(JSON.stringify(value)) } });
    },
    async flush() {
      for (const msg of messages) {
        if (eachMessageHandler) {
          await eachMessageHandler(msg);
        }
      }
      messages.length = 0;
    },
    getRunning() {
      return running;
    },
    _connected: false,
  };

  return { consumer, subscriptions, getRunning: consumer.getRunning };
}

describe("createKafkaBridge", () => {
  it("creates a consumer with the given groupId", () => {
    const { consumer } = makeConsumer();
    const kafka = {
      async getConsumer(groupId: string) {
        expect(groupId).toBe("test-group");
        return consumer;
      },
    };

    const hub = { broadcast: () => {} };
    const logger = { info: () => {}, warn: () => {}, error: () => {} };

    const bridge = createKafkaBridge(kafka as any, hub, logger as any, {
      groupId: "test-group",
      topics: ["topic-a"],
      handlers: {},
    });

    expect(bridge).toBeDefined();
  });

  it("start connects and subscribes", async () => {
    const { consumer, subscriptions } = makeConsumer();
    const kafka = {
      async getConsumer() {
        await consumer.connect();
        return consumer;
      },
    };

    const hub = { broadcast: () => {} };
    const infoCalls: unknown[][] = [];
    const logger = {
      info(...args: unknown[]) {
        infoCalls.push(args);
      },
      warn: () => {},
      error: () => {},
    };

    const bridge = createKafkaBridge(kafka as any, hub, logger as any, {
      groupId: "g1",
      topics: ["events", "visits"],
      handlers: {},
    });

    await bridge.start();

    expect((consumer as any)._connected).toBe(true);
    expect(subscriptions).toEqual(["events", "visits"]);
    expect(infoCalls.length).toBeGreaterThan(0);
  });

  it("invokes topic handler on message", async () => {
    const { consumer } = makeConsumer();
    const kafka = {
      async getConsumer() {
        await consumer.connect();
        return consumer;
      },
    };

    const hub = { broadcast: () => {} };
    const logger = { info: () => {}, warn: () => {}, error: () => {} };
    let receivedMessage: { topic: string; message: { value: Buffer } } | null = null;

    const bridge = createKafkaBridge(kafka as any, hub, logger as any, {
      groupId: "g1",
      topics: ["events"],
      handlers: {
        events: async (message) => {
          receivedMessage = message;
        },
      },
    });

    await bridge.start();
    consumer.pushMessage("events", { type: "like", record_id: "abc" });
    await consumer.flush();

    expect(receivedMessage).not.toBeNull();
    expect(JSON.parse(receivedMessage!.message.value.toString())).toEqual({ type: "like", record_id: "abc" });
  });

  it("skips missing handlers", async () => {
    const { consumer } = makeConsumer();
    const kafka = {
      async getConsumer() {
        await consumer.connect();
        return consumer;
      },
    };

    const hub = { broadcast: () => {} };
    const logger = { info: () => {}, warn: () => {}, error: () => {} };
    let handlerCalled = false;

    const bridge = createKafkaBridge(kafka as any, hub, logger as any, {
      groupId: "g1",
      topics: ["events", "visits"],
      handlers: {
        events: async () => {
          handlerCalled = true;
        },
      },
    });

    await bridge.start();
    consumer.pushMessage("visits", { record_id: "xyz" });
    await consumer.flush();

    expect(handlerCalled).toBe(false);
  });

  it("logs warning on handler failure", async () => {
    const { consumer } = makeConsumer();
    const kafka = {
      async getConsumer() {
        await consumer.connect();
        return consumer;
      },
    };

    const hub = { broadcast: () => {} };
    const warnings: unknown[][] = [];
    const logger = {
      info: () => {},
      warn(...args: unknown[]) {
        warnings.push(args);
      },
      error: () => {},
    };

    const bridge = createKafkaBridge(kafka as any, hub, logger as any, {
      groupId: "g1",
      topics: ["events"],
      handlers: {
        events: async () => {
          throw new Error("handler boom");
        },
      },
    });

    await bridge.start();
    consumer.pushMessage("events", { type: "like" });
    await consumer.flush();

    expect(warnings.length).toBe(1);
    expect(warnings[0][0]).toMatchObject({ error: { message: "handler boom" } });
  });

  it("stop disconnects the consumer", async () => {
    const { consumer } = makeConsumer();
    const kafka = {
      async getConsumer() {
        await consumer.connect();
        return consumer;
      },
    };

    const hub = { broadcast: () => {} };
    const logger = { info: () => {}, warn: () => {}, error: () => {} };

    const bridge = createKafkaBridge(kafka as any, hub, logger as any, {
      groupId: "g1",
      topics: [],
      handlers: {},
    });

    await bridge.start();
    await bridge.stop();

    expect((consumer as any)._connected).toBe(false);
  });
});