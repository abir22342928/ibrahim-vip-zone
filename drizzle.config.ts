import { defineConfig } from "drizzle-kit";

// Reads DATABASE_URL from the environment, so the same config works locally
// (127.0.0.1) and in production (Render internal Postgres URL).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
  },
});
