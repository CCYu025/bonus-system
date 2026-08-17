# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

- `npm run dev` — dev server (Turbopack)
- `npm run build` — production build (also type-checks)
- `npx tsc --noEmit` — type-check only
- `npm run lint` — ESLint (flat config, `eslint-config-next`)
- `npm run db:migrate` — apply any pending hand-written SQL migrations (does **not** diff schema — see `docs/database.md` first)
- `npm run db:seed` — seed default attendance categories (idempotent)
- `npm run db:seed:admin` — seed the one developer login account (idempotent)
- `npm test` — run the test suite once (Vitest, against a disposable `prisma/test.db`)
- `npm run test:watch` — Vitest watch mode
- `npm run test:e2e` — Playwright (real-browser layout checks only, e.g. sticky/scroll behavior — see `docs/testing.md`; against a separate disposable `prisma/e2e.db`, not wired into `npm test`)

## Before you touch these areas, read the matching doc

Each doc below covers one concern in depth — read the one relevant to your task rather than assuming; don't re-derive schema or auth behavior from partial context.

| Doc | Read it before... |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Adding/changing any page or `/api` route, or anything about error handling conventions |
| [docs/database.md](docs/database.md) | Touching `prisma/schema.prisma`, writing a migration, or working with `AttendanceForm` version/void-resubmit logic |
| [docs/auth.md](docs/auth.md) | Adding a protected route, changing roles/permissions, or touching sessions/login |
| [docs/testing.md](docs/testing.md) | Adding a test for new or existing logic, or setting up test data |

## Workflow discipline

New-feature work in this project is expected to go through the `spec → plan → implement → verify` process defined in the sibling `spec-plan` repo's `CLAUDE.md` (`docs/YYYY-MM-DD-{slug}/spec.md` with confirmed AC, then `plan.md`, before implementation). If you're asked to build a feature of any real size and no `spec.md`/`plan.md` exists yet for it, say so before writing code.

**Never commit directly to `main`/`master`.** All work happens on a `feat/YYYY-MM-DD-{slug}` branch, landed via a pull request on GitHub (https://github.com/CCYu025/bonus-system) — never push straight to the default branch, even for small fixes.
