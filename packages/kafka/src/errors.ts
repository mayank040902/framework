export class KafkaConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "KafkaConfigError";
    }
}

export class KafkaConnectionError extends Error {
    constructor(message: string, cause?: unknown) {
        super(message, cause ? { cause } : undefined);
        this.name = "KafkaConnectionError";
        if (cause && this.cause === undefined) {
            this.cause = cause;
        }
    }
}

export class KafkaDecodeError extends Error {
    constructor(message: string, cause?: unknown) {
        super(message, cause ? { cause } : undefined);
        this.name = "KafkaDecodeError";
        if (cause && this.cause === undefined) {
            this.cause = cause;
        }
    }
}