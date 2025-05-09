// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dbCredentials: {
    url: Deno.env.get("POSTGRES_DEFAULT_CONNSTRING") as string
  },
  dialect: "postgresql",
  schema: "db/schema/*",
  out: "db/migrations",
});

