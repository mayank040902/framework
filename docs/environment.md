# Environment variables

Copy `examples/combined/.env.example` for a full local file.

## Server

| Variable | Default | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `development` | `development`, `test`, or `production` |
| `PORT` | `8080` | Listen port |
| `HOST` | `127.0.0.1` | Listen host |
| `SERVICE_NAME` | `app` | Health and log service name |
| `COOKIE_SECRET` | — | Cookie signing secret |

Env files resolve as `.env.${NODE_ENV}` unless `env: false`.

## Auth

| Variable | Description |
| :--- | :--- |
| `AUTH_SECRET` | Required JWT signing secret |
| `AUTH_REFRESH_SECRET` | Optional refresh secret |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth |

Provider `redirectUri` values are application config, not read automatically.

## Database

| Variable | Alias | Default | Description |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | | — | PostgreSQL connection string |
| `DATABASE_HOST` | `PGHOST` | — | Hostname |
| `DATABASE_PORT` | `PGPORT` | — | Port |
| `DATABASE_NAME` | `PGDATABASE` | — | Database name |
| `DATABASE_USER` | `PGUSER` | — | User |
| `DATABASE_PASSWORD` | `PGPASSWORD` | — | Password |
| `DATABASE_POOL_MAX` | `DB_MAX_CONN`, `DB_POOL_SIZE` | `20` | Maximum pool size |
| `DATABASE_POOL_MIN` | `DB_MIN_CONN` | `0` | Minimum pool size |
| `DATABASE_CONNECTION_TIMEOUT` | `DB_CONN_TIMEOUT` | `5000` | Connect timeout (ms) |
| `DATABASE_IDLE_TIMEOUT` | `DB_IDLE_TIMEOUT` | `30000` | Idle client timeout (ms) |
| `DATABASE_QUERY_TIMEOUT` | `DB_QUERY_TIMEOUT` | — | Default query timeout (ms) |
| `DATABASE_STATEMENT_TIMEOUT` | `DB_STATEMENT_TIMEOUT` | — | PostgreSQL `statement_timeout` (ms) |
| `DATABASE_SSL` | `DB_SSL` | `false` | Enable TLS |
| `DATABASE_SSL_CA` | `DB_SSL_CA` | — | Path to CA certificate |
| `DATABASE_APP_NAME` | `DB_APP_NAME` | `Unknown App` | `application_name` |

## Redis

| Variable | Description |
| :--- | :--- |
| `REDIS_URL` | Redis connection URL (`redis://` or `rediss://`) |

## Kafka

| Variable | Description |
| :--- | :--- |
| `KAFKA_BROKERS` | Comma-separated brokers |
| `KAFKA_CLIENT_ID` | Client id |
| `KAFKA_GROUP_ID` | Consumer group |
| `KAFKA_SSL` | Enable TLS |
| `KAFKA_CA` / `KAFKA_CERT` / `KAFKA_KEY` | PEM path or contents |
| `KAFKA_SASL_MECHANISM` | e.g. `plain`, `scram-sha-256` |
| `KAFKA_SASL_USERNAME` | SASL username |
| `KAFKA_SASL_PASSWORD` | SASL password |
| `KAFKA_LOG_LEVEL` | KafkaJS log level |

See `packages/kafka/.env.example`.
