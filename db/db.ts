import { Pool } from 'npm:@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';

const pool = new Pool({
    connectionString: Deno.env.get("POSTGRES_DEFAULT_CONNSTRING") as string
});

const db = drizzle({
    client: pool
})


export default db;