# Architecture Overview

This document describes the internal architecture of `@oneunit/database`.

## High-Level Structure

```
src/
├── index.ts                 # Main entry point, re-exports all public APIs
├── database.ts              # createDatabase() - composes all components
├── types.ts                 # All TypeScript types and interfaces
├── msgpack.ts               # JSON serialization (renamed to json-serialization.ts)
│
├── client/                  # Connection management layer
│   ├── index.ts             # Re-exports client APIs
│   ├── pool.ts              # createPool() - pg.Pool wrapper with config
│   ├── client.ts            # createClient() - query execution with retry/timeout
│   ├── transaction.ts       # createTransaction() - BEGIN/COMMIT/ROLLBACK
│   ├── batch.ts             # createBatch() - bulk insert helpers
│   ├── stream.ts            # createStream() - pg-query-stream wrapper
│   ├── cursor.ts            # createCursor() - pg-cursor wrapper
│   ├── check.ts             # createCheck() - health checks
│   ├── shutdown.ts          # createShutdown() - graceful pool close
│   ├── retry.ts             # withRetry() - exponential backoff retry
│   ├── errors.ts            # DatabaseError, TimeoutError, classifiers
│   ├── hooks.ts             # createHooks() - instrumentation
│   └── config.ts            # loadDatabaseConfig() - env + overrides
│
├── query/                   # SQL building layer
│   ├── index.ts             # Re-exports
│   ├── sql.ts               # sql`` tagged template, join, raw, identifiers
│   └── builder.ts           # QueryBuilder class - fluent CRUD builder
│
├── model/                   # Model layer (thin wrapper over QueryBuilder)
│   ├── index.ts             # Re-exports
│   └── model.ts             # createModel(), createModelFactory()
│
├── schema/                  # DDL helpers
│   ├── index.ts             # Re-exports
│   ├── schema.ts            # createSchemaManager() - create/alter/drop/constrain
│   ├── create.ts            # CREATE TABLE, INDEX
│   ├── alter.ts             # ALTER TABLE (add/drop/rename columns)
│   ├── drop.ts              # DROP TABLE, INDEX
│   ├── constrain.ts         # CONSTRAINT (unique, FK, check)
│   └── migrate.ts           # createMigrator() - migration runner
│
└── column/                  # Column definition helpers
    ├── index.ts             # Re-exports
    ├── id.ts                # id(), bigIntId()
    ├── uuid.ts              # uuid()
    └── timestamp.ts         # timestamp()
```

## Core Design Principles

### 1. Composition over Inheritance
`createDatabase()` composes independent modules rather than using a monolithic class. Each module (`client`, `transaction`, `schema`, `model`, etc.) is a standalone function that can be used independently.

### 2. Explicit Configuration
Configuration flows from environment → defaults → explicit overrides. `loadDatabaseConfig()` is the single source of truth for config parsing.

### 3. Parameterized Queries Everywhere
No string interpolation of user values. All user input goes through parameterized placeholders (`$1, $2, ...`).

### 4. Idempotent Lifecycle
- `shutdown()` is idempotent - safe to call multiple times
- `migrate.run()` is idempotent - skips already-applied migrations
- Pool creation doesn't connect until first query

### 5. Retry Safety
Retries are opt-in. Only transient PostgreSQL errors (serialization failures, deadlocks, connection loss) are retried by default. Non-idempotent statements should not use retries.

## Data Flow

### Query Execution
```
db.query(sql, values, options)
  └─> createClient.query()
      ├─> buildQuery() - normalizes call signatures
      ├─> executeOnce()
      │   ├─> getClient() - acquire from pool
      │   ├─> runQuery() - execute with timeout
      │   └─> releaseClient() - return to pool
      └─> withRetry() - if retry option enabled
```

### Transaction Flow
```
db.transaction(callback, options)
  └─> createTransaction.transaction()
      ├─> pool.connect()
      ├─> client.query(BEGIN ...)
      ├─> callback(client) - user code
      ├─> client.query(COMMIT) on success
      └─> client.query(ROLLBACK) on error
```

### Batch Insert Flow
```
db.batch.insertMany(table, rows, options)
  └─> createBatch.insertMany()
      ├─> inferColumns() - collect all unique columns
      ├─> chunk rows by MAX_PARAMETERS / columns.length
      ├─> build multi-row INSERT with parameterized placeholders
      └─> execute each chunk (in transaction if requested)
```

## Key Interfaces

### `ClientApi` (from `client.ts`)
```typescript
interface ClientApi {
  getClient(options?: { timeout?: number }): Promise<PoolClient>;
  query: QueryRunner;
  queryOne: QueryRunner;
  releaseClient(client?: PoolClient, error?: Error): void;
  prepare(name: string, text: string): PreparedStatement;
  prepared(name: string, text: string, values?: unknown[], options?: QueryOptions): Promise<QueryResult>;
  hooks: QueryHooks;
}
```

### `Database` (from `database.ts`)
```typescript
interface Database {
  pool: Pool;
  getClient: ClientApi["getClient"];
  query: ClientApi["query"];
  queryOne: ClientApi["queryOne"];
  releaseClient: ClientApi["releaseClient"];
  prepare: ClientApi["prepare"];
  prepared: ClientApi["prepared"];
  transaction: TransactionFn;
  savepoint: SavepointFn;
  stream: StreamFn;
  cursor: CursorFn;
  check: CheckFn;
  health: HealthFn;
  shutdown: ShutdownFn;
  batch: BatchApi;
  from: QueryBuilderFactory;
  table: QueryBuilderFactory;
  model: ModelFactory;
  schema: SchemaManager;
  migrate: Migrator;
  hooks: QueryHooks;
  metrics: MetricsCollector;
  retry: RetryApi;
}
```

## Error Handling

### Error Hierarchy
```
Error
  └─> DatabaseError (base class for all DB errors)
      └─> TimeoutError (query/connection timeouts)
```

### Error Classification
All errors are normalized to `DatabaseError` with these properties:
- `code` - PostgreSQL error code (e.g., "23505" for unique violation)
- `constraint` - constraint name
- `table` / `column` - affected table/column
- `transient` - boolean, true for retryable errors
- `cause` - original error

### Classifier Functions
- `isUniqueViolation()`
- `isForeignKeyViolation()`
- `isNotNullViolation()`
- `isCheckViolation()`
- `isExclusionViolation()`
- `isSerializationFailure()`
- `isDeadlock()`
- `isConnectionError()`
- `isConstraintViolation()`
- `isTransientError()`

## Instrumentation

`createHooks()` returns a `QueryHooks` object:
```typescript
interface QueryHooks {
  metrics: MetricsCollector;
  beforeQuery(context: QueryContext): void;
  afterQuery(context: QueryContext): void;
  onQueryError(context: QueryContext, error: DatabaseError): void;
  recordRetry(info: RetryInfo): void;
  config: InstrumentationOptions;
}
```

### Metrics Collected
- `queries` - total query count
- `errors` - error count
- `slowQueries` - queries exceeding `slowQueryMs`
- `retries` - retry attempts
- `transactions` - transaction count
- `rolledBackTransactions` - rolled back count
- `totalDurationMs` - cumulative query time
- `maxDurationMs` - slowest query
- `lastDurationMs` - most recent query time

## Testing Strategy

- Unit tests use mocked `pg.Pool` and `PoolClient`
- No live PostgreSQL required
- Tests cover: query building, transactions, retries, batch inserts, models, migrations, schema helpers
- Run with `npm test` (Node.js built-in test runner)

## Publishing Checklist

- [ ] `npm run build` - compiles TypeScript
- [ ] `npm run typecheck` - strict type checking
- [ ] `npm test` - all tests pass
- [ ] `npm run pack:check` - verify package contents
- [ ] Version bump in `package.json` and `CHANGELOG.md`
- [ ] `npm publish` (requires npm auth and 2FA)