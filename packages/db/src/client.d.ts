import { Pool } from "pg";
import * as schema from "./schema.js";
export declare function getPool(connectionString?: string | undefined): Pool;
export declare function getDb(connectionString?: string | undefined): import("drizzle-orm/node-postgres").NodePgDatabase<typeof schema> & {
    $client: Pool;
};
export declare function closeDb(): Promise<void>;
export { schema };
