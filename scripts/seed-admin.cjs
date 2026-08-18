// T-14: creates the single seed developer account (idempotent) so the system
// can be logged into immediately after migration, before any other account exists.
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const { Client } = require("pg");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

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
