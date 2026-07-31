# Testing

Read this before adding any new `lib/*.ts` logic, a new API route, or a schema change — including the still-upcoming form-scoring-fields feature.

## Runner & where tests live

Vitest, run via `npm test` (`vitest run`) / `npm run test:watch` (`vitest`, watch mode). Tests are **colocated** with the code they cover — `src/lib/forms.ts` → `src/lib/forms.test.ts` — not in a mirrored top-level tree. `lib/*.ts` is where nearly all the business logic and edge cases live (see `docs/architecture.md`), so that's almost always where a test belongs; routes and pages are thin wrappers and rarely need their own test (see "When a route-level test is worth it" below).

## The DB harness — real SQLite, not mocked Prisma

Tests run against a real, disposable `prisma/test.db`, not a mocked Prisma client. This is deliberate: a lot of this codebase's correctness lives in DB-level constraints — `activeDateKey`/`previousFormId`'s nullable-unique trick, `Session`'s cascade delete on account deactivation (see `docs/database.md`) — and mocking Prisma would hide exactly the bugs most worth catching.

How it works, so you don't need to reconfigure anything:

- `test/global-setup.ts` runs once before the whole run: deletes any existing `prisma/test.db` and rebuilds it from scratch via `scripts/migrate.cjs` (same hand-written SQL migrations the real db uses — see `docs/database.md`'s migration workflow before adding a migration).
- `test/setup-env.ts` runs before each test file's imports resolve, pointing `DATABASE_URL` at `prisma/test.db`. `src/lib/prisma.ts`'s singleton picks this up automatically — you don't import a different Prisma client in tests, just `import { prisma } from "@/lib/prisma"` as usual.
- Call `resetDb()` from `test/reset-db.ts` in an `afterEach` in any DB-backed test file, for isolation between test cases.

A minimal DB-backed test file looks like:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "../../test/reset-db";
import { prisma } from "./prisma";
// ...import the lib functions under test

afterEach(async () => {
  await resetDb();
});

describe("...", () => {
  it("...", async () => {
    // arrange via the real lib functions or prisma.*.create(...) directly,
    // act, assert against prisma.*.findMany/findFirst or the function's return value
  });
});
```

See `src/lib/accounts.test.ts` for a worked example (account create/authenticate, deactivation cutting off sessions, rename not rewriting audit log snapshots).

## The attendance-query feature (implemented — `src/lib/attendance-query.ts`)

`queryAttendanceByMonth(month)` is the query layer: given `"YYYY-MM"`, it returns every current-version *approved* record in that month. The highest-risk logic here is exactly what was flagged before this was built: "only approved data, and at most one row per date." `src/lib/attendance-query.test.ts` tests this directly against fixture data that includes a void/resubmit version chain (an old `voided` form plus a newer `approved` one for the same date) and asserts the query returns exactly the approved one — see that file for the worked example. It also covers a date still `draft`/`pending_review` (excluded), a terminated person's records within the month (still included), and month-boundary exclusion (adjacent months' dates must not leak in via the `date` string's `startsWith` filter).

The presentation-layer filtering (`src/app/attendance-query/filters.ts`) — deriving person/category dropdown options from the fetched month's rows, filtering rows by exact person/category match, and computing the category subtotal — is pure logic with no DB dependency, so it's tested separately in `filters.test.ts` without `resetDb()`/fixtures, following the same colocated-test convention.

## The exclude-unfilled feature (implemented — `src/lib/attendance-records.ts`)

`isFilledRecord()` is a one-line shared predicate (`categoryId !== null`) used by both `getFormWithRecords()` (`forms.ts`) and `queryAttendanceByMonth()` (`attendance-query.ts`) to hide unfilled records from what's returned — see `docs/2026-07-31-attendance-exclude-unfilled/spec.md` for why (submit/approve are intentionally not blocked by incomplete data; the DB rows are never deleted, only filtered out of these two read paths).

The highest-risk part isn't the predicate itself, it's **which status it's applied to**. `getFormWithRecords()` must only filter when `status === "pending_review"` — `draft`/`rejected` have to keep returning the full list, or the foreman loses the ability to see and fill in exactly the rows that need fixing. When testing a fix or change here, cover both sides symmetrically: a form left with an unfilled person after **rejection** and after **void-and-resubmit** should both (a) show the unfilled person again once back in an editable status, and (b) show up correctly in `queryAttendanceByMonth` once filled in and re-approved. An early review of this feature caught exactly this asymmetry — the reject path only had case (a) covered, not (b) — see `src/lib/attendance-query.test.ts`'s `'includes a person after their previously-未填 record is filled in following a rejection'` for the case that closed the gap.

## AttendanceRecord is keyed by personId, not employeeId (see `docs/database.md`)

`AttendanceRecord.personId` references `Person.id` (surrogate key), never `Person.employeeId`. When testing anything that touches `AttendanceRecord` — `createDailyForm`, `saveFormRecords`, `voidAndResubmitForm`, `getFormWithRecords`, `queryAttendanceByMonth` — the case worth asserting explicitly is: **update `Person.employeeId` directly via `prisma.person.update()` after records already exist, then re-read through the function under test, and confirm the new `employeeId` shows up with zero changes to any `AttendanceRecord` row.** See `src/lib/forms.test.ts`'s `'shows the corrected employeeId in getFormWithRecords without touching AttendanceRecord'` and the equivalent case in `src/lib/attendance-query.test.ts` for the pattern — this is the entire point of the `personId` design (`docs/2026-07-31-attendance-record-personid-migration/spec.md`), so a change here that breaks it silently defeats the migration.

The other thing worth re-checking after touching this area: `activeKey` (`"${personId}:${date}"`) uniqueness must still hold across a full void-and-resubmit cycle (approve → void → resubmit → approve again) — exactly one non-voided `AttendanceRecord` per `personId`+`date` at any point. The existing version-chain tests in `forms.test.ts`/`attendance-query.test.ts` already cover this; don't remove that coverage when refactoring.

## Adding tests for form-scoring fields

If this changes `prisma/schema.prisma`, write the migration first per `docs/database.md`, then:
- Test the new field's constraints/defaults in isolation (what happens when it's omitted, what the default is, any validation `lib/forms.ts` adds).
- Re-run (or extend) the existing draft → submit → approve/reject → void-and-resubmit transition tests to confirm they're unaffected by the new field — this is the regression that's easy to introduce silently when a schema change touches `AttendanceForm`/`AttendanceRecord`.

## When a route-level test is worth it

Rare, but worth it when adding a new protected `app/api/**/route.ts`: a quick test hitting the route and asserting `401` with no session / `403` with the wrong role. This isn't about re-testing `lib/*.ts` logic (already covered), it's specifically to catch "forgot to call `requireAuth`/`requireRole` before doing anything" — a cheap mistake with real security consequences (see `docs/auth.md`).
