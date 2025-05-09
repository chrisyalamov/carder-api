// src/migrate.ts

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from 'npm:@neondatabase/serverless';
import { migrate } from 'drizzle-orm/neon-http/migrator';

const sql = neon(Deno.env.get("POSTGRES_DEFAULT_CONNSTRING")!);
const db = drizzle(sql);

const main = async () => {
  try {
    await migrate(db, { migrationsFolder: './db/migrations' });
    console.log('Migration completed');
  } catch (error) {
    console.error('Error during migration:', error);
  }
};

main();