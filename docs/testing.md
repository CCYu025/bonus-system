# Testing

Read this before adding any new `lib/*.ts` logic, a new API route, or a schema change.

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

## The attendance-extended-fields feature (implemented — `src/lib/compliance-ratings.ts`, `src/lib/three-s-performance.ts`, `src/lib/forms.ts`)

Adds four nullable columns to `AttendanceRecord` (`overtimeHours`, `complianceRatingId`, `threeSPerformanceId`, `actualQuantity`) plus two new lookup tables — see `docs/database.md`'s schema-shape section and `docs/2026-08-01-attendance-extended-fields/spec.md` for the AC this satisfies.

`compliance-ratings.test.ts` / `three-s-performance.test.ts` mirror `categories.test.ts`'s shape (list/create/update/404), plus an explicit assertion that created records carry no `score`/`weight` field — that's out of scope until a future weighting feature exists, and the test exists specifically to catch someone adding one prematurely.

`forms.test.ts` covers the two behaviors that matter most for this feature:
- **Format validation** in `saveFormRecords`: `actualQuantity` must be a positive integer, `overtimeHours` must be 1–10 — both reject with a 400 otherwise (zero, negative, and non-integer values are all tested).
- **The 未填-locks-everything invariant**: whenever a change's `categoryId` is `null`, `saveFormRecords` force-nulls the other four columns and `note`, regardless of what the caller sent. This is tested in both directions — a change where `categoryId` is already `null` with the other fields populated in the same request, and a change that flips an already-filled row's `categoryId` back to `null`. `voidAndResubmitForm` is also tested to confirm these four fields carry across a void/resubmit cycle, same as `categoryId`/`note` always did — easy regression to introduce silently since that function's `create` mapping lists fields explicitly.

If you touch any of these five columns again, keep both of the above tested together — they're two different rules (format vs. lock) that happen to live in the same code path.

## The leave-lock / SOP field feature (implemented — `src/lib/sop-performance.ts`, `src/lib/forms.ts`)

Adds a second lock tier (`AttendanceCategory.locksExtendedFields`), a fifth extra `AttendanceRecord` column (`sopPerformanceId`), and an `isLocked` protected-row pattern on `ThreeSPerformance`/`SopPerformance` — see `docs/database.md`'s schema-shape section and `docs/2026-08-03-attendance-leave-lock-sop-field/spec.md`.

**If you add a new lookup table with an `isLocked` column, remember `test/reset-db.ts`.** It deletes rows table-by-table in FK order; a new table not added there won't be cleared between tests, and the *second* test that tries to create a fixture row with a `code` used by an earlier test's leftover row will fail on the unique constraint — not an obviously-related error message. This actually happened while building `sop-performance.test.ts` (17 failing tests, all `業務代碼 NORMAL 已存在`) until `sopPerformance.deleteMany()` was added.

`forms.test.ts` covers three things specific to this feature, each worth keeping distinct when you touch this area again:
- **`softLocked` vs `hardLocked`**: a leave-locked category (`seedLeaveCategory()`, `locksExtendedFields: true`) clears the five scoring/quantity columns but *not* `note`; an unfilled (`categoryId: null`) row clears all six. Test both transitions (unlocked→leave-locked, and the leave-locked API-bypass case) and assert `note` behaves differently between the two.
- **Auto-default on unlock** (`seedLockedThreeSPerformance()`/`seedLockedSopPerformance()`, `isLocked: true`): switching a row from either locked state to an unlocked category defaults `threeSPerformanceId`/`sopPerformanceId` to the `isLocked` option's id *only if the caller left them `null`* — cover the "caller explicitly specified a different value" case too, since that's the one most likely to get silently broken by an overzealous default.
- **No retroactive backfill**: simulate a pre-feature row via `prisma.attendanceRecord.updateMany()` (bypassing `saveFormRecords`) with a non-null `categoryId` but `threeSPerformanceId: null`, then confirm a `saveFormRecords` call that doesn't touch `categoryId` (e.g. only `note`) leaves it `null` — the auto-default only fires on an actual lock→unlock transition, not just "row happens to be unlocked already."

`sop-performance.test.ts` mirrors `three-s-performance.test.ts`'s shape (list/create/update/404/no-score-field), plus both files got a matching pair of `isLocked` guard tests (`rejects editing…`, `rejects deactivating…`) and a regression test confirming non-locked rows are still fully editable.

## When a route-level test is worth it

Rare, but worth it when adding a new protected `app/api/**/route.ts`: a quick test hitting the route and asserting `401` with no session / `403` with the wrong role. This isn't about re-testing `lib/*.ts` logic (already covered), it's specifically to catch "forgot to call `requireAuth`/`requireRole` before doing anything" — a cheap mistake with real security consequences (see `docs/auth.md`).
