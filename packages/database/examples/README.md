# Examples

These scripts assume a reachable PostgreSQL instance.

```bash
export DATABASE_URL=postgresql://user:password@localhost:5432/app
node examples/basic.js
node examples/transactions.js
node examples/streaming.js
node examples/models.js
node examples/migrations.js
```

`basic.js` and `transactions.js` only run `SELECT` statements. `models.js` and `migrations.js` create example tables and are safe to re-run.
