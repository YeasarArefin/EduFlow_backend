# EduFlow backend database workflow

The local database is PostgreSQL 17 managed by Docker Compose. From the repository root, start it with:

```text
docker compose up -d postgres
```

Copy `backend/.env.example` to `backend/.env` before running commands. The example is configured for the Docker database (`localhost:5433`). `DATABASE_URL` may be overridden in the shell for another local database.

Run database setup from `backend/`:

```text
npm run db:generate -- --name <migration_name>
npm run db:migrate
npm run db:seed
npm run db:check
```

`db:generate` creates a Drizzle migration from the current schema and should be run only after a schema change. `db:migrate` applies all pending migrations and is safe to repeat. `db:seed` upserts fixed workspace roles and permissions and, only when `NODE_ENV=development`, creates or refreshes the local Platform Owner account. `db:check` builds the backend and runs the live PostgreSQL connectivity check.

For the common setup path, use `npm run db:setup`, which applies migrations and then seeds reference data.

## Development Platform Owner

After `npm run db:seed` or `npm run db:setup` in development, sign in with:

```text
Email: admin@admin.com
Password: 123456789789
```

This account is linked to the existing `platform_owners` singleton and routes to `/platform`. It is never created when `NODE_ENV` is `test` or `production`; these credentials are for local development only.

The full verification suite is `npm test`; it includes the constraint and RLS integration tests and requires the Docker PostgreSQL database to be running.
