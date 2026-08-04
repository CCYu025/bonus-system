# App Architecture

Read this for the overall request flow and the conventions every route/page follows. See `docs/database.md` for schema/migration details and `docs/auth.md` for the auth layer specifically.

## This is not the Next.js you know

The installed Next.js version has breaking changes from what training data assumes — most notably `middleware.ts` is renamed `proxy.ts` (exported function `proxy`, not `middleware`; see `src/proxy.ts` and `docs/auth.md`). Before using any App Router API you're not certain about, check `node_modules/next/dist/docs/` rather than assuming past-Next.js behavior.

## Layering

- `src/app/**/page.tsx` — all pages are `"use client"` components. There are no Server Components fetching data; every page mounts, then calls a `/api/*` route via `fetch`/`authFetch` in a `useEffect`. If you add a page, follow this pattern (client component + effect-driven fetch) rather than introducing a Server Component data-fetching path — the two don't currently coexist here and mixing them changes how auth/session checks need to work.
- `src/app/api/**/route.ts` — thin: call the relevant `lib/auth.ts` guard, parse the request, delegate to a `lib/*.ts` function, return its result. Wrap the whole handler body in `withErrorHandling(async () => { ... })` from `src/lib/api-handler.ts` — it turns a thrown `AppError(status, message)` into the matching JSON response and anything else into a generic 500. Don't hand-roll `NextResponse.json` error branches in a route file.
- `src/lib/*.ts` — the actual business logic and Prisma queries, one file per resource (`forms.ts`, `persons.ts`, `categories.ts`, `accounts.ts`, `auth.ts`). Routes should stay thin enough that this is where you'd look to understand what an action actually does.
- `src/lib/prisma.ts` — single `PrismaClient` instance (via `@prisma/adapter-better-sqlite3`), cached on `globalThis` in dev to survive hot reload. Import `{ prisma }` from here; never construct a new client.

## Error handling convention

`AppError` (`src/lib/errors.ts`) is the only way routes signal a client-facing failure — `throw new AppError(404, "找不到表單")` etc. `isPrismaUniqueConstraintError(err)` is the helper for turning a Prisma P2002 into a friendlier `409`. Messages are user-facing Traditional Chinese strings; keep that convention for consistency with the existing UI.

## Form state machine

`AttendanceForm.status`: `draft → pending_review → approved | rejected`, and separately `approved → voided` (which spawns a new `draft` — see `docs/database.md`'s version-chain section). `EDITABLE_STATUSES` in `src/lib/forms.ts` (`draft`, `rejected`) gates which states allow record edits; check there before assuming a status allows a given mutation.

`getFormWithRecords()` (`src/lib/forms.ts`) filters out unfilled records (`categoryId === null`, via `src/lib/attendance-records.ts`'s `isFilledRecord`) from what it returns, but **only when `status === "pending_review"`**. Submit/approve are deliberately not blocked by incomplete records (see `docs/2026-07-31-attendance-exclude-unfilled/spec.md`), so an approved form can still contain unfilled rows in the DB — `draft`/`rejected` must keep returning the full list, or a foreman editing/fixing a form loses the ability to see and fill in the very rows that need it.

## Roles surfaced in the UI

`src/app/top-nav.tsx` fetches `/api/auth/me` on every route change to decide which nav links to show (`developer`-only links: supervisor approval queue, account management). This is UX only — it does not enforce anything; the actual enforcement is the `requireRole` call in the corresponding API route (see `docs/auth.md`).

## Lookup-list management pattern (`/categories`)

`src/app/categories/page.tsx` is a tab shell over four structurally-identical lookup lists (`AttendanceCategory`, `ComplianceRating`, `ThreeSPerformance`, `SopPerformance`), rendered by a shared `LookupListPanel` (`src/app/categories/lookup-list-panel.tsx`). The lists are *not* equally editable — `AttendanceCategory` is intentionally locked to seed-only + toggle (see `docs/database.md`'s schema-shape section), so `LookupListPanel` takes a `mode: "readonly" | "editable"` prop rather than assuming every lookup list gets the same CRUD surface. If you add another lookup list here, decide its mode deliberately instead of defaulting to `"editable"`.

Within an `"editable"` list, a single row can still be individually locked via `isLocked` (currently only `ThreeSPerformance`/`SopPerformance`'s seeded "正常" row) — `LookupListPanel` hides that row's 編輯/停用 buttons and shows a "系統鎖定" label instead, independent of the list's overall mode. This is a per-row lock, not a list-level mode; don't conflate it with `AttendanceCategory`'s readonly mode when reasoning about permissions here — see `docs/database.md`'s schema-shape section for why the "正常" row needs this and `src/lib/three-s-performance.ts`/`src/lib/sop-performance.ts` for the backend guard (`updateXxx` throws 403 if `existing.isLocked`).

## Two-tier field locking on the attendance form (`docs/2026-08-03-attendance-leave-lock-sop-field`)

The form's per-row lock started as a single rule ("未填 locks everything") and is now two tiers, both computed the same way in `src/lib/forms.ts`'s `saveFormRecords` and mirrored in `src/app/forms/[id]/page.tsx`:

- **`hardLocked`** — `categoryId === null` (未填). Locks *all six* extra fields, **including `note`**, and clears them to `null`.
- **`softLocked`** — `categoryId` points at an `AttendanceCategory` with `locksExtendedFields === true` (事假/病假/特休). Locks the *five* scoring/quantity fields (`overtimeHours`, `complianceRatingId`, `threeSPerformanceId`, `sopPerformanceId`, `actualQuantity`) but leaves **`note` editable** — a foreman still needs to write down the leave reason.

Whichever tier a row is in, the backend is the only enforced boundary (`saveFormRecords` force-nulls the locked fields regardless of what the client sends) — the frontend's `disabled` attributes are UX only, same convention as the original 未填 rule.

A row transitioning **out** of either locked tier (category changed to something with `locksExtendedFields === false`) auto-fills `threeSPerformanceId`/`sopPerformanceId` with each list's `isLocked` ("正常") option *if the caller didn't explicitly send a value* — but only when the row was actually locked *before* this change (`saveFormRecords` reads the record's current `categoryId` to decide this, not just the incoming `categoryId`). A save that doesn't touch `categoryId` at all (e.g. editing only `note`) never triggers this, so pre-existing `null` values from before this feature shipped stay `null` — see `docs/database.md` and `docs/testing.md` for the corresponding test coverage.

## Wide-table layout (`.table-scroll`)

The attendance form's record table has nine columns, two of which (`3S表現`/`SOP表現`) hold free-text option names that can be long sentences. Rather than truncating data, the table is wrapped in a `<div className="table-scroll">` (`overflow-x: auto`, defined in `globals.css`) so it scrolls horizontally instead of overflowing the page; the two long-text `<select>` elements additionally get a fixed `maxWidth` + `text-overflow: ellipsis` + a `title` attribute for the full value on hover. If you add another lookup-backed column with potentially long option text, follow this same pattern rather than letting the table grow unbounded.
