# Testing

Read this before adding any new `lib/*.ts` logic, a new API route, or a schema change — including the search/query feature and the form-scoring-fields feature.

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

## Adding tests for the search/query feature

The highest-risk logic to get wrong is exactly what was discussed when designing it: "only approved data, and at most one row per date." Test this directly against fixture data that includes a void/resubmit version chain, not just a single flat form per date — e.g. seed a date with an old `voided` form plus a newer `approved` one (mirrors the manual verification already done for this feature; see chat history / `docs/database.md`) and assert the query returns exactly the approved one, not both, and not the voided one. Also cover a date that's still `draft`/`pending_review` (no approved form yet) returning nothing for that date.

## Adding tests for form-scoring fields

If this changes `prisma/schema.prisma`, write the migration first per `docs/database.md`, then:
- Test the new field's constraints/defaults in isolation (what happens when it's omitted, what the default is, any validation `lib/forms.ts` adds).
- Re-run (or extend) the existing draft → submit → approve/reject → void-and-resubmit transition tests to confirm they're unaffected by the new field — this is the regression that's easy to introduce silently when a schema change touches `AttendanceForm`/`AttendanceRecord`.

## When a route-level test is worth it

Rare, but worth it when adding a new protected `app/api/**/route.ts`: a quick test hitting the route and asserting `401` with no session / `403` with the wrong role. This isn't about re-testing `lib/*.ts` logic (already covered), it's specifically to catch "forgot to call `requireAuth`/`requireRole` before doing anything" — a cheap mistake with real security consequences (see `docs/auth.md`).
