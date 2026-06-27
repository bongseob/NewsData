import { Controller, Get, Inject } from "@nestjs/common";
import type { MysqlPool } from "@newsdata/db";
import { MYSQL_POOL } from "./database/database.tokens.js";

@Controller()
export class HealthController {
  constructor(@Inject(MYSQL_POOL) private readonly pool: MysqlPool) {}

  @Get("health")
  async health(): Promise<{ ok: true; db: "ok" }> {
    await this.pool.query("SELECT 1");
    return { ok: true, db: "ok" };
  }

  @Get()
  root(): string {
    return "NewsData Backend API is running.";
  }
}
