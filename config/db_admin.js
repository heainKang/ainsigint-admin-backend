import dotenv from "dotenv";
dotenv.config();
import { Pool } from "pg";

const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE_ADMIN
});
  
export const db_admin = pool;