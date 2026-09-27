import type { Pool, PoolClient, QueryRunner, Logger, DatabaseConfig, Database, CreateDatabaseOptions } from "./types.js";
import { createPool } from "./client/pool.js";
import { createClient } from "./client/client.js";
import { createTransaction } from "./client/transaction.js";
import { createStream } from "./client/stream.js";
import { createCursor } from "./client/cursor.js";
import { createCheck } from "./client/check.js";
import { createShutdown } from "./client/shutdown.js";
import { createBatch } from "./client/batch.js";
import { createHooks } from "./client/hooks.js";
import { createRetry } from "./client/retry.js";

import { createSchemaManager } from "./schema/schema.js";
import { createMigrator } from "./schema/migrate.js";

import { createModelFactory } from "./model/model.js";
import { createQueryBuilder } from "./query/builder.js";

export function createDatabase({
    logger,
    instrumentation,
    hooks,
    retry,
    queryTimeout,
    timeout,
    connectTimeout,
    ...config
}: CreateDatabaseOptions = {}): Database {
    const hookSystem = hooks ?? createHooks({ logger, ...(instrumentation ?? {}) });
    const retryDefaults = typeof retry === "boolean" ? {} : (typeof retry === "number" ? { retries: retry } : retry);

    const pool = createPool({ 
        logger, 
        config, 
        onError: hookSystem.config?.onError 
            ? (error: unknown) => hookSystem.config?.onError?.({ error, sql: undefined, durationMs: 0 })
            : undefined 
    });

    const client = createClient(pool, logger, {
        hooks: hookSystem,
        retry,
        instrumentation: instrumentation as Record<string, unknown> | undefined,
        queryTimeout,
        timeout,
        connectTimeout,
    });

    const transactions = createTransaction({
        pool,
        logger,
        hooks: hookSystem,
        retry,
    });

    const shutdownSystem = createShutdown(pool, { logger });

    const from = createQueryBuilder({ query: client.query, logger });

    return {
        pool,

        // queries
        getClient: client.getClient,
        query: client.query,
        queryOne: client.queryOne,
        releaseClient: client.releaseClient,
        prepare: client.prepare,
        prepared: client.prepared,

        // transactions
        transaction: transactions.transaction,
        savepoint: transactions.savepoint,

        // streaming
        ...createStream(pool, logger),
        ...createCursor(pool),

        // health & lifecycle
        ...createCheck(pool),
        shutdown: shutdownSystem.shutdown,

        // bulk operations
        batch: createBatch({
            query: client.query,
            transaction: transactions.transaction,
        }),

        // query builder & models
        from,
        table: from,
        model: createModelFactory({
            query: client.query,
            logger,
        }),

        // schema & migrations
        schema: createSchemaManager(pool),
        migrate: createMigrator(pool, { logger }),

        // instrumentation
        hooks: hookSystem,
        metrics: hookSystem.metrics,
        retry: createRetry(retryDefaults ?? {}),
    };
}