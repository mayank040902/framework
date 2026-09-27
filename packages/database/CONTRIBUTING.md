# Contributing

## Development

```bash
npm install
npm test
```

This package is ESM-only (`"type": "module"`). Tests use Node's built-in test runner and do not require a live PostgreSQL server.

## Guidelines

- Keep the public API backward compatible. Add new exports alongside existing ones.
- Do not introduce `@bootstrap-framework/*` or `workspace:*` runtime dependencies.
- Do not log connection credentials or query parameters by default.
- Prefer parameterized SQL. Never interpolate untrusted values into query text.
- Retry only errors classified as transient.

## Release

1. Update `CHANGELOG.md`
2. Bump `version` in `package.json`
3. `npm test`
4. `npm pack --dry-run`
5. `npm publish --access public`
