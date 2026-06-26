import mysql from "mysql2/promise";

export interface MysqlConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export function createMysqlPool(config: MysqlConfig): mysql.Pool {
  return mysql.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: true,
    timezone: "Z"
  });
}

export type MysqlPool = mysql.Pool;
export type MysqlConnection = mysql.PoolConnection;
