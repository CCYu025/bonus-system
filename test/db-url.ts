// Derives an isolated Postgres connection string for a given test run by
// pinning the `schema` query param on the base DATABASE_URL (e.g. the CI
// postgres service's connection string, or a developer's local Postgres).
// Shared by test/setup-env.ts and test/global-setup.ts so both compute the
// exact same URL for a given schema name.
export function schemaScopedDatabaseUrl(schema: string): string {
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error(
      "DATABASE_URL is not set — point it at a running Postgres instance (see docs/database.md)."
    );
  }
  const url = new URL(base);
  url.searchParams.set("schema", schema);
  return url.toString();
}
