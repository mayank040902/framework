# Contributing to @oneunit/database

Thank you for considering contributing! This document will help you get started.

## Quick Start

```bash
# Clone the repository
git clone https://github.com/mayank040902/oneunit.git
cd packages/database

# Install dependencies
npm install

# Run tests
npm test

# Run typecheck
npm run typecheck

# Watch mode for development
npm run dev
```

## Project Structure

```
packages/database/
├── src/                    # Source code (TypeScript)
│   ├── index.ts           # Main entry point
│   ├── database.ts        # createDatabase() - composes all components
│   ├── types.ts           # All TypeScript types and interfaces
│   ├── json-serialization.ts  # JSON serialization utilities
│   │
│   ├── client/            # Connection management
│   ├── query/             # SQL building (sql template, QueryBuilder)
│   ├── model/             # Model CRUD helpers
│   ├── schema/            # DDL helpers (create/alter/drop/constrain/migrate)
│   └── column/            # Column definition helpers (id, uuid, timestamp)
│
├── dist/                   # Compiled output (generated, do not edit)
├── test/                   # Tests (Node.js built-in test runner)
├── examples/               # Runnable examples
├── package.json
├── tsconfig.json
├── CHANGELOG.md
└── README.md
```

## Development Workflow

### 1. Make Your Changes

- Write code in `src/` (TypeScript)
- Follow existing patterns and code style
- Add tests for new functionality in `test/`

### 2. Run Checks

```bash
# Type checking (strict mode)
npm run typecheck

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Build to verify compilation
npm run build
```

### 3. Before Submitting

```bash
# Full validation
npm run typecheck && npm test && npm run build && npm run pack:check
```

## Coding Guidelines

### TypeScript

- **Strict mode enabled** - no `any`, no implicit any
- Use explicit return types for public functions
- Prefer `interface` over `type` for object shapes
- Export types alongside implementations

### API Design

- **Keep public API backward compatible** - add new exports alongside existing ones
- **No workspace/runtime dependencies** on `@oneunit/*` packages
- **Parameterized SQL only** - never interpolate untrusted values
- **Retries opt-in only** - only for genuinely transient errors
- **No credential logging** - parameters never logged by default

### Error Handling

- Wrap driver errors as `DatabaseError` (preserves original on `cause`)
- Use classifier functions (`isUniqueViolation`, `isTransientError`, etc.)
- `TimeoutError` is always transient

### Testing

- Tests use **Node's built-in test runner** (`node:test`)
- **No live PostgreSQL required** - tests mock `pg.Pool` and `PoolClient`
- Test file naming: `*.test.js` in `test/`
- Run single test: `node --test test/specific.test.js`

### Code Style

- No semicolons (TypeScript default)
- 2-space indentation
- Single quotes for strings
- Trailing commas in multiline objects/arrays
- Descriptive variable names

## Common Tasks

### Adding a New Export

1. Implement in appropriate `src/` module
2. Export from module's `index.ts`
3. Re-export from `src/index.ts`
4. Add TypeScript declaration in `types.ts` if needed
5. Add tests
6. Update README if user-facing

### Adding a Query Builder Method

1. Add method to `QueryBuilder` class in `src/query/builder.ts`
2. Add type to `QueryBuilder` interface in `src/types.ts`
3. Add tests in `test/query-builder.test.js`

### Adding an Error Classifier

1. Add PostgreSQL error code to `TRANSIENT_ERROR_CODES` or similar in `src/client/errors.ts`
2. Export classifier function
3. Add to `types.ts` declarations
4. Add tests in `test/errors.test.js`

### Updating Configuration

1. Modify `loadDatabaseConfig()` in `src/client/config.ts`
2. Add environment variable mapping
3. Update README configuration table
4. Add tests in `test/config.test.js`

## Pull Request Process

1. **Fork** the repository
2. **Create a branch**: `git checkout -b feature/your-feature`
3. **Make changes** following guidelines above
4. **Run validation**: `npm run typecheck && npm test && npm run build`
5. **Update CHANGELOG.md** with your changes (under `## [Unreleased]`)
6. **Submit PR** with clear description of changes

### PR Checklist

- [ ] TypeScript compiles without errors (`npm run typecheck`)
- [ ] All tests pass (`npm test`)
- [ ] New code has tests
- [ ] CHANGELOG.md updated
- [ ] No new runtime dependencies
- [ ] No credential/parameter logging by default
- [ ] Backward compatible (no breaking changes)

## Release Process (Maintainers)

```bash
# 1. Update CHANGELOG.md with release notes
# 2. Bump version in package.json (semver)
# 3. Run full validation
npm run typecheck && npm test && npm run build && npm run pack:check

# 4. Commit and tag
git commit -am "chore: release v1.0.1"
git tag v1.0.1

# 5. Publish
npm publish --access public
git push origin main --tags
```

## Getting Help

- **Issues**: https://github.com/mayank040902/oneunit/issues
- **Discussions**: https://github.com/mayank040902/oneunit/discussions

## Code of Conduct

Be respectful, inclusive, and constructive. See [GitHub Community Guidelines](https://docs.github.com/en/site-policy/github-terms/github-community-guidelines).

---

**First time contributing?** Look for `good first issue` labels on GitHub, or start by improving documentation/tests.