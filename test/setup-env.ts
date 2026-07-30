// Runs before each test file's own imports resolve, so src/lib/prisma.ts's
// module-load-time `process.env.DATABASE_URL` read picks this up instead of
// dev.db — no application source code changes needed to redirect tests.
process.env.DATABASE_URL = "file:./prisma/test.db";
