import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";
let pool = null;
let db = null;
export function getPool(connectionString = process.env.DATABASE_URL) {
    if (!connectionString) {
        throw new Error("DATABASE_URL is required");
    }
    if (!pool) {
        pool = new Pool({
            connectionString
        });
    }
    return pool;
}
export function getDb(connectionString = process.env.DATABASE_URL) {
    if (!db) {
        db = drizzle(getPool(connectionString), {
            schema
        });
    }
    return db;
}
export async function closeDb() {
    if (pool) {
        await pool.end();
        pool = null;
        db = null;
    }
}
export { schema };
//# sourceMappingURL=client.js.map