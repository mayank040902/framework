# Changelog

All notable changes to this project are documented in this file.

## 1.0.0 - 2026-09-19

### Added

- Standalone Kafka client with KafkaJS as the only runtime dependency
- Adapters for logger, config, and codecs so other packages stay outside this library
- High-level `KafkaClient` API for produce, consume, admin, and shutdown
- Built-in JSON codec plus injectable custom codecs
- SSL and SASL configuration from options or a config adapter
- TypeScript declarations, tests, examples, and npm package metadata

### Removed

- Workspace packages (`@bootstrap-framework/config`, workspace msgpack)
- Runtime dependency on `@msgpack/msgpack`
