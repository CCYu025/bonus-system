// T-14: creates the single seed developer account (idempotent) so the system
// can be logged into immediately after migration, before any other account exists.
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const { Client } = require("pg");

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  // `pg` doesn't read Prisma's `?schema=` query param on its own — set the
  // session's search_path explicitly so test/e2e runs (which use an
  // isolated schema, see test/db-url.ts) hit the right tables.
  const schema = new URL(databaseUrl).searchParams.get("schema");
  if (schema) {
    await client.query(`SET search_path TO "${schema}"`);
  }

  const now = () => new Date();

  const username = process.env.ADMIN_USERNAME ?? "admin";
  const password = process.env.ADMIN_PASSWORD ?? "admin1234";
  const displayName = process.env.ADMIN_DISPLAY_NAME ?? "系統管理員";

  const existing = await client.query(
    `SELECT id FROM "user" WHERE username = $1`,
    [username]
  );

  if (existing.rows.length > 0) {
    console.log(`skip (already exists): ${username}`);
  } else {
    const passwordHash = bcrypt.hashSync(password, 12);
    await client.query(
      `INSERT INTO "user" (id, username, "passwordHash", role, "displayName", "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'developer', $4, true, $5, $5)`,
      [crypto.randomUUID(), username, passwordHash, displayName, now()]
    );
    console.log(`seeded developer account: ${username} (password: ${password})`);
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
