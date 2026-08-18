import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  var __prisma: PrismaClient | undefined;
}

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  // @prisma/adapter-pg talks to `pg` directly and, unlike the native schema
  // engine, does not read the `?schema=` query param off the connection
  // string on its own — it must be passed as an explicit option (see
  // test/db-url.ts, which is what sets `?schema=` for test/e2e runs).
  const schema = connectionString
    ? (new URL(connectionString).searchParams.get("schema") ?? undefined)
    : undefined;
  const adapter = new PrismaPg({ connectionString }, schema ? { schema } : undefined);
  return new PrismaClient({ adapter });
}

export const prisma = globalThis.__prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
