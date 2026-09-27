# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-17

### Added

- Centralized environment configuration via `loadDatabaseConfig()`
- Opt-in retries for genuinely transient PostgreSQL errors
- Query timeouts, prepared statements, and `queryOne()`
- Transaction isolation, read-only mode, statement timeout, and savepoint validation
- Streaming and cursor release guarantees, plus async iteration on cursors
- Batch inserts with automatic chunking and `ON CONFLICT` support
- Lightweight SQL tagged template and query builder
- Model helpers for common CRUD
- File and in-memory migration runner
- Normalized `DatabaseError` and `TimeoutError`
- Optional logging and metrics hooks (parameters are never logged by default)
- Health check payload suitable for readiness endpoints
- Idempotent graceful pool shutdown

### Changed

- `@bootstrap-framework/database` is now a standalone npm package with no `workspace:*` runtime dependencies
- Row serialization helpers no longer depend on an external msgpack package

### Removed

- Runtime dependency on a workspace msgpack package
