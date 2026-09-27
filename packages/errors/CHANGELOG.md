# Changelog

All notable changes to this project are documented in this file.

## 1.0.0 - 2026-09-26

### Added

- Typed `AppError` hierarchy for HTTP, database, Kafka, Redis, and WebSocket failures
- `tryCatch`, Result helpers, timeout, and retry utilities
- Optional Fastify error handler
- TypeScript declarations, tests, and npm package metadata

### Changed

- Published independently as `@bootstrap-framework/errors`

### Removed

- Sentry integration that was not implemented in source
