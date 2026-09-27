# Contributing

## Setup

```bash
npm install
```

## Checks

```bash
npm test
npm run typecheck
npm run lint
```

## Package layout

- `src/` — KafkaJS wrappers
- `src/adapters/` — logger, config, and codec adapters
- `test/` — Node.js built-in test runner cases
- `examples/` — standalone, framework, and codec usage

Keep KafkaJS as the only runtime dependency. Other concerns must go through adapters:

```javascript
createLoggerAdapter(frameworkLogger);
createConfigAdapter(source);
createCodecAdapter({ encode, decode });
```
