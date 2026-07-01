import { Inject, Injectable } from "@nestjs/common";
import {
  FailureArtifactsRepository,
  type FailureArtifactRow,
  type MysqlPool
} from "@newsdata/db";
import { MYSQL_POOL } from "../database/database.tokens.js";

@Injectable()
export class FailureLogsService {
  constructor(@Inject(MYSQL_POOL) private readonly pool: MysqlPool) {}

  async list(input: {
    limit?: number;
    offset?: number;
  }): Promise<{ items: FailureArtifactRow[]; total: number }> {
    const repository = new FailureArtifactsRepository(this.pool);
    const [items, total] = await Promise.all([
      repository.list(input),
      repository.count()
    ]);

    return { items, total };
  }
}
