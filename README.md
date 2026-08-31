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

`db:generate` creates a Drizzle migration from the current schema and should be run only after a schema change. `db:migrate` applies all pending migrations and is safe to repeat. `db:seed` upserts fixed workspace roles and permissions and is safe to repeat. `db:check` builds the backend and runs the live PostgreSQL connectivity check.

For the common setup path, use `npm run db:setup`, which applies migrations and then seeds reference data.

The full verification suite is `npm test`; it includes the constraint and RLS integration tests and requires the Docker PostgreSQL database to be running.
