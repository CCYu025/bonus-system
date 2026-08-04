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

- `npm run db:seed` (`scripts/seed.cjs`): idempotent, seeds the five default `attendance_category` rows, marks the leave-type ones' `locksExtendedFields = true`, and ensures a single `isLocked = true` "正常" row exists in `three_s_performance`/`sop_performance` (reusing an existing hand-created one by name if present — see schema-shape section above).
- `npm run db:seed:admin` (`scripts/seed-admin.cjs`): idempotent, creates the single seed `developer` account (default `admin`/`admin1234`, override via `ADMIN_USERNAME`/`ADMIN_PASSWORD`/`ADMIN_DISPLAY_NAME` env vars).

Both scripts talk to `prisma/dev.db` directly via `better-sqlite3`, not through Prisma Client — they exist specifically to work around the blocked migration engine, so keep them dependency-free (no Prisma Client, no TS transpilation) if you add more.

## Schema shape

- `Person` (工號/人員) ↔ `AttendanceRecord` ↔ `AttendanceCategory` — lookup relations, with one deliberate exception: `AttendanceRecord.personId` references `Person.id` (the surrogate key), **not** `Person.employeeId` (the business/natural key). This is intentional — `employeeId` and `name` are correctable business attributes (typos happen), while `id` never changes once a `Person` row exists. Because every `AttendanceRecord` joins through `personId`, correcting a typo'd `employeeId` or `name` on `Person` retroactively fixes every past query result (`getFormWithRecords`, `queryAttendanceByMonth`) with zero writes to `AttendanceRecord` — see `docs/2026-07-31-attendance-record-personid-migration/spec.md` for the full rationale. If you add a new table that needs to reference a person, default to `personId → Person.id`, not `employeeId`, unless you have a specific reason not to.
- `AttendanceForm` — one row per day-and-version. `status`: `draft → pending_review → approved | rejected`, and `approved → voided` (see below).
- `AuditLog` — append-only action trail per form. `operatorName` is a **plain string snapshot**, not an FK to `User`. This is deliberate: renaming a `User.displayName` must never retroactively change history, so every write captures the name as of that moment (see `docs/auth.md`).
- `User` / `Session` — login accounts and DB-backed sessions, unrelated to `Person` (different concept: login identity vs. payroll headcount).
- `ComplianceRating` / `ThreeSPerformance` / `SopPerformance` — lookup tables structurally identical to `AttendanceCategory` (`code`/`name`/`sortOrder`/`isActive`), but unlike it, open to add/edit through the UI's 配合度/3S表現/SOP表現 tabs (`src/lib/compliance-ratings.ts`, `src/lib/three-s-performance.ts`, `src/lib/sop-performance.ts`). `AttendanceCategory` stays deliberately locked to seed-only + toggle — see the comment in `src/lib/categories.ts` (renaming/adding a category is equivalent to adding a scoring-vocabulary term and needs code review) — so don't assume all four lookup lists should get the same CRUD surface if you touch this area again. `AttendanceRecord` carries five more nullable columns for a still-future weighting/scoring feature: `overtimeHours`, `complianceRatingId`, `threeSPerformanceId`, `sopPerformanceId`, `actualQuantity`. None of these (nor `note`) have any scoring logic today — see `docs/2026-08-01-attendance-extended-fields/spec.md` and `docs/2026-08-03-attendance-leave-lock-sop-field/spec.md`.
  - `AttendanceCategory.locksExtendedFields` (boolean, `scripts/seed.cjs` sets it `true` for 事假/病假/特休 only) marks a category as "leave-type" — see `docs/architecture.md`'s two-tier locking section for how this combines with the `categoryId === null` rule.
  - `ThreeSPerformance.isLocked` / `SopPerformance.isLocked` mark a single row (the seeded "正常" option) as a protected default-value source: `updateXxx` in the corresponding `lib/*.ts` refuses to edit or deactivate it (403), and there's no delete endpoint on either resource at all, so this row can't disappear once seeded. `scripts/seed.cjs` is careful to *reuse* an existing "正常" row if a developer already created one by hand through the UI before this feature shipped (matched by `name = '正常'`), rather than inserting a duplicate — see the seed script's comments if you're re-running seed logic reasoning.
  - Invariant enforced in `saveFormRecords` (app-level, not a DB constraint): whenever a record's `categoryId` is `null`, all five extra columns above plus `note` are force-nulled on write; when `categoryId` points at a `locksExtendedFields=true` category, only the five extra columns are force-nulled (`note` stays writable). This is the only place either lock rule is enforced — don't write these columns through any other path. The same function also auto-fills `threeSPerformanceId`/`sopPerformanceId` with the `isLocked` option when a row transitions from either locked state to unlocked without the caller specifying a value — see `docs/architecture.md` for the exact trigger condition (it's based on the row's *previous* `categoryId`, not just the new one).

## Version-chain / void-and-resubmit design

An approved form can be voided and resubmitted as a new draft, without losing the old one. This is implemented with two nullable-but-unique columns rather than a separate "is this the active version" flag:

- `previousFormId` (`@unique`) + self-relation `previousForm`/`nextForm`: forms a strictly linear chain (a form can be superseded at most once — no branching). Walk `previousForm`/`nextForm` to get full history for a date.
- `activeDateKey` (`String? @unique`, value = the form's `date` while live, `null` once voided): SQLite/Postgres unique indexes allow multiple `NULL`s, so this enforces **at most one non-voided form per date** at the DB layer, not just in application code. Same pattern on `AttendanceRecord.activeKey` (`"${personId}:${date}"` while not voided — `personId`, not `employeeId`, so the key stays stable even if the person's `employeeId` is later corrected) enforces at most one active record per person+date.

Net effect: a given `date` can accumulate arbitrarily many `attendance_form` rows over repeated void/resubmit cycles, but only ever one of them is "live" at a time (`activeDateKey` non-null, typically also `status = 'approved'` or earlier in its own lifecycle). Any query that means "the data that currently counts" must filter on `status`/`activeDateKey`, not just `date` — grouping by `date` alone will double- or triple-count historical versions.
