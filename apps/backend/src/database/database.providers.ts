import { createMysqlPool, type MysqlPool } from "@newsdata/db";
import { getNumberEnv, requireEnv } from "../config/env.js";
import { MYSQL_POOL } from "./database.tokens.js";

export const databaseProviders = [
  {
    provide: MYSQL_POOL,
    useFactory(): MysqlPool {
      return createMysqlPool({
        host: requireEnv("MYSQL_HOST"),
        port: getNumberEnv("MYSQL_PORT", 3306),
        user: requireEnv("MYSQL_USER"),
        password: requireEnv("MYSQL_PASSWORD"),
        database: requireEnv("MYSQL_DATABASE")
      });
    }
  }
];
