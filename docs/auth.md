# Auth & Sessions

Read this before adding a new API route, page, or anything that touches who's logged in / what they're allowed to do.

## Model

Two roles only: `developer` (full access — approve/reject/void, category/account management, all queries) and `foreman` (open/edit today's draft or rejected form, submit). Person management (`/api/persons` create, `/api/persons/[employeeId]` soft-delete, and the SFT-report import under `/api/persons/import/*`) is **not** developer-exclusive — both roles can perform it (`docs/2026-08-07-person-import-sft/spec.md` FR-7/FR-8). There is no field-level permission system, no MFA, no self-service password reset — see the feature's `spec.md` (`docs/2026-07-29-admin-login-permission/` in the sibling `spec-plan` repo) if you need the original rationale before changing scope.

Session is a DB-backed opaque token (`Session.id`), not a JWT — stored in an httpOnly cookie named `sid`, 8h fixed TTL, no "remember me". Deactivating a `User` (`isActive = false`) or deleting their sessions takes effect immediately on their *next* request; there's no separate revocation list to maintain.

## The one place all auth logic lives: `src/lib/auth.ts`

Every protected API route must call one of these at the top of its handler, before touching any data:

- `await requireAuth()` — any logged-in, active user. Throws `AppError(401, ...)` otherwise.
- `await requireRole("developer")` — logged in **and** that specific role. Throws `AppError(403, ...)` otherwise.
- `await requireRole(["foreman", "developer"])` — logged in **and** the session's role is one of the listed roles (`role` accepts a single `UserRole` or a `UserRole[]`, added for the person-import feature — see `docs/2026-08-07-person-import-sft/plan.md` 技術決策記錄 #2).

Both read the session via `next/headers` `cookies()` — no `req` parameter needed, since Route Handlers have request-scoped cookie access automatically. `AppError` is caught by `withErrorHandling` (`src/lib/api-handler.ts`) and turned into the right JSON status — you don't need your own try/catch.

**Do not** re-implement cookie parsing, role comparisons, or session lookups in a route file — if `lib/auth.ts` is missing something you need (e.g. a new role, a new check), extend it there so every route benefits, per this project's NFR-3 (centralized permission checks).

## `src/proxy.ts` is a UX shortcut, not the security boundary

This Next.js version renamed `middleware.ts` → `proxy.ts` (see `AGENTS.md` — this is not the Next.js you know, check `node_modules/next/dist/docs/` for anything that looks unfamiliar). `proxy.ts` only checks whether the `sid` cookie is *present* and redirects to `/login` if not — it deliberately does not hit the database (Next's own guidance: keep Proxy fast, no DB calls). It will not catch a deactivated account or an expired session; that's what `requireAuth`/`requireRole` in each API route are for. Never assume a page is protected just because Proxy's matcher covers it — the API behind it still needs its own `requireAuth`/`requireRole` call.

Client pages call the shared `authFetch` helper (`src/lib/auth-client.ts`) instead of raw `fetch` for anything protected — on a `401` it force-navigates to `/login`, covering the case where Proxy let a stale page through but the API correctly rejected it.

## Operator identity is not user input

Every audit-logged action (submit/approve/reject/void/save-draft) used to take a manually-typed `operatorName` field. That's gone — routes now derive it from `requireAuth()`'s/`requireRole()`'s returned session (`session.user.displayName`) and pass that into `lib/forms.ts`. `AuditLog.operatorName` is stored as a plain string snapshot at write time (not an FK), so renaming a `User.displayName` later never rewrites past audit rows — see `docs/database.md` for the schema side of this.

If you add a new mutating route, follow the same pattern: get `user.displayName` from the session, pass it down to the `lib/*.ts` function, don't accept it from the request body.

## Not every GET is `requireAuth`-only — check the spec, don't assume

Most lookup-list GET routes (`/api/categories`, `/api/compliance-ratings`, etc.) only call `requireAuth()` — any logged-in role can view, only writes need `requireRole("developer")`. `/api/category-score-rules` and `/api/overtime-score-rules` (`docs/2026-08-04-attendance-scoring-rules`) break this convention on purpose: both GET and write handlers call `requireRole("developer")`, so a `foreman` gets 403 even on a read. This was an explicit spec decision (AC-11), not an oversight — when adding a new route, check whether its spec says reads should be role-gated too rather than defaulting to the more common `requireAuth`-only shape.

## `/api/public/**` — routes that call neither `requireAuth` nor `requireRole` at all

`/api/public/score-board/by-month` (backing the `/board` public leaderboard page, `docs/2026-08-14-employee-score-dashboard`) is the first route in this codebase that skips auth entirely, not just relaxes it from `requireRole` down to `requireAuth`. This is a confirmed product decision (spec NFR-1: the scored group is small and the data isn't treated as confidential in this context), not a missing check — the route has a comment pointing back at that spec so it doesn't get "fixed" by someone adding `requireAuth()` later without re-reading why it's absent. The `/api/public/` path prefix is the convention going forward for this category: if you add another genuinely public route, put it under that prefix and pair it with (a) a `src/proxy.ts` matcher exclusion (see `docs/architecture.md`) and (b) a comment citing the spec that authorized skipping auth — don't leave the absence of `requireAuth()` unexplained in the route file.
