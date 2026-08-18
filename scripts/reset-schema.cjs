// Drops and recreates the Postgres schema named by DATABASE_URL's `schema`
// query param (default "public"), then leaves the database empty for
// `prisma migrate deploy` to rebuild from prisma/migrations/*. Used by
// test/global-setup.ts and e2e/global-setup.ts to get a clean slate on every
// run, same intent as the old SQLite pattern of deleting and rebuilding a
// disposable .db file.
const { Client } = require("pg");

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }
  const schema = new URL(databaseUrl).searchParams.get("schema") || "public";

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.end();
  console.log(`reset schema "${schema}".`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
