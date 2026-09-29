export function memoryLogger() {
    const entries = [];
    return {
        entries,
        error(message, extra) {
            entries.push({ level: "error", message, extra });
        },
        warn(message, extra) {
            entries.push({ level: "warn", message, extra });
        },
        info(message, extra) {
            entries.push({ level: "info", message, extra });
        },
        debug(message, extra) {
            entries.push({ level: "debug", message, extra });
        },
    };
}

export function createMockKafka(overrides = {}) {
    const producer = {
        connectCalls: 0,
        disconnectCalls: 0,
        sent: [],
        failConnect: false,
        async connect() {
            this.connectCalls += 1;
            if (this.failConnect) {
                throw new Error("producer connect failed");
            }
        },
        async disconnect() {
            this.disconnectCalls += 1;
        },
        async send(payload) {
            this.sent.push(payload);
            return [{ topicName: payload.topic, partition: 0, errorCode: 0 }];
        },
        ...overrides.producer,
    };

    const consumer = {
        connectCalls: 0,
        disconnectCalls: 0,
        subscriptions: [],
        handler: null,
        failConnect: false,
        async connect() {
            this.connectCalls += 1;
            if (this.failConnect) {
                throw new Error("consumer connect failed");
            }
        },
        async disconnect() {
            this.disconnectCalls += 1;
        },
        async subscribe(options) {
            this.subscriptions.push(options);
        },
        async run(config) {
            this.handler = config.eachMessage;
        },
        async emit(payload) {
            return this.handler(payload);
        },
        ...overrides.consumer,
    };

    const admin = {
        connectCalls: 0,
        disconnectCalls: 0,
        failConnect: false,
        async connect() {
            this.connectCalls += 1;
            if (this.failConnect) {
                throw new Error("admin connect failed");
            }
        },
        async disconnect() {
            this.disconnectCalls += 1;
        },
        async listTopics() {
            return ["demo-events"];
        },
        ...overrides.admin,
    };

    const calls = { producer: 0, consumer: 0, admin: 0 };

    return {
        calls,
        get producerCalls() {
            return calls.producer;
        },
        get consumerCalls() {
            return calls.consumer;
        },
        get adminCalls() {
            return calls.admin;
        },
        producer: (config) => {
            calls.producer += 1;
            producer.lastConfig = config;
            return producer;
        },
        consumer: (config) => {
            calls.consumer += 1;
            consumer.lastConfig = config;
            return consumer;
        },
        admin: (config) => {
            calls.admin += 1;
            admin.lastConfig = config;
            return admin;
        },
        _producer: producer,
        _consumer: consumer,
        _admin: admin,
    };
}

export function withEnv(vars, fn) {
    const previous = {};
    for (const [key, value] of Object.entries(vars)) {
        previous[key] = process.env[key];
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }

    const restore = () => {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    };

    if (!fn) {
        return restore;
    }

    try {
        return fn();
    } finally {
        restore();
    }
}
