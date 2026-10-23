import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// Every test file starts with the real schema, built from the migration files.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
