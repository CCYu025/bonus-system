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

`src/app/categories/page.tsx` is a tab shell over three structurally-identical lookup lists (`AttendanceCategory`, `ComplianceRating`, `ThreeSPerformance`), rendered by a shared `LookupListPanel` (`src/app/categories/lookup-list-panel.tsx`). The three lists are *not* equally editable — `AttendanceCategory` is intentionally locked to seed-only + toggle (see `docs/database.md`'s schema-shape section), so `LookupListPanel` takes a `mode: "readonly" | "editable"` prop rather than assuming every lookup list gets the same CRUD surface. If you add a fourth lookup list here, decide its mode deliberately instead of defaulting to `"editable"`.
