# Database & Migrations

Read this when touching `prisma/schema.prisma`, writing a migration, or working with `AttendanceForm`/`AttendanceRecord` version-chain logic.

## Migration workflow (non-standard — read before running any prisma migrate command)

On this machine, Windows Application Control policy blocks Prisma's native schema-engine binary, so `prisma migrate dev` / `db push` cannot run. Prisma Client generation (WASM-based) still works via `prisma generate`.

Instead:
1. Write the migration SQL by hand in `prisma/migrations/<timestamp>_<name>/migration.sql` (follow the exact CREATE TABLE / CREATE INDEX style of existing migrations — table names are `snake_case` via `@@map`, columns stay camelCase).
2. Update `prisma/schema.prisma` to match.
3. Run `npm run db:migrate` — this applies any `migration.sql` not yet recorded in a local `_applied_migrations` table (see `scripts/migrate.cjs`), it does not diff the schema for you.
4. Run `npx prisma generate` to regenerate `src/generated/prisma` (gitignored, must exist locally to build).

There is no `prisma migrate dev` shortcut here — always do both steps (hand-written SQL + `db:migrate` + `generate`).

## Seed scripts

- `npm run db:seed` (`scripts/seed.cjs`): idempotent, seeds the four default `attendance_category` rows.
- `npm run db:seed:admin` (`scripts/seed-admin.cjs`): idempotent, creates the single seed `developer` account (default `admin`/`admin1234`, override via `ADMIN_USERNAME`/`ADMIN_PASSWORD`/`ADMIN_DISPLAY_NAME` env vars).

Both scripts talk to `prisma/dev.db` directly via `better-sqlite3`, not through Prisma Client — they exist specifically to work around the blocked migration engine, so keep them dependency-free (no Prisma Client, no TS transpilation) if you add more.

## Schema shape

- `Person` (工號/人員) ↔ `AttendanceRecord` ↔ `AttendanceCategory` — plain lookup relations.
- `AttendanceForm` — one row per day-and-version. `status`: `draft → pending_review → approved | rejected`, and `approved → voided` (see below).
- `AuditLog` — append-only action trail per form. `operatorName` is a **plain string snapshot**, not an FK to `User`. This is deliberate: renaming a `User.displayName` must never retroactively change history, so every write captures the name as of that moment (see `docs/auth.md`).
- `User` / `Session` — login accounts and DB-backed sessions, unrelated to `Person` (different concept: login identity vs. payroll headcount).

## Version-chain / void-and-resubmit design

An approved form can be voided and resubmitted as a new draft, without losing the old one. This is implemented with two nullable-but-unique columns rather than a separate "is this the active version" flag:

- `previousFormId` (`@unique`) + self-relation `previousForm`/`nextForm`: forms a strictly linear chain (a form can be superseded at most once — no branching). Walk `previousForm`/`nextForm` to get full history for a date.
- `activeDateKey` (`String? @unique`, value = the form's `date` while live, `null` once voided): SQLite/Postgres unique indexes allow multiple `NULL`s, so this enforces **at most one non-voided form per date** at the DB layer, not just in application code. Same pattern on `AttendanceRecord.activeKey` (`"${employeeId}:${date}"` while not voided) enforces at most one active record per employee+date.

Net effect: a given `date` can accumulate arbitrarily many `attendance_form` rows over repeated void/resubmit cycles, but only ever one of them is "live" at a time (`activeDateKey` non-null, typically also `status = 'approved'` or earlier in its own lifecycle). Any query that means "the data that currently counts" must filter on `status`/`activeDateKey`, not just `date` — grouping by `date` alone will double- or triple-count historical versions.
