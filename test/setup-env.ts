// Runs before each test file's own imports resolve, so src/lib/prisma.ts's
// module-load-time `process.env.DATABASE_URL` read picks this up instead of
// the dev schema — no application source code changes needed to redirect tests.
import { schemaScopedDatabaseUrl } from "./db-url";

process.env.DATABASE_URL = schemaScopedDatabaseUrl("test");
